import type { FeatureOverride } from '../../types/project';

export interface PropertyTarget {
  id: string;
  layer: string;
  kind: string;
  /** Effective values currently shown in the 3D view. */
  heightM?: number;
  widthM?: number;
  hidden: boolean;
  edited: boolean;
  tags: Record<string, string>;
}

export interface PropertiesHandlers {
  onEdit: (id: string, patch: FeatureOverride) => void;
  onReset: (id: string) => void;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Right-hand panel for editing the selected building / road. All text is set via textContent (OSM tags are untrusted). */
export class PropertiesPanel {
  constructor(private readonly root: HTMLElement, private readonly handlers: PropertiesHandlers) {
    this.show(null);
  }

  show(t: PropertyTarget | null): void {
    this.root.replaceChildren();
    if (!t) {
      this.root.append(make('p', 'hint', 'Click a building or road in the 3D view to edit it.'));
      return;
    }

    const title = t.tags.name || t.tags['name:en'] || `${t.kind} ${t.id}`;
    this.root.append(make('div', 'prop-title', title), make('div', 'hint', `${t.kind} · ${t.id}`));

    if (t.heightM !== undefined) this.root.append(this.numberField('Height (m)', t.heightM, 2.5, 400, 0.5, (v) => this.handlers.onEdit(t.id, { heightM: v })));
    if (t.widthM !== undefined) this.root.append(this.numberField('Width (m)', t.widthM, 0.5, 60, 0.5, (v) => this.handlers.onEdit(t.id, { widthM: v })));

    const row = make('div', 'tool-row');
    const hide = make('button', undefined, t.hidden ? 'Show' : 'Hide');
    hide.addEventListener('click', () => this.handlers.onEdit(t.id, { hidden: !t.hidden }));
    const reset = make('button', undefined, 'Reset');
    reset.disabled = !t.edited;
    reset.addEventListener('click', () => this.handlers.onReset(t.id));
    row.append(hide, reset);
    this.root.append(row);

    const tagKeys = Object.keys(t.tags).slice(0, 24);
    if (tagKeys.length) {
      const dl = make('dl', 'kv');
      for (const k of tagKeys) dl.append(make('dt', undefined, k), make('dd', undefined, t.tags[k]));
      this.root.append(make('h3', undefined, 'OSM tags'), dl);
    }
  }

  private numberField(label: string, value: number, min: number, max: number, step: number, onCommit: (v: number) => void): HTMLElement {
    const wrap = make('label', 'field');
    const input = make('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(Math.round(value * 100) / 100);
    // 'change' fires on blur/enter, so one edit = one undo step.
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)));
    });
    wrap.append(make('span', undefined, label), input);
    return wrap;
  }
}
