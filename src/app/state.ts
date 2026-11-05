import type { AppState, Bounds, StatusMessage } from '../types/editor';
import { Emitter } from './events';

interface StateEvents extends Record<string, unknown> {
  selection: Bounds | null;
  status: StatusMessage;
}

/** Single source of truth for editor state. Modules subscribe to changes. */
class Store extends Emitter<StateEvents> {
  private state: AppState = {
    selection: null,
    status: { level: 'info', text: 'Ready. Draw a rectangle on the map to select an area.' },
  };

  get selection(): Bounds | null {
    return this.state.selection;
  }

  get status(): StatusMessage {
    return this.state.status;
  }

  setSelection(bounds: Bounds | null): void {
    this.state.selection = bounds;
    this.emit('selection', bounds);
  }

  setStatus(level: StatusMessage['level'], text: string): void {
    this.state.status = { level, text };
    this.emit('status', this.state.status);
  }
}

export const store = new Store();
