import { MapView } from '../map/MapView';
import { AreaSelector } from '../map/AreaSelector';
import { boundsAreaKm2, boundsSizeMeters, DHAKA_EXTENT, MAX_AREA_KM2, validateSelection } from '../map/DhakaBounds';
import { SceneManager } from '../renderer/SceneManager';
import { serializeProject } from '../project/ProjectSerializer';
import { openProjectFile, saveProjectFile } from '../project/ProjectManager';
import type { Mesh, MeshStandardMaterial } from 'three';
import { LocalProjection } from '../data/CoordinateTransform';
import { buildGrid, estimateBuild, GRID_SIZE, partitionByCell } from '../data/WorldGrid';
import { generateCity } from '../generator/CityGenerator';
import { CellStore } from './CellStore';
import { GridProgress } from './GridProgress';
import { runGridPipeline, type PipelineConfig, type PipelineSummary } from './GridPipeline';
import { ProgressPanel } from '../ui/panels/ProgressPanel';
import { validateForExport } from '../export/ExportValidator';
import { exportLayersZip } from '../export/LayerExporter';
import { downloadBlob, exportGLB } from '../export/GLBExporter';
import type { FeatureCounts } from '../types/features';
import {
  defaultLayers,
  type FeatureOverride,
  type LayerId,
  type LayerSettings,
  type Layers,
  type Overrides,
} from '../types/project';
import { changedIds, EditHistory } from '../editor/EditHistory';
import { SelectionManager } from '../editor/SelectionManager';
import { resolveHeight } from '../generator/BuildingGenerator';
import { resolveWidth } from '../generator/RoadGenerator';
import { LayersPanel } from '../ui/panels/LayersPanel';
import { PropertiesPanel, type PropertyTarget } from '../ui/panels/PropertiesPanel';
import { store } from './state';
import type { Bounds } from '../types/editor';

const el = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Missing element: ${sel}`);
  return node;
};

const emptyCounts = (): FeatureCounts => ({ building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 });

const TEMPLATE = `
<div class="editor">
  <header class="topbar">
    <div class="brand"><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" />DHAKA WORLD BUILDER</div>
    <button id="btn-open" title="Open a saved project (.dwb.json)">Open</button>
    <input id="file-open" type="file" accept=".json,application/json" hidden />
    <button id="btn-generate" class="primary" disabled title="Import and build the 3D world, cell by cell">Generate</button>
    <button id="btn-undo" disabled title="Undo (Ctrl+Z)">Undo</button>
    <button id="btn-redo" disabled title="Redo (Ctrl+Shift+Z)">Redo</button>
    <button id="btn-save" disabled title="Save project (Ctrl+S)">Save</button>
    <button id="btn-export" disabled title="Download the city as a GLB file">Export GLB</button>
    <button id="btn-export-zip" disabled title="Download each layer as a separate GLB in a ZIP, with a manifest">Export layers</button>
    <span class="spacer"></span>
    <span class="hint">Select area → Generate → Export</span>
  </header>

  <aside class="panel left">
    <section>
      <h2>Map</h2>
      <div class="map-wrap"><div class="map" id="map"></div></div>
    </section>
    <section>
      <h2>Tools</h2>
      <div class="tool-row">
        <button id="btn-select">Select Area</button>
        <button id="btn-dhaka" title="Select all of Dhaka (built as a 10×10 grid)">Entire Dhaka</button>
        <button id="btn-clear" disabled>Clear</button>
        <button id="btn-fit" disabled>Zoom to selection</button>
      </div>
      <p class="hint" style="margin-top:8px">Click "Select Area", then drag a rectangle on the map. Esc cancels.</p>
    </section>
    <section>
      <h2>Build progress</h2>
      <div class="card" id="progress"></div>
    </section>
    <section>
      <h2>World</h2>
      <div class="card">
        <dl class="kv" id="imp-info"></dl>
        <div id="imp-notice"></div>
      </div>
    </section>
    <section>
      <h2>Selected area</h2>
      <div class="card">
        <dl class="kv" id="sel-info"></dl>
        <div id="sel-notice"></div>
      </div>
    </section>
  </aside>

  <main class="viewport" id="viewport">
    <div class="placeholder" id="placeholder">
      <div>3D viewport<br /><span class="hint">Select an area and press Generate. Cells appear as they finish.</span></div>
    </div>
  </main>

  <aside class="panel right">
    <h2>Layers</h2>
    <div id="layers"></div>
    <h2 style="margin-top:16px">Properties</h2>
    <div id="props"></div>
  </aside>

  <footer class="statusbar">
    <span id="status-text"></span>
    <span class="spacer"></span>
    <span id="status-fps">FPS: –</span>
    <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:inherit">OpenStreetMap contributors</a></span>
  </footer>
