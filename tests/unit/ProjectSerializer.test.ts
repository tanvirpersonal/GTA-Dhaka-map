import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../../src/project/ProjectSerializer';
import { defaultLayers } from '../../src/types/project';

const base = () => ({
  bounds: { west: 90.39, south: 23.75, east: 90.41, north: 23.77 },
  import: { features: [], counts: { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 }, warnings: [] },
  overrides: { 'way/1': { heightM: 30 }, 'way/2': { hidden: true } },
  layers: defaultLayers(),
});

describe('project file', () => {
  it('round-trips', () => {
    const p = parseProject(serializeProject(base()));
    expect(p.bounds).toEqual(base().bounds);
    expect(p.overrides).toEqual(base().overrides);
    expect(p.layers.roads.visible).toBe(true);
  });

  it('rejects bad json, wrong format and wrong version', () => {
    expect(() => parseProject('not json')).toThrow(/JSON/);
    expect(() => parseProject('{"format":"other"}')).toThrow(/project file/);
    const bad = JSON.parse(serializeProject(base()));
    bad.version = 99;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/version/);
  });

  it('rejects invalid bounds and import data', () => {
    const a = JSON.parse(serializeProject(base()));
    a.bounds.west = 'x';
    expect(() => parseProject(JSON.stringify(a))).toThrow(/bounds/);
    const b = JSON.parse(serializeProject(base()));
    delete b.import.features;
    expect(() => parseProject(JSON.stringify(b))).toThrow(/import/);
  });

  it('drops invalid overrides and fills missing layers with defaults', () => {
    const j = JSON.parse(serializeProject(base()));
    j.overrides = { 'way/1': { heightM: -5, widthM: 'wide', hidden: 'yes' }, 'way/2': { heightM: 12 } };
    j.layers = { roads: { visible: false, color: 255 } };
    const p = parseProject(JSON.stringify(j));
    expect(p.overrides).toEqual({ 'way/2': { heightM: 12 } });
    expect(p.layers.roads).toEqual({ visible: false, color: 255 });
    expect(p.layers.buildings.visible).toBe(true);
  });
});
