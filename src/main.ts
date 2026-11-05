import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MapView } from './map/MapView';
import { AreaSelector } from './map/AreaSelector';
import { boundsAreaKm2, boundsSizeMeters, validateSelection } from './map/DhakaBounds';
import { SceneManager } from './renderer/SceneManager';
import { ObjectPicker } from './renderer/ObjectPicker';
import { fetchOSM, type OSMFeature } from './data/OSMClient';
import { generateCity, type GenerationStats } from './generator/CityGenerator';
import type { Bounds } from './types/editor';
import './styles/tokens.css';
import './styles/global.css';
import './styles/editor.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App root #app was not found.');

root.innerHTML = `
  <div class="editor">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">D</span><span>DHAKA WORLD BUILDER</span><span class="version">V1 · PREVIEW</span></div>
      <button id="save-project">Save</button><button id="load-project">Load</button>
      <button id="export-glb" class="primary" disabled>Export GLB</button>
    </header>
    <aside class="panel left">
      <section><h2>01 / Dhaka map</h2><div class="map-wrap"><div id="map" class="map"></div></div>
        <div class="tool-row map-tools"><button id="select-area" class="primary">Select area</button><button id="clear-area">Clear</button></div>
        <p class="hint">Drag a rectangle on the map. V1 is limited to small Dhaka areas (max 1 km²).</p>
      </section>
      <section class="card"><h2>Selected area</h2><dl class="kv">
        <dt>Area</dt><dd id="area-value">—</dd><dt>West</dt><dd id="west-value">—</dd>
        <dt>South</dt><dd id="south-value">—</dd><dt>East</dt><dd id="east-value">—</dd><dt>North</dt><dd id="north-value">—</dd>
      </dl><div id="selection-notice" class="notice">No area selected.</div></section>
      <section><h2>02 / City generation</h2><button id="import-osm" class="primary full" disabled>Import OSM data</button>
        <button id="generate-city" class="full" disabled>Generate 3D city</button><p class="hint">Imports buildings, roads, parks and water features from OpenStreetMap.</p></section>
      <section class="card"><h2>Imported data</h2><dl class="kv">
        <dt>OSM features</dt><dd id="feature-count">0</dd><dt>Buildings</dt><dd id="building-count">0</dd><dt>Roads</dt><dd id="road-count">0</dd>
      </dl></section>
    </aside>
    <main class="viewport" id="viewport"><div class="viewport-label"><span class="live-dot"></span>3D CITY VIEWPORT <span id="viewport-hint">· Waiting for map data</span></div><div class="viewport-controls"><button id="view-orbit">Orbit</button><button id="view-top">Top</button><button id="frame-city">Frame city</button></div></main>
    <aside class="panel right"><section><h2>03 / Scene properties</h2><div class="property-block"><label>Project</label><strong>GTA Dhaka · Tejgaon test</strong></div>
      <div class="property-block"><label>Coordinate system</label><strong>Local metric · metres</strong></div>
      <div class="property-block"><label>Building height source</label><strong>OSM tags / estimated defaults</strong></div>
      <div class="property-block"><label>Export format</label><strong>GLB · glTF 2.0</strong></div></section>
      <section class="card stats-card"><h2>Generation report</h2><div id="generation-report" class="report">Import a small area to begin.</div></section>
      <section class="card inspector-card"><h2>04 / Object inspector</h2><div id="object-empty" class="report">Click a building in the 3D viewport to inspect it.</div>
        <div id="object-editor" hidden><div class="property-block"><label>Object</label><strong id="object-name">Building</strong></div>
          <div class="property-block"><label>OSM ID</label><strong id="object-osm-id">—</strong></div>
          <div class="property-block"><label>Building height <span id="height-value">—</span> m</label><input id="building-height" type="range" min="3" max="120" step="0.5" value="10" /><div class="range-labels"><span>3 m</span><span>120 m</span></div></div>
          <p id="height-source" class="hint"></p><button id="reset-height" class="full">Reset original height</button>
        </div></section>
      <section class="card"><h2>Workflow</h2><ol class="workflow"><li class="done">Editor initialized</li><li id="step-selection">Select a Dhaka area</li><li id="step-import">Import OSM features</li><li id="step-generate">Generate 3D geometry</li><li id="step-export">Export game asset</li></ol></section>
      <p class="attribution">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. OSM data is available under ODbL.</p>
    </aside>
    <footer class="statusbar"><span id="status-dot" class="status-dot"></span><span id="status-text">Initializing Dhaka editor…</span><span class="spacer"></span><span id="fps">FPS —</span><span id="status-features">0 features</span></footer>
  </div>`;

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};
const statusText = $('status-text');
const statusDot = $('status-dot');
const importButton = $('import-osm') as HTMLButtonElement;
const generateButton = $('generate-city') as HTMLButtonElement;
const exportButton = $('export-glb') as HTMLButtonElement;
const scene = new SceneManager($('viewport'));
const picker = new ObjectPicker(scene.camera, scene.renderer.domElement, scene.scene);
scene.start();
scene.onFps = (fps) => { $('fps').textContent = `FPS ${fps}`; };
const mapView = new MapView($('map'));
const selector = new AreaSelector(mapView.map);
let selectedBounds: Bounds | null = null;
let osmFeatures: OSMFeature[] = [];
let cityGroup: THREE.Group | null = null;
let generationStats: GenerationStats | null = null;
let selectedObject: THREE.Mesh | null = null;
let originalBuildingHeight = 0;
let busy = false;

