import type { Bounds } from '../types/editor';

/** Overpass server-side timeout in seconds. */
export const OVERPASS_TIMEOUT_S = 25;

/**
 * Build a bounded Overpass QL query for buildings, roads, paths,
 * water and green areas inside the given bounds.
 * Overpass bbox order is (south, west, north, east).
 */
export function buildOverpassQuery(b: Bounds): string {
  const bbox = `${b.south.toFixed(6)},${b.west.toFixed(6)},${b.north.toFixed(6)},${b.east.toFixed(6)}`;
  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  way["building"](${bbox});
  relation["building"]["type"="multipolygon"](${bbox});
  way["highway"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"~"^(river|canal|stream|drain)$"](${bbox});
  relation["natural"="water"]["type"="multipolygon"](${bbox});
  way["leisure"~"^(park|garden|playground|pitch)$"](${bbox});
  way["landuse"~"^(grass|forest|recreation_ground|village_green)$"](${bbox});
  way["natural"~"^(wood|scrub|grassland)$"](${bbox});
);
out body geom;`;
}