</div>`;

export class App {
  private readonly mapView: MapView;
  private readonly selector: AreaSelector;
  private readonly scene: SceneManager;
  private readonly cellStore = new CellStore();
  /** Area currently built (or being built) and the projection shared by all its cells. */
  private world: { bounds: Bounds; proj: LocalProjection } | null = null;
  private runAbort: AbortController | null = null;
  private totals: FeatureCounts = emptyCounts();
  private notices: { level: 'warn' | 'err' | 'ok'; text: string }[] = [];
  private lastOverrides: Overrides = {};
  private lastStatusLine = '';
  private readonly history = new EditHistory();
  private layers: Layers = defaultLayers();
  private readonly selection: SelectionManager;
  private readonly props: PropertiesPanel;
  private readonly layersPanel: LayersPanel;
  private readonly progressPanel: ProgressPanel;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = TEMPLATE;

    this.mapView = new MapView(el(root, '#map'));
    this.selector = new AreaSelector(this.mapView.map);
    this.scene = new SceneManager(el(root, '#viewport'));
    this.scene.onFps = (fps) => {
      el(root, '#status-fps').textContent = `FPS: ${fps}`;
    };
    this.scene.start();

    this.selection = new SelectionManager(this.scene);
    this.selection.on('select', () => this.updateProps());
    this.props = new PropertiesPanel(el(root, '#props'), {
      onEdit: (id, patch) => this.applyEdit(id, patch),
      onReset: (id) => {
        this.history.patch(id, null);
        this.afterEdit();
      },
    });
    this.layersPanel = new LayersPanel(el(root, '#layers'), (id, next) => this.setLayer(id, next));
    this.layersPanel.render(this.layers);
    this.progressPanel = new ProgressPanel(el(root, '#progress'));

    this.bindUi();
    this.bindStore();
    this.mapView.whenReady().then(() => this.selector.init());

    this.renderSelection(null);
    this.renderWorld();
    this.renderStatus();
  }

  private bindUi(): void {
    const { root, selector } = this;
    const selectBtn = el<HTMLButtonElement>(root, '#btn-select');

    selectBtn.addEventListener('click', () => selector.setActive(!selector.isActive));
    selector.onActiveChange = (active) => {
      selectBtn.classList.toggle('active', active);
      selectBtn.textContent = active ? 'Drag on map… (Esc to cancel)' : 'Select Area';
      if (active) store.setStatus('info', 'Drag a rectangle on the map to select an area.');
    };

    selector.onChange = (bounds, final) => {
      if (!final) {
        this.renderSelection(bounds);
        return;
      }
      if (!bounds) {
        store.setSelection(null);
        store.setStatus('info', 'Selection cleared.');
        return;
      }
      this.acceptSelection(bounds);
    };

    el(root, '#btn-dhaka').addEventListener('click', () => {
      const b = { ...DHAKA_EXTENT };
      selector.setSelection(b);
      this.acceptSelection(b);
      this.mapView.fitTo(b.west, b.south, b.east, b.north);
    });

    el(root, '#btn-clear').addEventListener('click', () => selector.clear());
    el(root, '#btn-fit').addEventListener('click', () => {
      const s = store.selection;
      if (s) this.mapView.fitTo(s.west, s.south, s.east, s.north);
    });

    const fileInput = el<HTMLInputElement>(root, '#file-open');
    el(root, '#btn-open').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (f) void this.openProject(f);
    });
    el(root, '#btn-save').addEventListener('click', () => this.saveProject());

    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        this.redo();
      } else if (mod && k === 's') {
        e.preventDefault();
        this.saveProject();
      } else if ((k === 'delete' || k === 'backspace') && this.selection.current) {
        e.preventDefault();
        this.applyEdit(this.selection.current.id, { hidden: true });
      }
    });

    el(root, '#btn-undo').addEventListener('click', () => this.undo());
    el(root, '#btn-redo').addEventListener('click', () => this.redo());

    el(root, '#btn-generate').addEventListener('click', () => void this.runGenerate());
    el(root, '#btn-export').addEventListener('click', () => void this.runExport(false));
    el(root, '#btn-export-zip').addEventListener('click', () => void this.runExport(true));

    window.addEventListener('resize', () => this.mapView.resize());
  }

  private bindStore(): void {
    store.on('selection', (bounds) => {
      this.renderSelection(bounds);
      const has = bounds !== null;
      (el(this.root, '#btn-clear') as HTMLButtonElement).disabled = !has;
      (el(this.root, '#btn-fit') as HTMLButtonElement).disabled = !has;
      (el(this.root, '#btn-generate') as HTMLButtonElement).disabled = !has && !this.runAbort;
    });
    store.on('status', () => this.renderStatus());
  }

  /** Validate a chosen area and make it the current selection. */
  private acceptSelection(bounds: Bounds): void {
    const check = validateSelection(bounds);
    if (check.ok) {
      store.setSelection(bounds);
      store.setStatus(check.level === 'warn' ? 'warn' : 'info', check.message);
    } else {
      // Reject invalid selections: keep the drawn box visible so the user sees why.
      store.setSelection(null);
      this.renderSelection(bounds);
      store.setStatus('error', check.message);
    }
  }

  /** Generate button: build the selected area, or cancel a build in progress. */
  private async runGenerate(): Promise<void> {
    if (this.runAbort) {
      this.runAbort.abort();
      return;
    }
    const bounds = store.selection;
    if (!bounds) return;
    await this.build(bounds);
  }

  private setRunning(running: boolean): void {
    const btn = el<HTMLButtonElement>(this.root, '#btn-generate');
    btn.textContent = running ? 'Cancel' : 'Generate';
    btn.disabled = !running && !store.selection;
    for (const id of ['#btn-open', '#btn-select', '#btn-dhaka'])
      (el(this.root, id) as HTMLButtonElement).disabled = running;
  }

  /** Forget the previous world and prepare to build `bounds`. */
  private resetWorld(bounds: Bounds, overrides: Overrides, layers: Layers): void {
    this.selection.select(null);
    this.scene.clearCells();
    this.cellStore.clear();
    this.history.reset(overrides);
    this.lastOverrides = overrides;
    this.layers = layers;
    this.layersPanel.render(layers);
    this.world = { bounds, proj: LocalProjection.fromBounds(bounds) };
    this.totals = emptyCounts();
    this.notices = [];
    this.lastStatusLine = '';
    this.progressPanel.reset();
    for (const id of ['#btn-export', '#btn-export-zip', '#btn-save'])
      (el(this.root, id) as HTMLButtonElement).disabled = true;
    el(this.root, '#placeholder').style.display = 'none';
    const { width, height } = boundsSizeMeters(bounds);
    this.scene.frameExtent(width, height);
    this.renderWorld();
    this.syncHistoryButtons();
    this.updateProps();
  }

  /** Import and generate the whole area cell by cell; cells show up in 3D as soon as they are ready. */
  private async build(
    bounds: Bounds,
    opts: { importCell?: PipelineConfig['importCell']; overrides?: Overrides; layers?: Layers } = {},
  ): Promise<void> {
    this.resetWorld(bounds, opts.overrides ?? {}, opts.layers ?? defaultLayers());
    const ctrl = new AbortController();
    this.runAbort = ctrl;
    this.setRunning(true);

    const progress = new GridProgress(buildGrid(bounds).map((c) => c.id));
    progress.on('change', (snap) => {
      this.progressPanel.update(snap);
      const line = `Building… imported ${Math.floor(snap.importedPct)}% · generated ${Math.floor(snap.generatedPct)}%`;
      if (line !== this.lastStatusLine) {
        this.lastStatusLine = line;
        store.setStatus('info', line);
      }
    });
    store.setStatus('info', `Building ${GRID_SIZE}×${GRID_SIZE} grid…`);

    try {
      const summary = await runGridPipeline({
        bounds,
        progress,
        signal: ctrl.signal,
        importCell: opts.importCell,
        getOverrides: () => this.history.current,
        getLayers: () => this.layers,
        onRetry: ({ attempt, reason, delayMs }) =>
          store.setStatus('warn', `Overpass: ${reason}. Retry ${attempt} in ${Math.round(delayMs / 1000)}s…`),
        onCell: ({ cell, result, group }) => {
          this.cellStore.set(cell, result);
          this.scene.setCell(group);
          for (const k of Object.keys(this.totals) as (keyof FeatureCounts)[]) this.totals[k] += result.counts[k];
          for (const id of ['#btn-export', '#btn-export-zip', '#btn-save'])
            (el(this.root, id) as HTMLButtonElement).disabled = false;
          this.renderWorld();
        },
      });
      this.finishBuild(summary);
    } catch (err) {
      store.setStatus('error', `Build failed: ${(err as Error).message}`);
    } finally {
      this.runAbort = null;
      this.setRunning(false);
      this.syncHistoryButtons();
    }
  }

  private finishBuild(s: PipelineSummary): void {
    const total = GRID_SIZE * GRID_SIZE;
    if (s.failed.length)
      this.notices.push({ level: 'warn', text: `${s.failed.length} cell(s) failed: ${s.failed.join(', ')}` });
    if (s.abortedReason) this.notices.push({ level: 'err', text: s.abortedReason });
    this.renderWorld();
    if (s.cancelled) store.setStatus('info', `Cancelled. ${s.ready} of ${total} cells built.`);
    else if (s.abortedReason) store.setStatus('error', s.abortedReason);
    else if (s.failed.length)
      store.setStatus('warn', `Done: ${s.ready} of ${total} cells built, ${s.failed.length} failed.`);
    else
      store.setStatus(
        'info',
        `World ready: ${s.features.toLocaleString()} features, ${s.triangles.toLocaleString()} triangles. Click a feature to edit.`,
      );
  }

  /** Apply layer visibility and colours straight to the meshes (no regeneration needed). */
  private applyLayers(): void {
    this.scene.world.traverse((o) => {
      const m = o as Mesh;
      const layer = m.isMesh ? this.layers[m.name as LayerId] : undefined;
      if (!layer) return;
      m.visible = layer.visible;
      (m.material as MeshStandardMaterial).color.setHex(layer.color);
    });
  }

  private applyEdit(id: string, patch: FeatureOverride): void {
    const next: FeatureOverride = { ...this.history.current[id], ...patch };
    if (!next.hidden) delete next.hidden;
    this.history.patch(id, next);
    this.afterEdit();
  }

  /** Rebuild only the cells that contain an edited feature. */
  private afterEdit(): void {
    const world = this.world;
    if (world) {
      const cells = new Set<string>();
      for (const id of changedIds(this.lastOverrides, this.history.current)) {
        const c = this.cellStore.cellOfFeature(id);
        if (c) cells.add(c);
      }
      for (const cellId of cells) {
        const rec = this.cellStore.get(cellId);
        if (!rec) continue;
        try {
          const { group } = generateCity(rec.result, rec.cell.bounds, this.history.current, this.layers, {
            projection: world.proj,
            name: cellId,
          });
          this.scene.setCell(group);
        } catch (err) {
          store.setStatus('error', `Could not rebuild ${cellId}: ${(err as Error).message}`);
        }
      }
    }
    this.lastOverrides = this.history.current;
    this.selection.refreshHighlight();
    this.syncHistoryButtons();
    this.updateProps();
  }

  private undo(): void {
    if (this.history.undo()) this.afterEdit();
  }

  private redo(): void {
    if (this.history.redo()) this.afterEdit();
  }

  private setLayer(id: LayerId, next: LayerSettings): void {
    this.layers = { ...this.layers, [id]: next };
    this.applyLayers();
  }

  private syncHistoryButtons(): void {
    (el(this.root, '#btn-undo') as HTMLButtonElement).disabled = !this.history.canUndo;
    (el(this.root, '#btn-redo') as HTMLButtonElement).disabled = !this.history.canRedo;
  }

  private updateProps(): void {
    const sel = this.selection.current;
    const f = sel && this.cellStore.feature(sel.id);
    if (!sel || !f) {
      this.props.show(null);
      return;
    }
    const ov = this.history.current[sel.id];
    const target: PropertyTarget = {
      id: sel.id,
      layer: sel.layer,
      kind: f.kind,
      hidden: !!ov?.hidden,
      edited: !!ov,
      tags: f.tags,
    };
    if (f.kind === 'building') target.heightM = ov?.heightM ?? resolveHeight(f);
    else if (f.kind === 'road' || f.kind === 'path' || f.kind === 'waterway')
      target.widthM = ov?.widthM ?? resolveWidth(f);
    this.props.show(target);
  }

  private saveProject(): void {
    const w = this.world;
    if (!w || this.cellStore.size === 0) {
      store.setStatus('warn', 'Nothing to save yet: generate an area first.');
      return;
    }
    saveProjectFile(
      serializeProject({
        bounds: w.bounds,
        import: this.cellStore.merged(),
        overrides: this.history.current,
        layers: this.layers,
      }),
    );
    store.setStatus('info', 'Project saved.');
  }

  /** Open a saved project by replaying its data through the same grid pipeline (so cells appear progressively). */
  private async openProject(file: File): Promise<void> {
    try {
      const p = await openProjectFile(file);
      const parts = partitionByCell(buildGrid(p.bounds), p.import.features);
      const key = (b: Bounds) => `${b.west}|${b.south}|${b.east}|${b.north}`;
      const byKey = new Map(buildGrid(p.bounds).map((c) => [key(c.bounds), parts.get(c.id) ?? []]));
      this.selector.setSelection(p.bounds);
      store.setSelection(p.bounds);
      this.mapView.fitTo(p.bounds.west, p.bounds.south, p.bounds.east, p.bounds.north);
      store.setStatus('info', `Opening project saved ${new Date(p.savedAt).toLocaleString()}…`);
      await this.build(p.bounds, {
        overrides: p.overrides,
        layers: p.layers,
        importCell: async (b, o) => {
          o.onProgress?.({ done: 1, total: 1, fromCache: true });
          return { features: byKey.get(key(b)) ?? [], counts: emptyCounts(), warnings: [] };
        },
      });
    } catch (err) {
      store.setStatus('error', `Could not open project: ${(err as Error).message}`);
    }
  }

  private async runExport(asZip: boolean): Promise<void> {
    const city = this.scene.currentCity;
    const w = this.world;
    if (!city || !w) return;
    try {
      const report = validateForExport(city);
      if (!report.ok) {
        store.setStatus('error', `Export blocked: ${report.errors[0]}`);
        return;
      }
      store.setStatus('info', 'Exporting…');
      const stamp = Date.now();
      let size: number;
      if (asZip) {
        const zip = await exportLayersZip(city, w.bounds);
        downloadBlob(zip.buffer as ArrayBuffer, `dhaka-layers-${stamp}.zip`, 'application/zip');
        size = zip.byteLength;
      } else {
        const data = await exportGLB(city);
        downloadBlob(data, `dhaka-area-${stamp}.glb`);
        size = data.byteLength;
      }
      const note = report.warnings.length ? ` Warning: ${report.warnings[0]}` : '';
      store.setStatus(
        report.warnings.length ? 'warn' : 'info',
        `Exported ${(size / 1048576).toFixed(2)} MB (${report.triangles.toLocaleString()} triangles).${note}`,
      );
    } catch (err) {
      store.setStatus('error', `Export failed: ${(err as Error).message}`);
    }
  }

  /** Totals for everything built so far, plus any notices from the last build. */
  private renderWorld(): void {
    const info = el(this.root, '#imp-info');
    const notice = el(this.root, '#imp-notice');
    const c = this.totals;
    if (this.cellStore.size === 0) {
      info.innerHTML = '<dt>Status</dt><dd>Nothing built yet</dd>';
    } else {
      const n = (v: number) => v.toLocaleString();
      info.innerHTML = `
      <dt>Buildings</dt><dd>${n(c.building)}</dd>
      <dt>Roads</dt><dd>${n(c.road)}</dd>
      <dt>Paths</dt><dd>${n(c.path)}</dd>
      <dt>Waterways</dt><dd>${n(c.waterway)}</dd>
      <dt>Water areas</dt><dd>${n(c.water)}</dd>
      <dt>Green areas</dt><dd>${n(c.green)}</dd>`;
    }
    notice.replaceChildren(
      ...this.notices.map((x) => {
        const d = document.createElement('div');
        d.className = `notice ${x.level}`;
        d.textContent = x.text;
        return d;
      }),
    );
  }

  private renderStatus(): void {
    const node = el(this.root, '#status-text');
    const { level, text } = store.status;
    node.textContent = text;
    node.className = level === 'warn' ? 'warn' : level === 'error' ? 'err' : '';
  }

  private renderSelection(bounds: Bounds | null): void {
    const info = el(this.root, '#sel-info');
    const notice = el(this.root, '#sel-notice');
    if (!bounds) {
      info.innerHTML = '<dt>Status</dt><dd>No area selected</dd>';
      notice.innerHTML = '';
      return;
    }
    const { width, height } = boundsSizeMeters(bounds);
    const area = boundsAreaKm2(bounds);
    const est = estimateBuild(bounds);
    const f = (n: number) => n.toFixed(5);
    info.innerHTML = `
      <dt>West</dt><dd>${f(bounds.west)}</dd>
      <dt>East</dt><dd>${f(bounds.east)}</dd>
      <dt>South</dt><dd>${f(bounds.south)}</dd>
      <dt>North</dt><dd>${f(bounds.north)}</dd>
      <dt>Width</dt><dd>${Math.round(width)} m</dd>
      <dt>Height</dt><dd>${Math.round(height)} m</dd>
      <dt>Area</dt><dd>${area.toFixed(area >= 10 ? 1 : 3)} km² / ${MAX_AREA_KM2} max</dd>
      <dt>Grid</dt><dd>${GRID_SIZE}×${GRID_SIZE} · ~${est.tiles.toLocaleString()} requests · ~${est.minutes} min</dd>`;
    const check = validateSelection(bounds);
    const cls = check.level === 'error' ? 'err' : check.level === 'warn' ? 'warn' : 'ok';
    notice.innerHTML = `<div class="notice ${cls}">${check.message}</div>`;
  }
}
