# Desktop App Setup

Dhaka World Builder keeps its existing Vite, TypeScript, MapLibre and Three.js frontend. Tauri 2 wraps that frontend in a native desktop window and produces platform-specific installers. The GitHub Pages build remains supported.

## What this first desktop milestone includes

- A Tauri 2 application shell with a 1600 × 900 resizable window.
- Shared frontend source code for the browser and desktop builds.
- A desktop-specific Vite base path so bundled assets load from the app root rather than the GitHub Pages repository path.
- Native desktop packaging through the Tauri bundler.

This milestone does not rewrite the 3D engine or add native file-dialog APIs yet. Existing project open/save and export flows continue to use browser-compatible file inputs and downloads inside the desktop webview. Native file dialogs and background import processing are follow-up milestones.

## Performance expectations

A desktop wrapper does not automatically make Three.js geometry faster. The scene still renders through the operating system's webview and graphics stack. Tauri is being introduced for desktop distribution, window integration and a foundation for native capabilities. Large-city performance still requires engine work such as geometry batching, instancing, chunk visibility, LOD, and moving expensive parsing work off the UI thread.

## Requirements

### Linux Mint 22.x / Ubuntu

Install the Tauri system libraries and build tools:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Install Rust with rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

Install Node.js 22 or newer, then install the project dependencies:

```bash
npm ci
```

### Windows

Install:

1. Node.js 22 or newer.
2. Microsoft C++ Build Tools with the MSVC C++ build workload.
3. Microsoft Edge WebView2 Runtime (normally already present on supported Windows 10/11 installations).
4. Rust using rustup with the MSVC toolchain.

Then open a new terminal and run `npm ci`.

## Run the desktop app in development

From the repository root:

```bash
npm run desktop:dev
```

The Tauri CLI starts the Vite development server and opens the native application window. Keep the terminal open while developing.

## Build an installer

From the repository root:

```bash
npm run desktop:build
```

The Tauri bundler writes platform-specific packages under:

```text
src-tauri/target/release/bundle/
```

Linux packages are generated on Linux; Windows installers must be built on Windows. A Linux build does not produce a tested Windows installer.

## Browser build remains unchanged

```bash
npm run dev
npm run build
```

The normal Vite build continues to use `/GTA-Dhaka-map/` for GitHub Pages. Tauri sets `TAURI_ENV_PLATFORM` for its frontend commands; the Vite config detects that variable and switches the desktop asset base to `/`.

## Next desktop milestones

1. Verify the app on Linux Mint and Windows.
2. Add native open/save dialogs and save large projects without browser download workarounds.
3. Add a desktop import worker/process boundary so long imports do not block the editor.
4. Add crash-safe project autosave and a recoverable job queue.
5. Profile real Dhaka tiles and optimize geometry batching, instancing and LOD based on measurements.
6. Add signed release packages and an update strategy only after the app is stable.
