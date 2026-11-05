import { defineConfig } from 'vite';

// GitHub Pages serves the project at /<repo-name>/, so the base path must match.
// Override with VITE_BASE (e.g. "/" for local preview or a custom domain).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/GTA-Dhaka-map/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
