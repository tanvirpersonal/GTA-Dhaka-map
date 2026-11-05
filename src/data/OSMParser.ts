import type { OverpassElement, OverpassResponse } from './OSMClient';
import type {
  AreaFeature,
  BuildingFeature,
  FeatureCounts,
  ImportResult,
  ImportWarning,
  LineFeature,
  LonLat,
  MapFeature,
} from '../types/features';

type Geom = { lat: number; lon: number }[];

const PATH_HIGHWAYS = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'bridleway', 'track', 'corridor']);
const SKIP_HIGHWAYS = new Set(['proposed', 'construction', 'platform', 'bus_stop', 'elevator', 'raceway']);
const WATERWAYS = new Set(['river', 'canal', 'stream', 'drain']);
const GREEN_LEISURE = new Set(['park', 'garden', 'playground', 'pitch']);
const GREEN_LANDUSE = new Set(['grass', 'forest', 'recreation_ground', 'village_green']);
const GREEN_NATURAL = new Set(['wood', 'scrub', 'grassland']);

const toRing = (g: Geom): LonLat[] => g.map((p) => [p.lon, p.lat]);

const isClosed = (r: LonLat[]): boolean =>
  r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

function pointInRing(pt: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Parse "12", "12 m" or "40 ft" into metres. */
export function parseMeters(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return /ft|'/.test(v) ? n * 0.3048 : n;
}

const parsePositive = (v: string | undefined): number | undefined => {
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Parse raw Overpass elements into normalized features with counts and warnings. */
export function parseOverpass(res: OverpassResponse): ImportResult {
  const features: MapFeature[] = [];
  const warnings: ImportWarning[] = [];
  let skippedOpen = 0;
  let skippedNoGeom = 0;

  if (res.remark) warnings.push({ code: 'remark', message: `Overpass remark: ${res.remark}` });

  const areaKind = (t: Record<string, string>): 'building' | 'water' | 'green' | null => {
    if (t.building) return 'building';
    if (t.natural === 'water') return 'water';
    if (GREEN_LEISURE.has(t.leisure) || GREEN_LANDUSE.has(t.landuse) || GREEN_NATURAL.has(t.natural)) return 'green';
    return null;
  };

  const pushArea = (
    id: string,
    kind: 'building' | 'water' | 'green',
    tags: Record<string, string>,
    outer: LonLat[],
    holes: LonLat[][],
  ) => {
    if (kind === 'building') {
      const f: BuildingFeature = {
        id,
        kind,
        tags,
        outer,
        holes,
        heightM: parseMeters(tags.height) ?? parseMeters(tags['building:height']),
        levels: parsePositive(tags['building:levels']),
      };
      features.push(f);
    } else {
      const f: AreaFeature = { id, kind, tags, outer, holes };
      features.push(f);
    }
  };

  const handleWay = (el: OverpassElement) => {
    const tags = el.tags ?? {};
    const id = `way/${el.id}`;
    if (!el.geometry || el.geometry.length < 2) {
      skippedNoGeom++;
      return;
    }
    const pts = toRing(el.geometry);

    const aKind = areaKind(tags);
    if (aKind) {
      if (!isClosed(pts)) {
        skippedOpen++;
        return;
      }
      pushArea(id, aKind, tags, pts, []);
      return;
    }

    if (tags.highway) {
      if (SKIP_HIGHWAYS.has(tags.highway) || tags.area === 'yes') return;
      const f: LineFeature = {
        id,
        kind: PATH_HIGHWAYS.has(tags.highway) ? 'path' : 'road',
        tags,
        points: pts,
        highway: tags.highway,
        widthM: parseMeters(tags.width),
        lanes: parsePositive(tags.lanes),
        oneway: tags.oneway === 'yes' || tags.oneway === '1',
      };
      features.push(f);
      return;
    }

    if (WATERWAYS.has(tags.waterway)) {
      features.push({
        id,
        kind: 'waterway',
        tags,
        points: pts,
        highway: tags.waterway,
        widthM: parseMeters(tags.width),
      });
    }
  };

  const handleRelation = (el: OverpassElement) => {
    const tags = el.tags ?? {};
    const kind = areaKind(tags);
    if (!kind || !el.members) return;
    const rings = (role: string) =>
      el
        .members!.filter((m) => m.role === role && m.geometry && m.geometry.length > 3)
        .map((m) => toRing(m.geometry!))
        .filter(isClosed);
    const outers = rings('outer');
    const inners = rings('inner');
    if (outers.length === 0) {
      skippedOpen++;
      return;
    }
    outers.forEach((outer, i) => {
      const holes = inners.filter((h) => pointInRing(h[0], outer));
      pushArea(`relation/${el.id}#${i}`, kind, tags, outer, holes);
    });
  };

  for (const el of res.elements) {
    if (el.type === 'way') handleWay(el);
    else if (el.type === 'relation') handleRelation(el);
  }

  if (skippedOpen > 0)
    warnings.push({ code: 'open-ring', message: `${skippedOpen} area(s) skipped: ring not closed.` });
  if (skippedNoGeom > 0)
    warnings.push({ code: 'no-geometry', message: `${skippedNoGeom} way(s) skipped: no geometry.` });

  const counts: FeatureCounts = { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 };
  for (const f of features) counts[f.kind]++;

  if (features.length === 0) warnings.push({ code: 'empty', message: 'No features found in this area.' });
  if (counts.building === 0 && features.length > 0)
    warnings.push({ code: 'no-buildings', message: 'No buildings found; OSM coverage may be sparse here.' });

  return { features, counts, warnings };
}
