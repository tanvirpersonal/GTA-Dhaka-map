import type { Bounds } from '../types/editor';

export const DHAKA_EXTENT: Bounds = { west: 90.30, south: 23.65, east: 90.52, north: 23.92 };
export const TEJGAON_CENTER: [number, number] = [90.3995, 23.7625];
/** Full Dhaka coverage envelope is approximately 670 km². */
export const MAX_AREA_KM2 = 700;
export const WARN_AREA_KM2 = 4.0;

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

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

export function boundsFromCorners(a: { lng: number; lat: number }, b: { lng: number; lat: number }): Bounds {
  return { west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng), south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat) };
}

export function isInsideDhaka(b: Bounds): boolean {
  return b.west >= DHAKA_EXTENT.west && b.east <= DHAKA_EXTENT.east &&
    b.south >= DHAKA_EXTENT.south && b.north <= DHAKA_EXTENT.north;
}

export interface SelectionCheck { ok: boolean; level: 'ok' | 'warn' | 'error'; message: string; }

export function validateSelection(b: Bounds): SelectionCheck {
  if (!isInsideDhaka(b)) return { ok: false, level: 'error', message: 'Selection is outside the supported Dhaka coverage area.' };
  const area = boundsAreaKm2(b);
  if (area < 0.0005) return { ok: false, level: 'error', message: 'Selection is too small. Drag a larger rectangle.' };
  if (area > MAX_AREA_KM2) return { ok: false, level: 'error', message: 'Selection exceeds the Dhaka coverage envelope.' };
  if (area > WARN_AREA_KM2) return {
    ok: true, level: 'warn',
    message: area > 100
      ? `Very large city import: ${area.toFixed(0)} km². Import may take a long time; cached tiles are reused if you resume.`
      : `Large selection: ${area.toFixed(2)} km². Importing and generating may be slow.`,
  };
  return { ok: true, level: 'ok', message: 'Selection size is fine.' };
}
