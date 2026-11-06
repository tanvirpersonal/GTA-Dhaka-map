import type { CellStatus, ProgressSnapshot } from '../../app/GridProgress';
import { GRID_SIZE } from '../../data/WorldGrid';

const LABEL: Record<CellStatus, string> = {
  pending: 'waiting',
  importing: 'importing',
  imported: 'imported, waiting for 3D',
  generating: 'generating 3D',
  ready: 'ready',
  error: 'failed',
};

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

interface Bar {
  fill: HTMLElement;
  value: HTMLElement;
  track: HTMLElement;
}

/** Two progress bars (imported / generated) plus a size x size map of cell states. North is at the top. */
export class ProgressPanel {
  private readonly imported: Bar;
  private readonly generated: Bar;
  private readonly counts = make('div', 'hint progress-counts');
  private readonly cellEls = new Map<string, HTMLElement>();
  private pending: ProgressSnapshot | null = null;
  private raf = 0;

  constructor(
    private readonly root: HTMLElement,
    size = GRID_SIZE,
  ) {
    this.imported = this.bar('Imported');
    this.generated = this.bar('Generated in 3D');

    const map = make('div', 'cellmap');
    map.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    for (let row = size - 1; row >= 0; row--) {
      for (let col = 0; col < size; col++) {
        const id = `r${row}c${col}`;
        const c = make('div', 'cell st-pending');
        c.title = `Cell ${row + 1},${col + 1}: ${LABEL.pending}`;
        this.cellEls.set(id, c);
        map.append(c);
      }
    }
    this.root.append(this.imported.track.parentElement!, this.generated.track.parentElement!, this.counts, map);
    this.renderNow(this.empty(size));
  }

  /** Queue an update; the DOM is touched at most once per animation frame. */
  update(s: ProgressSnapshot): void {
    this.pending = s;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.pending) this.renderNow(this.pending);
    });
  }

  /** Back to all-waiting, 0%. */
  reset(): void {
    this.pending = null;
    this.renderNow(this.empty(Math.round(Math.sqrt(this.cellEls.size))));
  }

  private empty(size: number): ProgressSnapshot {
    const statuses = new Map<string, CellStatus>();
    for (const id of this.cellEls.keys()) statuses.set(id, 'pending');
    return {
      importedPct: 0,
      generatedPct: 0,
      counts: { pending: size * size, importing: 0, imported: 0, generating: 0, ready: 0, error: 0 },
      statuses,
    };
  }

  private bar(label: string): Bar {
    const row = make('div', 'progress-row');
    const head = make('div', 'progress-head');
    const value = make('span', 'progress-value', '0%');
    head.append(make('span', undefined, label), value);
    const track = make('div', 'bar');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = make('div', 'bar-fill');
    track.append(fill);
    row.append(head, track);
    return { fill, value, track };
  }

  private setBar(b: Bar, pct: number): void {
    const p = Math.min(100, Math.max(0, pct));
    b.fill.style.width = `${p}%`;
    b.value.textContent = `${p >= 99.95 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
    b.track.setAttribute('aria-valuenow', String(Math.round(p)));
  }

  private renderNow(s: ProgressSnapshot): void {
    this.setBar(this.imported, s.importedPct);
    this.setBar(this.generated, s.generatedPct);
    const c = s.counts;
    this.counts.textContent =
      `Ready ${c.ready} · Generating ${c.generating} · Queued for 3D ${c.imported} · ` +
      `Importing ${c.importing} · Waiting ${c.pending} · Failed ${c.error}`;
    for (const [id, el] of this.cellEls) {
      const st = s.statuses.get(id) ?? 'pending';
      el.className = `cell st-${st}`;
      el.title = `Cell ${id}: ${LABEL[st]}`;
    }
  }
}
