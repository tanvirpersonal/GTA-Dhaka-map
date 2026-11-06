import * as THREE from 'three';
import { MapView } from '../map/MapView';
import { AreaSelector } from '../map/AreaSelector';
import { boundsAreaKm2, boundsSizeMeters, MAX_AREA_KM2, validateSelection } from '../map/DhakaBounds';
import { SceneManager } from '../renderer/SceneManager';
import { OSMImportError } from '../data/OSMClient';
import { importTiled } from '../data/TiledImport';
import { assignFeaturesToBlocks, createCityBlocks, type CityBlock } from '../data/CityBlockGrid';
import { loadBlockProgress, saveBlockProgress, summarizeBlockProgress } from '../data/BlockProgress';
import { serializeProject } from '../project/ProjectSerializer';
import { openProjectFile, saveProjectFile } from '../project/ProjectManager';
import { generateBlockCity } from '../generator/BlockModelGenerator';
import { validateForExport } from '../export/ExportValidator';
import { exportLayersZip } from '../export/LayerExporter';
import { downloadBlob, exportGLB } from '../export/GLBExporter';
import type { ImportResult, MapFeature } from '../types/features';
import { defaultLayers, type FeatureOverride, type LayerId, type LayerSettings, type Layers } from '../types/project';
import { EditHistory } from '../editor/EditHistory';
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

