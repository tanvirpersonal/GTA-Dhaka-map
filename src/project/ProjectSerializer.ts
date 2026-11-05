import type { Bounds } from '../types/editor';
import type { ImportResult } from '../types/features';
import {
  defaultLayers,
  LAYER_IDS,
  PROJECT_FORMAT,
  type Layers,
  type Overrides,
  type ProjectFile,
} from '../types/project';

export function serializeProject(input: {
  bounds: Bounds;
  import: ImportResult;
  overrides: Overrides;
  layers: Layers;
}): string {
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    ...input,
  };
  return JSON.stringify(file);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse and validate a project file. Throws a user-readable Error on bad input. */
export function parseProject(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) throw new Error('Not a Dhaka World Builder project file.');
  if (raw.version !== 1) throw new Error(`Unsupported project version: ${String(raw.version)}.`);

  const b = raw.bounds;
  if (!isObj(b) || !isNum(b.west) || !isNum(b.south) || !isNum(b.east) || !isNum(b.north))
    throw new Error('Project has invalid bounds.');
  const imp = raw.import;
  if (!isObj(imp) || !Array.isArray(imp.features) || !isObj(imp.counts) || !Array.isArray(imp.warnings))
    throw new Error('Project has invalid import data.');

  // Overrides: keep only known, well-typed fields.
  const overrides: Overrides = {};
  if (isObj(raw.overrides)) {
    for (const [id, v] of Object.entries(raw.overrides)) {
      if (!isObj(v)) continue;
      const o: Overrides[string] = {};
      if (isNum(v.heightM) && v.heightM > 0) o.heightM = v.heightM;
      if (isNum(v.widthM) && v.widthM > 0) o.widthM = v.widthM;
      if (v.hidden === true) o.hidden = true;
      if (Object.keys(o).length) overrides[id] = o;
    }
  }

  const layers = defaultLayers();
  if (isObj(raw.layers)) {
    for (const id of LAYER_IDS) {
      const l = raw.layers[id];
      if (isObj(l)) {
        if (typeof l.visible === 'boolean') layers[id].visible = l.visible;
        if (isNum(l.color)) layers[id].color = l.color & 0xffffff;
      }
    }
  }

  return {
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
    bounds: { west: b.west, south: b.south, east: b.east, north: b.north },
    import: imp as unknown as ImportResult,
    overrides,
    layers,
  };
}
