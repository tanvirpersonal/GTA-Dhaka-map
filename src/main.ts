import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/editor.css';
import { App } from './app/App';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

new App(root);
