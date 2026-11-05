import type { Bounds } from '../types/editor';

export interface OSMNode { lat: number; lon: number }
export interface OSMWay {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: OSMNode[];
  tags?: Record<string, string>;
}
export interface OSMRelation {
  type: 'relation';
  id: number;
  members?: Array<{ type: string; role: string; geometry?: OSMNode[] }>;
  tags?: Record<string, string>;
}
export type OSMFeature = OSMWay | OSMRelation;
export interface OSMResponse { elements: OSMFeature[] }

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export function buildQuery(bounds: Bounds): string {
  const box = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:45];(way["building"](${box});way["highway"](${box});way["natural"="water"](${box});way["waterway"](${box});way["leisure"="park"](${box});way["landuse"~"grass|forest|recreation_ground"](${box}););out geom;`;
}

export async function fetchOSM(bounds: Bounds, signal?: AbortSignal): Promise<OSMResponse> {
  const query = buildQuery(bounds);
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!response.ok) throw new Error(`OSM service returned HTTP ${response.status}`);
      const data = (await response.json()) as OSMResponse;
      if (!Array.isArray(data.elements)) throw new Error('Unexpected OSM response format.');
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'All OpenStreetMap data services are unavailable.');
}
