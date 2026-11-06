import type { Overrides } from '../types/project';

const MAX_STEPS = 200;

/** Undo/redo over immutable snapshots of the override map. */
export class EditHistory {
  private past: Overrides[] = [];
  private future: Overrides[] = [];
  private present: Overrides;

  constructor(initial: Overrides = {}) {
    this.present = initial;
  }

  get current(): Overrides {
    return this.present;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record a new state; clears the redo stack. */
  commit(next: Overrides): void {
    this.past.push(this.present);
    if (this.past.length > MAX_STEPS) this.past.shift();
    this.present = next;
    this.future = [];
  }

  /** Patch a single feature's override and commit. Empty patches are removed. */
  patch(id: string, patch: Overrides[string] | null): void {
    const next = { ...this.present };
    if (patch === null || Object.keys(patch).length === 0) delete next[id];
    else next[id] = patch;
    this.commit(next);
  }

  undo(): Overrides | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.present);
    this.present = prev;
    return prev;
  }

  redo(): Overrides | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.present);
    this.present = next;
    return next;
  }

  /** Replace everything (e.g. after opening a project). */
  reset(initial: Overrides = {}): void {
    this.past = [];
    this.future = [];
    this.present = initial;
  }
}

/** Feature ids whose override differs between two snapshots (added, removed or changed). */
export function changedIds(a: Overrides, b: Overrides): string[] {
  const out: string[] = [];
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) out.push(id);
  }
  return out;
}
