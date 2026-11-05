/** Geographic bounds in WGS84 degrees. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type StatusLevel = 'info' | 'warn' | 'error';

export interface StatusMessage {
  level: StatusLevel;
  text: string;
}

export interface AppState {
  /** Currently selected map area, or null when nothing is selected. */
  selection: Bounds | null;
  status: StatusMessage;
}
