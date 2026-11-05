import { LAYER_IDS, LAYER_LABELS, type LayerId, type LayerSettings, type Layers } from '../../types/project';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Visibility toggles and colour pickers for each generated layer. */
export class LayersPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly onChange: (id: LayerId, next: LayerSettings) => void,
  ) {}

  render(layers: Layers): void {
    this.root.replaceChildren();
    for (const id of LAYER_IDS) {
      const s = layers[id];
      const row = document.createElement('div');
      row.className = 'layer-row';

      const vis = document.createElement('input');
      vis.type = 'checkbox';
      vis.checked = s.visible;
      vis.setAttribute('aria-label', `Show ${LAYER_LABELS[id]}`);
      vis.addEventListener('change', () => this.onChange(id, { ...s, visible: vis.checked }));

      const name = document.createElement('span');
      name.textContent = LAYER_LABELS[id];

      const color = document.createElement('input');
      color.type = 'color';
      color.value = hex(s.color);
      color.setAttribute('aria-label', `${LAYER_LABELS[id]} colour`);
      color.addEventListener('change', () => this.onChange(id, { ...s, color: parseInt(color.value.slice(1), 16) }));

      row.append(vis, name, color);
      this.root.append(row);
    }
  }
}
