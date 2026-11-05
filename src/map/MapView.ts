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

  /** Draw the imported 250 m generation grid over the OSM map. */
  setCityBlocks(blocks: Array<{ id: string; bounds: { west: number; south: number; east: number; north: number }; counts: Record<string, number> }>): void {
    const apply = () => {
      const sourceId = 'city-block-grid';
      const data: GeoJSON.FeatureCollection<GeoJSON.Polygon, { id: string; features: number; buildings: number }> = {
        type: 'FeatureCollection',
        features: blocks.map((block) => ({ type: 'Feature', properties: { id: block.id, features: Object.values(block.counts).reduce((sum, value) => sum + value, 0), buildings: block.counts.building ?? 0 }, geometry: { type: 'Polygon', coordinates: [[[block.bounds.west, block.bounds.south], [block.bounds.east, block.bounds.south], [block.bounds.east, block.bounds.north], [block.bounds.west, block.bounds.north], [block.bounds.west, block.bounds.south]]] } })),
      };
      const existing = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existing) existing.setData(data);
      else {
        this.map.addSource(sourceId, { type: 'geojson', data });
        this.map.addLayer({ id: 'city-block-fill', type: 'fill', source: sourceId, paint: { 'fill-color': ['case', ['>', ['get', 'features'], 0], '#16a34a', '#64748b'], 'fill-opacity': 0.10 } });
        this.map.addLayer({ id: 'city-block-outline', type: 'line', source: sourceId, paint: { 'line-color': '#f59e0b', 'line-width': 1.2, 'line-opacity': 0.9 } });
      }
    };
    if (this.map.isStyleLoaded()) apply(); else this.map.once('load', apply);
  }
  resize(): void {
    this.map.resize();
  }
}
