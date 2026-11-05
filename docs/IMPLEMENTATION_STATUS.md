# Implementation Status — ChatGPT Development

Branch: `chatgpt-development`

## Delivered in this branch

- Vite application entry point and dark editor shell.
- Dhaka map view using MapLibre and OpenStreetMap raster tiles.
- Rectangle area selection with Dhaka extent and 1 km² V1 guardrail.
- OpenStreetMap Overpass import for building, highway, park/green and water ways.
- Local metric scene coordinates for the selected map tile.
- Procedural building extrusion using OSM height / building-level tags where available, otherwise clearly documented estimates.
- Basic road ribbon geometry with road-class width defaults.
- Simple park and water polygon meshes.
- Three.js scene integration, orbit controls, top-down view and frame-city action.
- GLB export through Three.js GLTFExporter.
- JSON project save and load.
- OSM attribution in the editor.
- GitHub Actions build workflow.

## Current limitations

- The current generator is a first playable geometry prototype, not a photorealistic city reconstruction.
- OSM public Overpass endpoints can rate-limit or be temporarily unavailable. The app tries two public instances; production use should use a managed provider or self-hosted service.
- Building height defaults are estimates where OSM has no height or level tags.
- Road geometry is a simple ribbon; intersections, lane markings, curbs, sidewalks and traffic assets need later work.
- Multipolygon relations, inner rings/holes, terrain elevation, textures, collision meshes and chunk streaming are not yet implemented.
- The backend is intentionally not required for this browser-first milestone. GitHub Pages cannot host FastAPI or a database.
- Export is currently a single GLB scene; tile-based export and Unreal-specific collision/material setup are future milestones.

## Next milestones

1. Verify CI build and resolve any TypeScript/build issues it reports.
2. Improve road junctions and polygon/multipolygon handling.
3. Add selectable scene objects and editable height/width properties.
4. Add tile-based exports and a documented Unreal import test.
5. Add a backend only when import size, persistence or collaboration requires it.
