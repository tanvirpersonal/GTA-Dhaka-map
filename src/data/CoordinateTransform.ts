import type { Bounds } from '../types/editor';
import type { LonLat } from '../types/features';

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

/**
 * Local equirectangular projection around an origin. Accurate to well under 1 m
 * over the <=1 km² selections this tool allows.
 * Output is [east, north] in metres; 1 unit = 1 metre.
 */
export class LocalProjection {
  private readonly cosLat: number;

  constructor(readonly originLon: number, readonly originLat: number) {
    this.cosLat = Math.cos((originLat * Math.PI) / 180);
  }

  static fromBounds(b: Bounds): LocalProjection {
    return new LocalProjection((b.west + b.east) / 2, (b.south + b.north) / 2);
  }

  toLocal([lon, lat]: LonLat): [east: number, north: number] {
    return [(lon - this.originLon) * this.cosLat * M_PER_DEG_LON_EQ, (lat - this.originLat) * M_PER_DEG_LAT];
  }

  toLonLat([east, north]: [number, number]): LonLat {
    return [this.originLon + east / (this.cosLat * M_PER_DEG_LON_EQ), this.originLat + north / M_PER_DEG_LAT];
  }
}