const TEMPLATE = `
<div class="editor">
  <header class="topbar">
    <div class="brand"><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" />DHAKA WORLD BUILDER</div>
    <button id="btn-open" title="Open a saved project (.dwb.json)">Open</button>
    <input id="file-open" type="file" accept=".json,application/json" hidden />
    <button id="btn-import" disabled title="Import OpenStreetMap data for the selected area">Import</button>
    <button id="btn-generate" disabled title="Build the 3D city from imported data">Generate</button>
    <button id="btn-walk" disabled title="Explore the generated city on foot">Walk mode</button>
    <button id="btn-undo" disabled title="Undo (Ctrl+Z)">Undo</button>
    <button id="btn-redo" disabled title="Redo (Ctrl+Shift+Z)">Redo</button>
    <button id="btn-save" disabled title="Save project (Ctrl+S)">Save</button>
    <button id="btn-export" disabled title="Download the city as a GLB file">Export GLB</button>
    <button id="btn-export-zip" disabled title="Download each layer as a separate GLB in a ZIP, with a manifest">Export layers</button>
    <span class="spacer"></span>
    <span class="hint">Select area → Import → Generate → Export</span>
  </header>

  <aside class="panel left">
    <section>
      <h2>Map</h2>
      <div class="map-wrap"><div class="map" id="map"></div></div>
    </section>
    <section>
      <h2>Tools</h2>
      <div class="tool-row">
        <button id="btn-select" class="primary">Select Area</button>
        <button id="btn-clear" disabled>Clear</button>
        <button id="btn-fit" disabled>Zoom to selection</button>
      </div>
      <p class="hint" style="margin-top:8px">Click "Select Area", then drag a rectangle on the map. Esc cancels.</p>
    </section>
    <section>
      <h2>Import</h2>
      <div class="card">
        <div class="import-progress" id="import-progress" hidden>
          <div class="progress-meta"><span id="import-progress-label">Importing map data…</span><strong id="import-progress-value">0%</strong></div>
          <div class="progress-track" role="progressbar" aria-label="Map import progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="import-progress-track"><div class="progress-fill" id="import-progress-fill"></div></div>
        </div>
        <dl class="kv" id="imp-info"></dl>
        <div id="imp-notice"></div>
      </div>
    </section>
    <section>
      <h2>City blocks · 250 m</h2>
      <div class="card"><div class="progress-meta"><span>3D block generation</span><strong id="block-progress-value">0%</strong></div><div class="progress-track" id="block-progress-track" role="progressbar" aria-label="Validated city blocks" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill" id="block-progress-fill"></div></div><dl class="kv" id="block-info"><dt>Status</dt><dd>Import an area to create blocks</dd></dl><div id="block-list" class="hint"></div></div>
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
      <div>3D viewport<br /><span class="hint">Generated city appears here (Milestone 3)</span></div>
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
  private importResult: ImportResult | null = null;
  private cityBlocks: CityBlock[] = [];
  private abort: AbortController | null = null;
  /** The data behind the city currently shown (may differ from the live map selection). */
  private working: { bounds: Bounds; result: ImportResult; byId: Map<string, MapFeature> } | null = null;
  private readonly history = new EditHistory();
  private layers: Layers = defaultLayers();
  private readonly selection: SelectionManager;
  private readonly props: PropertiesPanel;
  private readonly layersPanel: LayersPanel;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = TEMPLATE;

    this.mapView = new MapView(el(root, '#map'));
    this.selector = new AreaSelector(this.mapView.map);
    this.scene = new SceneManager(el(root, '#viewport'));
    this.scene.onWalkModeChange = (active) => {
      const button = el<HTMLButtonElement>(root, '#btn-walk');
      button.textContent = active ? 'Exit walk' : 'Walk mode';
      button.classList.toggle('active', active);
      store.setStatus('info', active ? 'Walk mode: click the 3D view, then use WASD / arrows. Mouse looks around; Shift runs; Esc exits.' : 'Walk mode off.');
    };
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

    this.bindUi();
    this.bindStore();
    this.mapView.whenReady().then(() => this.selector.init());

    this.renderSelection(null);
    this.renderImport();
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
    };

    el(root, '#btn-clear').addEventListener('click', () => selector.clear());
    el(root, '#btn-fit').addEventListener('click', () => {
      const s = store.selection;
      if (s) this.mapView.fitTo(s.west, s.south, s.east, s.north);
    });

    el(root, '#btn-import').addEventListener('click', () => {
      if (this.abort) this.abort.abort();
      else void this.runImport();
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
    el(root, '#btn-walk').addEventListener('click', () => this.scene.setWalkMode(!this.scene.isWalkMode));
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
      (el(this.root, '#btn-import') as HTMLButtonElement).disabled = !has;
      // A new selection invalidates the previous import.
      this.importResult = null;
      this.cityBlocks = [];
      this.mapView.setCityBlocks([]);
      this.renderBlocks();
      this.renderImport();
    });
    store.on('status', () => this.renderStatus());
  }

  private async runImport(): Promise<void> {
    const bounds = store.selection;
    if (!bounds) return;
    const btn = el<HTMLButtonElement>(this.root, '#btn-import');
    this.importResult = null;
    this.setImportProgress(0, 'Preparing map import…', true);
    this.renderImport();
    try {
      this.abort = new AbortController();
      btn.textContent = 'Cancel import';
      store.setStatus('info', 'Importing from OpenStreetMap…');
      const result = await importTiled(bounds, {
        signal: this.abort.signal,
        onProgress: ({ done, total, fromCache }) => {
          const percent = Math.round((done / total) * 100);
          this.setImportProgress(percent, `Importing map tiles ${done}/${total}${fromCache ? ' · cached' : ''}`, true);
          store.setStatus('info', `Map import ${percent}% · tile ${done}/${total}${fromCache ? ' (cached)' : ''}`);
        },
        onRetry: ({ attempt, reason, delayMs }) =>
          store.setStatus('warn', `Overpass: ${reason}. Retry ${attempt} in ${Math.round(delayMs / 1000)}s…`),
      });
      this.importResult = result;
      this.cityBlocks = loadBlockProgress(assignFeaturesToBlocks(createCityBlocks(bounds), result.features));
      this.mapView.setCityBlocks(this.cityBlocks);
      this.renderBlocks();
      this.setImportProgress(100, 'Map data imported · ready for 3D generation', true);
      const n = result.features.length;
      store.setStatus(result.warnings.length ? 'warn' : 'info', `Imported ${n} feature${n === 1 ? '' : 's'}.`);
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') { this.setImportProgress(0, 'Import cancelled', false); store.setStatus('info', 'Import cancelled.'); }
      else { this.setImportProgress(0, 'Import failed', false); store.setStatus('error', err instanceof OSMImportError ? e.message : `Import failed: ${e.message}`); }
    } finally {
      this.abort = null;
      btn.textContent = 'Import';
      this.renderImport();
    }
  }

  private async runGenerate(): Promise<void> {
    const result = this.importResult;
    const bounds = store.selection;
    if (!result || !bounds) return;

    const button = el<HTMLButtonElement>(this.root, '#btn-generate');
    button.disabled = true;
    button.textContent = 'Generating…';
    this.setWorking(bounds, result, {}, defaultLayers());
    const blocks = this.cityBlocks.length
      ? this.cityBlocks
      : assignFeaturesToBlocks(createCityBlocks(bounds), result.features);
    const featureById = new Map(result.features.map((feature) => [feature.id, feature]));
    const root = new THREE.Group();
    root.name = 'dhaka-city';
    root.userData.modelVersion = 1;
    root.userData.coordinateSystem = 'shared-selection-origin';
    this.scene.setCity(root, false);
    const size = boundsSizeMeters(bounds);
    this.scene.frameCity(size.width, size.height);

    let triangles = 0;
    let meshes = 0;
    let completed = 0;
    const total = blocks.length;
    const yieldFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      for (const block of blocks) {
        const generating = { ...block, status: 'generating' as const };
        this.cityBlocks = blocks.map((item) => item.id === block.id ? generating : item);
        this.renderBlocks();

        const partial = generateBlockCity(
          result,
          bounds,
          [generating],
          this.history.current,
          this.layers,
        );
        const blockGroup = partial.group.children[0] as THREE.Group | undefined;
        if (blockGroup) {
          this.scene.addCityBlock(blockGroup);
          triangles += partial.stats.triangles;
          meshes += partial.stats.meshes;
        }
        completed++;
        this.cityBlocks = blocks.map((item) =>
          item.id === block.id ? { ...item, status: 'validated' as const } : item,
        );
        saveBlockProgress(this.cityBlocks);
        this.renderBlocks();
        el(this.root, '#placeholder').style.display = 'none';
        store.setStatus('info', `Rendering city blocks: ${completed}/${total} · ${Math.round(completed / total * 100)}%`);
        await yieldFrame();
      }

      root.userData.blockManifest = {
        schemaVersion: 1,
        modelVersion: 1,
        blockSizeM: 250,
        totalBlocks: total,
        blocks: this.cityBlocks,
      };
      (el(this.root, '#btn-walk') as HTMLButtonElement).disabled = meshes === 0;
      (el(this.root, '#btn-export') as HTMLButtonElement).disabled = meshes === 0;
      (el(this.root, '#btn-export-zip') as HTMLButtonElement).disabled = meshes === 0;
      (el(this.root, '#btn-save') as HTMLButtonElement).disabled = false;
      this.selection.refreshHighlight();
      this.updateProps();
      store.setStatus(
        meshes ? 'info' : 'warn',
        meshes
          ? `City rendering complete: ${completed} blocks, ${triangles.toLocaleString()} triangles. Each block appeared as it finished.`
          : 'No 3D geometry was generated for this selection.',
      );
    } catch (err) {
      store.setStatus('error', `Block generation stopped: ${(err as Error).message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Generate';
    }
  }

  /** Make a (bounds, import) pair the active editable project. */
  private setWorking(bounds: Bounds, result: ImportResult, overrides: Record<string, FeatureOverride>, layers: Layers): void {
    this.working = { bounds, result, byId: new Map(result.features.map((f) => [f.id, f])) };
    this.history.reset(overrides);
    this.layers = layers;
    this.layersPanel.render(layers);
    this.selection.select(null);
  }

  /** Rebuild the 3D city from the working data + current edits and layer settings. */
  private regenerate(frame: boolean): boolean {
    const w = this.working;
    if (!w) return false;
    try {
      const blocks = this.cityBlocks.length
        ? this.cityBlocks
        : assignFeaturesToBlocks(createCityBlocks(w.bounds), w.result.features);
      const generated = generateBlockCity(w.result, w.bounds, blocks, this.history.current, this.layers);
      const { group, stats } = generated;
      this.cityBlocks = generated.blocks;
      saveBlockProgress(this.cityBlocks);
      this.renderBlocks();
      this.scene.setCity(group, frame);
      (el(this.root, '#btn-walk') as HTMLButtonElement).disabled = stats.meshes === 0;
      el(this.root, '#placeholder').style.display = 'none';
      this.selection.refreshHighlight();
      (el(this.root, '#btn-export') as HTMLButtonElement).disabled = stats.meshes === 0;
      (el(this.root, '#btn-export-zip') as HTMLButtonElement).disabled = stats.meshes === 0;
      (el(this.root, '#btn-save') as HTMLButtonElement).disabled = false;
      if (frame) {
        store.setStatus(
          stats.meshes ? 'info' : 'warn',
          stats.meshes ? `Primary city model ready: ${this.cityBlocks.length} block units, ${stats.triangles.toLocaleString()} triangles. Click a feature to edit.` : 'Nothing to generate in this area.',
        );
      }
    } catch (err) {
      store.setStatus('error', `Generation failed: ${(err as Error).message}`);
      return false;
    }
    this.syncHistoryButtons();
    this.updateProps();
    return true;
  }

  private applyEdit(id: string, patch: FeatureOverride): void {
    const next: FeatureOverride = { ...this.history.current[id], ...patch };
    if (!next.hidden) delete next.hidden;
    this.history.patch(id, next);
    this.afterEdit();
  }

  private afterEdit(): void {
    this.regenerate(false);
  }

  private undo(): void {
    if (this.history.undo()) this.afterEdit();
  }

  private redo(): void {
    if (this.history.redo()) this.afterEdit();
  }

  private setLayer(id: LayerId, next: LayerSettings): void {
    this.layers = { ...this.layers, [id]: next };
    this.regenerate(false);
  }

  private syncHistoryButtons(): void {
    (el(this.root, '#btn-undo') as HTMLButtonElement).disabled = !this.history.canUndo;
    (el(this.root, '#btn-redo') as HTMLButtonElement).disabled = !this.history.canRedo;
  }

  private updateProps(): void {
    const sel = this.selection.current;
    const f = sel && this.working?.byId.get(sel.id);
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
    else if (f.kind === 'road' || f.kind === 'path' || f.kind === 'waterway') target.widthM = ov?.widthM ?? resolveWidth(f);
    this.props.show(target);
  }

  private saveProject(): void {
    const w = this.working;
    if (!w) {
      store.setStatus('warn', 'Nothing to save yet: import and generate an area first.');
      return;
    }
    saveProjectFile(serializeProject({ bounds: w.bounds, import: w.result, overrides: this.history.current, layers: this.layers }));
    store.setStatus('info', 'Project saved.');
  }

  private async openProject(file: File): Promise<void> {
    try {
      const p = await openProjectFile(file);
      this.setWorking(p.bounds, p.import, p.overrides, p.layers);
      this.importResult = p.import;
      this.cityBlocks = loadBlockProgress(assignFeaturesToBlocks(createCityBlocks(p.bounds), p.import.features));
      this.mapView.setCityBlocks(this.cityBlocks);
      this.renderBlocks();
      this.renderImport();
      this.mapView.fitTo(p.bounds.west, p.bounds.south, p.bounds.east, p.bounds.north);
      this.regenerate(true);
      store.setStatus('info', `Opened project (saved ${new Date(p.savedAt).toLocaleString()}).`);
    } catch (err) {
      store.setStatus('error', `Could not open project: ${(err as Error).message}`);
    }
  }

  private async runExport(asZip: boolean): Promise<void> {
    const city = this.scene.currentCity;
    const w = this.working;
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
      store.setStatus(report.warnings.length ? 'warn' : 'info', `Exported ${(size / 1048576).toFixed(2)} MB (${report.triangles.toLocaleString()} triangles).${note}`);
    } catch (err) {
      store.setStatus('error', `Export failed: ${(err as Error).message}`);
    }
  }

  private setImportProgress(percent: number, label: string, visible: boolean): void {
    const panel = this.root.querySelector<HTMLElement>('#import-progress');
    const fill = this.root.querySelector<HTMLElement>('#import-progress-fill');
    const value = this.root.querySelector<HTMLElement>('#import-progress-value');
    const text = this.root.querySelector<HTMLElement>('#import-progress-label');
    const track = this.root.querySelector<HTMLElement>('#import-progress-track');
    if (!panel || !fill || !value || !text || !track) return;
    const safe = Math.max(0, Math.min(100, Math.round(percent)));
    panel.hidden = !visible;
    fill.style.width = `${safe}%`;
    value.textContent = `${safe}%`;
    text.textContent = label;
    track.setAttribute('aria-valuenow', String(safe));
  }

  private renderBlocks(): void {
    const info = el(this.root, '#block-info');
    const list = el(this.root, '#block-list');
    if (!this.cityBlocks.length) { info.innerHTML = '<dt>Status</dt><dd>No blocks yet</dd>'; list.textContent = 'Select an area and import OSM data.'; return; }
    const total = this.cityBlocks.length;
    const populated = this.cityBlocks.filter((b) => b.featureIds.length > 0).length;
    const progress = summarizeBlockProgress(this.cityBlocks);
    const progressFill = el<HTMLElement>(this.root, '#block-progress-fill');
    const progressValue = el<HTMLElement>(this.root, '#block-progress-value');
    const progressTrack = el<HTMLElement>(this.root, '#block-progress-track');
    progressFill.style.width = progress.percent + '%';
    progressValue.textContent = progress.percent + '%';
    progressTrack.setAttribute('aria-valuenow', String(progress.percent));
    const sum = this.cityBlocks.reduce((acc, b) => {
      acc.building += b.counts.building; acc.road += b.counts.road; acc.path += b.counts.path;
      acc.waterway += b.counts.waterway; acc.water += b.counts.water; acc.green += b.counts.green; return acc;
    }, { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 });
    info.innerHTML = '<dt>Total blocks</dt><dd>' + total + '</dd><dt>Blocks with data</dt><dd>' + populated + '</dd><dt>Validated</dt><dd>' + progress.validated + '</dd><dt>Pending</dt><dd>' + progress.pending + '</dd><dt>Failed</dt><dd>' + progress.failed + '</dd><dt>Buildings</dt><dd>' + sum.building + '</dd><dt>Road segments</dt><dd>' + sum.road + '</dd><dt>Other features</dt><dd>' + (sum.path + sum.waterway + sum.water + sum.green) + '</dd>';
    list.textContent = 'Each 250 m cell is now built as its own 3D model group. All blocks share one origin so neighbouring geometry stays aligned.'
  }

  private renderImport(): void {
    const info = el(this.root, '#imp-info');
    const notice = el(this.root, '#imp-notice');
    const r = this.importResult;
    (el(this.root, '#btn-generate') as HTMLButtonElement).disabled = !r || r.features.length === 0;
    if (!r) {
      info.innerHTML = '<dt>Status</dt><dd>Nothing imported</dd>';
      notice.innerHTML = '';
      return;
    }
    const c = r.counts;
    info.innerHTML = `
      <dt>Buildings</dt><dd>${c.building}</dd>
      <dt>Roads</dt><dd>${c.road}</dd>
      <dt>Paths</dt><dd>${c.path}</dd>
      <dt>Waterways</dt><dd>${c.waterway}</dd>
      <dt>Water areas</dt><dd>${c.water}</dd>
      <dt>Green areas</dt><dd>${c.green}</dd>`;
    notice.innerHTML = r.warnings.map(() => `<div class="notice warn"></div>`).join('');
    notice.querySelectorAll('.notice').forEach((n, i) => (n.textContent = r.warnings[i].message));
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
    const f = (n: number) => n.toFixed(5);
    info.innerHTML = `
      <dt>West</dt><dd>${f(bounds.west)}</dd>
      <dt>East</dt><dd>${f(bounds.east)}</dd>
      <dt>South</dt><dd>${f(bounds.south)}</dd>
      <dt>North</dt><dd>${f(bounds.north)}</dd>
      <dt>Width</dt><dd>${Math.round(width)} m</dd>
      <dt>Height</dt><dd>${Math.round(height)} m</dd>
      <dt>Area</dt><dd>${area.toFixed(3)} km² / ${MAX_AREA_KM2} max</dd>`;
    const check = validateSelection(bounds);
    const cls = check.level === 'error' ? 'err' : check.level === 'warn' ? 'warn' : 'ok';
    notice.innerHTML = `<div class="notice ${cls}">${check.message}</div>`;
  }
}