picker.onSelect = (picked) => {
  const object = picked?.object ?? null;
  selectedObject = object;
  const editor = $('object-editor');
  const empty = $('object-empty');
  if (!object) { editor.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; editor.hidden = false;
  const kind = String(object.userData.kind ?? 'object');
  $('object-name').textContent = String(object.userData.name || (kind === 'building' ? 'Unnamed building' : kind));
  $('object-osm-id').textContent = String(object.userData.osmId ?? '—');
  const heightControl = $('building-height') as HTMLInputElement;
  const editable = kind === 'building';
  heightControl.disabled = !editable;
  $('reset-height').toggleAttribute('disabled', !editable);
  originalBuildingHeight = Number(object.userData.height ?? 10);
  heightControl.value = String(originalBuildingHeight);
  $('height-value').textContent = editable ? originalBuildingHeight.toFixed(1) : 'Not editable';
  $('height-source').textContent = editable ? (object.userData.heightEstimated ? 'Estimated from building type. Adjust to match reference imagery.' : 'Based on OpenStreetMap height / levels tags.') : 'Height editing is currently available for buildings only.';
  setStatus(`Selected ${kind} · OSM ${object.userData.osmId ?? 'unknown'}`);
};
$('building-height').addEventListener('input', () => {
  if (!selectedObject || selectedObject.userData.kind !== 'building') return;
  const value = Number(($('building-height') as HTMLInputElement).value);
  const base = Number(selectedObject.userData.height ?? originalBuildingHeight);
  if (!Number.isFinite(value) || base <= 0) return;
  selectedObject.scale.y = value / base;
  $('height-value').textContent = value.toFixed(1);
  selectedObject.userData.editedHeight = value;
  setStatus(`Building height changed to ${value.toFixed(1)} m`);
});
$('reset-height').addEventListener('click', () => {
  if (!selectedObject || selectedObject.userData.kind !== 'building') return;
  selectedObject.scale.y = 1;
  delete selectedObject.userData.editedHeight;
  ($('building-height') as HTMLInputElement).value = String(originalBuildingHeight);
  $('height-value').textContent = originalBuildingHeight.toFixed(1);
  setStatus('Building height restored to original OSM / estimated value.');
});

function setStatus(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  statusText.textContent = message;
  statusDot.className = `status-dot ${level}`;
}
function setStep(id: string, done: boolean): void {
  $(id).classList.toggle('done', done);
}
function updateSelection(bounds: Bounds | null): void {
  selectedBounds = bounds;
  const valid = bounds ? validateSelection(bounds) : null;
  $('area-value').textContent = bounds ? `${boundsAreaKm2(bounds).toFixed(3)} km²` : '—';
  $('west-value').textContent = bounds ? bounds.west.toFixed(6) : '—';
  $('south-value').textContent = bounds ? bounds.south.toFixed(6) : '—';
  $('east-value').textContent = bounds ? bounds.east.toFixed(6) : '—';
  $('north-value').textContent = bounds ? bounds.north.toFixed(6) : '—';
  const notice = $('selection-notice');
  notice.textContent = bounds ? (valid?.message ?? '') : 'No area selected.';
  notice.className = `notice ${valid?.level === 'error' ? 'err' : valid?.level === 'warn' ? 'warn' : bounds ? 'ok' : ''}`;
  importButton.disabled = !bounds || !valid?.ok || busy;
  setStep('step-selection', Boolean(bounds && valid?.ok));
}
selector.onChange = (bounds, final) => {
  if (final) updateSelection(bounds);
  else if (bounds) {
    $('area-value').textContent = `${boundsAreaKm2(bounds).toFixed(3)} km²`;
  }
};
selector.onActiveChange = (active) => {
  $('select-area').classList.toggle('active', active);
  setStatus(active ? 'Drag on the map to select a bounded area.' : 'Map selection mode ended.');
};
$('select-area').addEventListener('click', () => selector.setActive(!selector.isActive));
$('clear-area').addEventListener('click', () => { selector.clear(); picker.clearSelection(); updateSelection(null); osmFeatures = []; $('feature-count').textContent = '0'; $('building-count').textContent = '0'; $('road-count').textContent = '0'; generateButton.disabled = true; exportButton.disabled = true; if (cityGroup) { scene.scene.remove(cityGroup); cityGroup = null; } $('status-features').textContent = '0 features'; $('viewport-hint').textContent = '· Waiting for map data'; });
$('import-osm').addEventListener('click', async () => {
  if (!selectedBounds || busy) return;
  busy = true; importButton.disabled = true; generateButton.disabled = true;
  setStatus('Requesting OpenStreetMap features…');
  try {
    const data = await fetchOSM(selectedBounds);
    osmFeatures = data.elements;
    $('feature-count').textContent = String(osmFeatures.length);
    $('status-features').textContent = `${osmFeatures.length} features`;
    $('building-count').textContent = String(osmFeatures.filter((f) => f.type === 'way' && Boolean(f.tags?.building)).length);
    $('road-count').textContent = String(osmFeatures.filter((f) => f.type === 'way' && Boolean(f.tags?.highway)).length);
    generateButton.disabled = osmFeatures.length === 0;
    setStep('step-import', true);
    setStatus(`Imported ${osmFeatures.length} OSM features. Ready to generate.`, 'info');
    $('viewport-hint').textContent = '· OSM data imported';
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'OSM import failed.', 'error');
  } finally {
    busy = false; importButton.disabled = !selectedBounds || !validateSelection(selectedBounds).ok;
  }
});
$('generate-city').addEventListener('click', () => {
  if (!selectedBounds || !osmFeatures.length || busy) return;
  busy = true; generateButton.disabled = true; setStatus('Generating editable 3D city geometry…');
  try {
    if (cityGroup) {
      scene.scene.remove(cityGroup);
      cityGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose()); else object.material.dispose(); }
      });
    }
    const result = generateCity(osmFeatures, selectedBounds);
    cityGroup = result.group; generationStats = result.stats;
    scene.scene.add(cityGroup);
    const mapSize = boundsSizeMeters(selectedBounds);
    const size = Math.max(mapSize.width, mapSize.height, 120);
    scene.controls.target.set(0, 0, 0);
    scene.camera.position.set(size * 0.8, size * 0.72, size * 0.8);
    scene.controls.update();
    $('generation-report').textContent = `${result.stats.buildings} buildings · ${result.stats.roads} roads · ${result.stats.sidewalks} sidewalk segments · ${result.stats.intersections} junctions · ${result.stats.greenAreas} green areas · ${result.stats.waterAreas} water areas · ${result.stats.skipped} skipped. Building heights without OSM height/levels are estimates.`;
    $('viewport-hint').textContent = `· ${result.stats.buildings} buildings / ${result.stats.roads} roads`;
    setStep('step-generate', true); exportButton.disabled = cityGroup.children.length === 0;
    setStatus('3D city generated. Orbit, pan and zoom to inspect.', 'info');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'City generation failed.', 'error');
  } finally { busy = false; generateButton.disabled = osmFeatures.length === 0; }
});
$('view-orbit').addEventListener('click', () => scene.setPerspective());
$('view-top').addEventListener('click', () => scene.setTopDown(700));
$('frame-city').addEventListener('click', () => {
  if (!cityGroup) return;
  const box = new THREE.Box3().setFromObject(cityGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const distance = Math.max(size.x, size.z, 100) * 0.85;
  scene.controls.target.copy(center);
  scene.camera.position.set(center.x + distance, center.y + distance * 0.75, center.z + distance);
  scene.controls.update();
});
$('export-glb').addEventListener('click', async () => {
  if (!cityGroup) return;
  setStatus('Preparing GLB export…');
  try {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(cityGroup, { binary: true, onlyVisible: true });
    const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    downloadBlob(blob, 'dhaka-city-tile.glb');
    setStep('step-export', true); setStatus('GLB export ready. Check your downloads.');
  } catch (error) { setStatus(error instanceof Error ? error.message : 'GLB export failed.', 'error'); }
});
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}
$('save-project').addEventListener('click', () => {
  const project = { schemaVersion: 1, name: 'GTA Dhaka · City Tile', bounds: selectedBounds, features: osmFeatures, generationStats, savedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors' };
  downloadBlob(new Blob([JSON.stringify(project)], { type: 'application/json' }), 'dhaka-city-project.json');
  setStatus('Project JSON downloaded.');
});
$('load-project').addEventListener('click', () => {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as { bounds?: Bounds; features?: OSMFeature[] };
      if (!project.bounds || !Array.isArray(project.features)) throw new Error('Invalid Dhaka project file.');
      selectedBounds = project.bounds; osmFeatures = project.features; selector.setSelection(selectedBounds); updateSelection(selectedBounds);
      $('feature-count').textContent = String(osmFeatures.length);
      $('building-count').textContent = String(osmFeatures.filter((f) => f.type === 'way' && Boolean(f.tags?.building)).length);
      $('road-count').textContent = String(osmFeatures.filter((f) => f.type === 'way' && Boolean(f.tags?.highway)).length);
      generateButton.disabled = false; setStatus('Project loaded. Generate the 3D city to restore its scene.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not load project.', 'error'); }
  });
  input.click();
});
mapView.whenReady().then(() => {
  selector.init();
  mapView.map.resize();
  setStatus('Ready. Select a small area in Dhaka to begin.');
}).catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'Map failed to initialize.', 'error'));
window.addEventListener('beforeunload', () => { selector.setActive(false); picker.dispose(); scene.dispose(); mapView.map.remove(); });
