import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/editor.css';
import { App } from './app/App';

// MapLibre GL JS v6 requires an explicit worker URL when bundled by Vite.
// Vite emits this worker as a hashed asset and applies the GitHub Pages base path.
setWorkerUrl(workerUrl);

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

new App(root);
