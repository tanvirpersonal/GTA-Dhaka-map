import type * as maplibregl from 'maplibre-gl';
import type { Bounds } from '../types/editor';
import { boundsFromCorners } from './DhakaBounds';

const SOURCE_ID = 'selection';
const FILL_ID = 'selection-fill';
const LINE_ID = 'selection-line';

type Corner = { lng: number; lat: number };

function toGeoJSON(b: Bounds): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [b.west, b.south],
          [b.east, b.south],
          [b.east, b.north],
          [b.west, b.north],
          [b.west, b.south],
        ],
      ],
    },
  };
}

/** Rectangle selection tool: click "Select Area", then drag on the map. */
export class AreaSelector {
  private active = false;
  private start: Corner | null = null;
  private current: Bounds | null = null;

  /** Fires while dragging (preview) and once on release (final). */
  onChange: (bounds: Bounds | null, final: boolean) => void = () => {};
  onActiveChange: (active: boolean) => void = () => {};

  constructor(private readonly map: maplibregl.Map) {
    map.on('mousedown', this.handleDown);
    map.on('mousemove', this.handleMove);
    map.on('mouseup', this.handleUp);
    map.on('touchstart', this.handleDown);
    map.on('touchmove', this.handleMove);
    map.on('touchend', this.handleUp);
    // Escape cancels an in-progress drag or leaves select mode.
    window.addEventListener('keydown', this.handleKey);
  }

  /** Add the selection layers once the style is loaded. */
  init(): void {
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    this.map.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': '#f5b942', 'fill-opacity': 0.2 },
    });
    this.map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': '#f5b942', 'line-width': 2 },
    });
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.start = null;
    this.map.getCanvas().style.cursor = active ? 'crosshair' : '';
    if (active) {
      this.map.dragPan.disable();
      this.map.touchZoomRotate.disableRotation();
    } else {
      this.map.dragPan.enable();
    }
    this.onActiveChange(active);
  }

  /** Show a selection (e.g. restored from a saved project) or clear it with null. */
  setSelection(bounds: Bounds | null): void {
    this.current = bounds;
    this.draw(bounds);
  }

  clear(): void {
    this.start = null;
    this.setSelection(null);
    this.onChange(null, true);
  }

  private draw(bounds: Bounds | null): void {
    const src = this.map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(bounds ? toGeoJSON(bounds) : { type: 'FeatureCollection', features: [] });
  }

  private handleDown = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void => {
    if (!this.active) return;
    this.start = { lng: e.lngLat.lng, lat: e.lngLat.lat };
  };

  private handleMove = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void => {
    if (!this.active || !this.start) return;
    const bounds = boundsFromCorners(this.start, e.lngLat);
    this.current = bounds;
    this.draw(bounds);
    this.onChange(bounds, false);
  };

  private handleUp = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void => {
    if (!this.active || !this.start) return;
    const bounds = boundsFromCorners(this.start, e.lngLat);
    this.start = null;
    this.current = bounds;
    this.draw(bounds);
    this.onChange(bounds, true);
    this.setActive(false);
  };

  private handleKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !this.active) return;
    this.start = null;
    this.draw(this.current);
    this.setActive(false);
  };
}
