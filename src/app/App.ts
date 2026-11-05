import { MapView } from '../map/MapView';
import { AreaSelector } from '../map/AreaSelector';
import { boundsAreaKm2, boundsSizeMeters, MAX_AREA_KM2, validateSelection } from '../map/DhakaBounds';
import { SceneManager } from '../renderer/SceneManager';
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
    <button id="btn-import" disabled title="Milestone 2">Import</button>
    <button id="btn-generate" disabled title="Milestone 3">Generate</button>
    <button id="btn-save" disabled title="Milestone 4">Save</button>
    <button id="btn-export" disabled title="Milestone 5">Export</button>
    <span class="spacer"></span>
    <span class="hint">Milestone 1: map &amp; area selection</span>
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
    <h2>Properties</h2>
    <p class="hint">Select a building or road to edit it. Available from Milestone 4.</p>
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

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = TEMPLATE;

    this.mapView = new MapView(el(root, '#map'));
    this.selector = new AreaSelector(this.mapView.map);
    this.scene = new SceneManager(el(root, '#viewport'));
    this.scene.onFps = (fps) => {
      el(root, '#status-fps').textContent = `FPS: ${fps}`;
    };
    this.scene.start();

    this.bindUi();
    this.bindStore();
    this.mapView.whenReady().then(() => this.selector.init());

    this.renderSelection(null);
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

    window.addEventListener('resize', () => this.mapView.resize());
  }

  private bindStore(): void {
    store.on('selection', (bounds) => {
      this.renderSelection(bounds);
      const has = bounds !== null;
      (el(this.root, '#btn-clear') as HTMLButtonElement).disabled = !has;
      (el(this.root, '#btn-fit') as HTMLButtonElement).disabled = !has;
    });
    store.on('status', () => this.renderStatus());
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
