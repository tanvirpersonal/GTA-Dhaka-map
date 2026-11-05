import type { Bounds } from '../types/editor';

/** Rough extent of Dhaka (used to keep the map and selections on-topic). */
export const DHAKA_EXTENT: Bounds = {
  west: 90.30,
  south: 23.65,
  east: 90.52,
  north: 23.92,
};

/** Default map centre: Tejgaon Industrial Area, the first test area. */
export const TEJGAON_CENTER: [number, number] = [90.3995, 23.7625];

/** Maximum selection area for V1, in square kilometres. */
export const MAX_AREA_KM2 = 1.0;

/** Warn above this fraction of the maximum area. */
export const WARN_AREA_KM2 = 0.5;

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Approximate width/height of bounds in metres (equirectangular at mid-latitude). */
export function boundsSizeMeters(b: Bounds): { width: number; height: number } {
  const midLat = (b.south + b.north) / 2;
  const height = toRad(b.north - b.south) * EARTH_RADIUS_M;
  const width = toRad(b.east - b.west) * EARTH_RADIUS_M * Math.cos(toRad(midLat));
  return { width: Math.abs(width), height: Math.abs(height) };
}

export function boundsAreaKm2(b: Bounds): number {
  const { width, height } = boundsSizeMeters(b);
  return (width * height) / 1_000_000;
}

/** Normalise two arbitrary corner points into west/south/east/north bounds. */
export function boundsFromCorners(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): Bounds {
  return {
    west: Math.min(a.lng, b.lng),
    east: Math.max(a.lng, b.lng),
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
  };
}

export function isInsideDhaka(b: Bounds): boolean {
  return (
    b.west >= DHAKA_EXTENT.west &&
    b.east <= DHAKA_EXTENT.east &&
    b.south >= DHAKA_EXTENT.south &&
    b.north <= DHAKA_EXTENT.north
  );
}

export interface SelectionCheck {
  ok: boolean;
  level: 'ok' | 'warn' | 'error';
  message: string;
}

/** Validate a selection against the V1 Dhaka-only and size limits. */
export function validateSelection(b: Bounds): SelectionCheck {
  if (!isInsideDhaka(b)) {
    return { ok: false, level: 'error', message: 'Selection is outside the supported Dhaka area.' };
  }
  const area = boundsAreaKm2(b);
  if (area < 0.0005) {
    return { ok: false, level: 'error', message: 'Selection is too small. Drag a larger rectangle.' };
  }
  if (area > MAX_AREA_KM2) {
    return {
      ok: false,
      level: 'error',
      message: `Selection is ${area.toFixed(2)} km², above the ${MAX_AREA_KM2} km² V1 limit. Choose a smaller area.`,
    };
  }
  if (area > WARN_AREA_KM2) {
    return {
      ok: true,
      level: 'warn',
      message: 'Large selection: importing and generating may be slow.',
    };
  }
  return { ok: true, level: 'ok', message: 'Selection size is fine for a V1 import.' };
}
