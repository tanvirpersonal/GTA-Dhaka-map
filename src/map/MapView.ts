import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DHAKA_EXTENT, TEJGAON_CENTER } from './DhakaBounds';

/** OSM raster tiles. Attribution is required by the ODbL / OSM tile policy. */
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** Interactive 2D Dhaka map (MapLibre GL JS). */
export class MapView {
  readonly map: maplibregl.Map;

  constructor(container: HTMLElement) {
    this.map = new maplibregl.Map({
      container,
      style: OSM_STYLE,
      center: TEJGAON_CENTER,
      zoom: 15,
      minZoom: 10,
      maxBounds: [
        [DHAKA_EXTENT.west - 0.05, DHAKA_EXTENT.south - 0.05],
        [DHAKA_EXTENT.east + 0.05, DHAKA_EXTENT.north + 0.05],
      ],
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  }

  whenReady(): Promise<void> {
    if (this.map.loaded()) return Promise.resolve();
    return new Promise((resolve) => this.map.once('load', () => resolve()));
  }

  fitTo(west: number, south: number, east: number, north: number): void {
    this.map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 40, duration: 500 },
    );
  }

  resize(): void {
    this.map.resize();
  }
}
