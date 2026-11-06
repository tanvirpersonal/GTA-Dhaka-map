# GTA Dhaka Map — Project Blueprint

> **Project:** Dhaka World Builder  
> **Purpose:** Build a browser-based tool that imports real Dhaka geographic data, converts it into an editable 3D city, and exports game-ready assets for the GTA Dhaka game.  
> **Current stage:** Active prototype — reliability, geometry quality, mobile UX and game-export validation in progress  
> **Initial scope:** Dhaka, Bangladesh only

---

## 1. Vision

Create a dedicated city-generation application for the GTA Dhaka project. The tool should let a developer select an area of Dhaka, download or import OpenStreetMap data, generate a navigable 3D representation, edit generated objects, and export the result to GLB/GLTF for use in Unreal Engine.

This is **not** the GTA game itself. It is the map-building pipeline and editor used to create the game's world.

### Core workflow

1. Open Dhaka World Builder in a browser.
2. View a 2D map of Dhaka.
3. Select a bounded area (start with a small test area).
4. Fetch geographic data for that area.
5. Parse roads, building footprints, paths, water and green areas.
6. Generate a 3D scene.
7. Edit roads, buildings, heights, materials and scene settings.
8. Preview the result in 3D.
9. Export selected areas or the full scene as GLB/GLTF.
10. Import exported assets into Unreal Engine and add game-specific details there.

---

## 2. Product goals

### V1 goals

- Dhaka-only map workflow.
- Select a rectangular map area.
- Import OpenStreetMap (OSM) data.
- Show road network and building footprints.
- Generate simple 3D roads and extruded buildings.
- Allow basic building height and road-width adjustments.
- Provide orbit, pan, zoom and top-down camera controls.
- Export the generated scene to GLB/GLTF.
- Save and reopen an editor project using JSON.
- Show source attribution and data/import warnings.

### Not in V1

- Full GTA gameplay, player controller or vehicle physics.
- Photorealistic reconstruction of every building.
- Guaranteed exact building heights where source data is missing.
- Interior generation for every building.
- Live multiplayer editing.
- Full Dhaka at maximum detail in one browser scene.
- Automatic extraction of Google Maps / Google Earth imagery.

---

## 3. Geographic scope and rollout

Do not generate the entire city at full detail in the first milestone. Start with a small, bounded test area and increase coverage only after performance and data quality are validated.

Suggested rollout:

1. **Test area:** a small block in Tejgaon Industrial Area.
2. **Pilot corridor:** Tejgaon — Farmgate.
3. **Expansion:** Dhanmondi and nearby connected roads.
4. **City coverage:** additional Dhaka areas, loaded as separate tiles/chunks.

The selected boundary should be configurable in the editor. These are development milestones, not a claim that all source data is complete.

---

## 4. Technology stack

### Frontend — GitHub Pages

- **Vite + TypeScript:** development server, bundling and type safety.
- **Three.js:** 3D viewport, geometry, materials, lighting and scene management.
- **MapLibre GL JS:** interactive 2D map and area selection.
- **OSM data client:** requests bounded map data from an approved OSM-compatible service.
- **Three.js GLTFExporter:** export the generated scene to GLB/GLTF.
- **IndexedDB:** local project persistence and cached import metadata.
- **Web Workers:** move expensive parsing and geometry preparation off the UI thread.

GitHub Pages hosts the static frontend only. It does not run Python, Node.js, databases or long-running background jobs.

### Optional backend — introduced when needed

- **Python + FastAPI:** API for large imports, validation, tile processing and job status.
- **PostgreSQL + PostGIS:** store project metadata, geographic features and processed tile indexes.
- **Object storage:** store large generated GLB files and source-data extracts.
- **Redis / task queue:** optional queue for long-running processing jobs.
- **Docker:** reproducible backend deployment.

The backend can be deployed separately (for example, to a suitable cloud host). The frontend on GitHub Pages calls it through HTTPS. Do not commit API secrets to the frontend repository.

### Why start without a mandatory backend?

A small V1 area can be processed in the browser. This keeps hosting simple and makes the first prototype easier to publish. Add the backend when imports become too large, processing needs persistence, or multiple users need shared projects.

---

## 5. High-level architecture

```text
                 GitHub Repository
                        |
                  GitHub Pages
                        |
             Browser Application (Vite)
                        |
       +----------------+----------------+
       |                |                |
   Map UI          3D Editor        Project Manager
 MapLibre           Three.js       IndexedDB / JSON
       |                |                |
       +----------------+----------------+
                        |
                 OSM Data Adapter
                        |
          OSM-compatible data service
                        |
                 OSM Feature Data
                        |
             Parser + Normalizer
                        |
              Local Metric Coordinates
                        |
             Procedural City Generator
                        |
            Editable Three.js Scene
                        |
                 GLB / GLTF Export
                        |
                  Unreal Engine

        Optional future API (FastAPI)
        - import orchestration
        - validation and large-area jobs
        - PostGIS / object storage
        - tile metadata and shared projects
```

### Main architectural rule

Keep geographic data, generated geometry, editor state and exported game assets separate. This allows the generator to be improved without losing the original map data.

---

## 6. Data sources and licensing

### Primary source: OpenStreetMap

Use OSM features where available:

- Buildings and building outlines.
- Roads, streets, service roads and paths.
- Road classifications and tags.
- Waterways and water bodies.
- Parks, green spaces and land-use polygons.
- Selected points of interest and named places.

OSM coverage and tag completeness vary by location. Some buildings have no height, level count or detailed classification. Missing values must be estimated and clearly marked as estimates.

**Attribution:** Display “© OpenStreetMap contributors” in the application and in relevant exported project documentation. Review and comply with the Open Database License (ODbL) and the terms of the chosen data service. Do not assume every OSM-derived dataset can be relicensed without conditions.

### Other references

- Publicly available elevation data may be evaluated for terrain if licensing and resolution are suitable.
- User-created Blender assets can add recognizable landmarks and local architectural detail.
- Do not scrape or redistribute Google Maps / Google Earth imagery or 3D content as game assets. Use services only under their applicable terms.

### Data service strategy

For the prototype, use a configurable OSM-compatible query endpoint. Implement request throttling, small bounding boxes, clear error messages and caching. Do not send repeated large-area queries or assume a public Overpass instance is unlimited. For production-scale imports, use a suitable provider or self-hosted data pipeline.

---

## 7. Geographic processing pipeline

### 7.1 Area selection

- User draws a rectangle on the 2D map.
- Store bounds as west, south, east, north (longitude/latitude).
- Display approximate area and warn when the selected region is too large.
- Allow the user to resize or clear the selection.

### 7.2 Import and parsing

Normalize source data into internal feature types:

- `BuildingFeature`
- `RoadFeature`
- `PathFeature`
- `WaterFeature`
- `GreenAreaFeature`
- `PointOfInterestFeature`

Preserve OSM element IDs, tags, names and source attribution where available. Validate geometry and discard or report malformed features rather than silently creating broken meshes.

### 7.3 Coordinate conversion

Do not create 3D geometry directly from raw latitude/longitude. Convert the selected Dhaka area into a local metric coordinate system (evaluate UTM zone 46N for Dhaka), then shift coordinates so the selected tile has a nearby local origin.

This avoids huge world coordinates and makes distances, widths and heights easier to work with. Store the original geographic coordinates alongside the local coordinates for traceability.

### 7.4 Geometry generation

- Buildings: polygon footprints extruded to a chosen height.
- Roads: buffered road centerlines converted into surfaces.
- Paths: narrower surfaces with separate material settings.
- Water: polygon surfaces with optional depth/shoreline treatment.
- Green areas: ground polygons with simple vegetation placeholders.
- Terrain: flat base in the first prototype; elevation support later.

Handle polygon holes, multipolygons, intersections and invalid geometry. Avoid generating duplicate overlapping road surfaces where possible.

---

## 8. Procedural building system

Height priority:

1. Use explicit OSM height tag when valid.
2. Otherwise use building:levels multiplied by a configurable floor-height estimate.
3. Otherwise use a configurable default based on building type or local profile.
4. Mark generated heights as estimated so they can be reviewed.

Building editor properties:

- Height.
- Number of floors (where applicable).
- Footprint visibility.
- Building type/category.
- Base and facade material.
- Roof style (later milestone).
- Name and source tags.
- Lock / hide / delete from generated scene.

V1 should use clean, efficient extruded geometry. Detailed windows, balconies, signs and rooftop equipment should be added later through instancing, facade modules or custom assets rather than creating thousands of unique high-poly meshes.

---

## 9. Procedural road system

Road properties:

- Source road class and name.
- Generated width (tag-driven where available, otherwise configurable defaults).
- Surface material.
- Sidewalk toggle and width.
- Lane marking toggle (later).
- Collision/export classification.

Road generation must account for connected segments, curves, intersections and different road classes. V1 can create basic road ribbons/surfaces. More accurate junction meshes, sidewalks, curbs, lane markings and traffic signals are later improvements.

---

## 10. Editor UI layout

Suggested desktop-first editor:

```text
+---------------------------------------------------------------+
| DHAKA WORLD BUILDER | Import | Generate | Save | Export       |
+------------------+---------------------------+----------------+
| MAP / TOOLS      |                           | PROPERTIES     |
|                  |       3D VIEWPORT          |                |
| Select Area      |                           | Selected item  |
| Import OSM       |       Orbit / Pan / Zoom   | Height         |
| Generate City    |       Grid / Gizmo         | Width          |
| Select Building  |                           | Material       |
| Select Road      |                           | Visibility     |
| Layers           |                           | Source tags    |
+------------------+---------------------------+----------------+
| STATUS: import progress | feature count | warnings | FPS      |
+---------------------------------------------------------------+
```

Main panels:

- **Top bar:** project name, import, generate, save, export.
- **Left panel:** map, selection, generation tools and layers.
- **Center:** 3D viewport.
- **Right panel:** properties of the selected feature.
- **Bottom status:** progress, warnings, counts and performance.

Mobile support can follow after the desktop editor workflow is stable.

---

## 11. Proposed repository structure

Start as a single Vite + TypeScript frontend with clear module boundaries. Keep backend code in its own folder so it can be deployed separately later.

```text
GTA-Dhaka-map/
├── README.md
├── LICENSE
├── NOTICE.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .gitignore
├── .env.example
│
├── public/
│   ├── favicon.svg
│   └── assets/
│       └── materials/
│
├── src/
│   ├── main.ts
│   ├── app/
│   │   ├── App.ts
│   │   ├── state.ts
│   │   └── events.ts
│   │
│   ├── ui/
│   │   ├── layout/
│   │   ├── panels/
│   │   ├── toolbar/
│   │   ├── dialogs/
│   │   └── status/
│   │
│   ├── map/
│   │   ├── MapView.ts
│   │   ├── AreaSelector.ts
│   │   └── DhakaBounds.ts
│   │
│   ├── data/
│   │   ├── OSMClient.ts
│   │   ├── OSMQueryBuilder.ts
│   │   ├── OSMParser.ts
│   │   ├── FeatureNormalizer.ts
│   │   ├── CoordinateTransform.ts
│   │   └── schemas.ts
│   │
│   ├── generator/
│   │   ├── CityGenerator.ts
│   │   ├── BuildingGenerator.ts
│   │   ├── RoadGenerator.ts
│   │   ├── PathGenerator.ts
│   │   ├── WaterGenerator.ts
│   │   ├── GreenAreaGenerator.ts
│   │   └── TerrainGenerator.ts
│   │
│   ├── editor/
│   │   ├── SelectionManager.ts
│   │   ├── TransformControls.ts
│   │   ├── BuildingEditor.ts
│   │   ├── RoadEditor.ts
│   │   └── LayerManager.ts
│   │
│   ├── renderer/
│   │   ├── SceneManager.ts
│   │   ├── CameraController.ts
│   │   ├── Lighting.ts
│   │   ├── Materials.ts
│   │   └── PerformanceManager.ts
│   │
│   ├── project/
│   │   ├── ProjectManager.ts
│   │   ├── ProjectSerializer.ts
│   │   └── LocalStorage.ts
│   │
│   ├── export/
│   │   ├── GLBExporter.ts
│   │   └── ExportValidator.ts
│   │
│   ├── workers/
│   │   └── GeometryWorker.ts
│   │
│   ├── types/
│   │   ├── features.ts
│   │   ├── project.ts
│   │   └── editor.ts
│   │
│   └── styles/
│       ├── tokens.css
│       ├── global.css
│       └── editor.css
│
├── backend/                     # Optional; not required for V1
│   ├── README.md
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   └── schemas/
│   │   ├── services/
│   │   │   ├── osm_import.py
│   │   │   ├── tile_processor.py
│   │   │   └── export_jobs.py
│   │   ├── models/
│   │   ├── database/
│   │   └── workers/
│   └── tests/
│
├── tests/
│   ├── unit/
│   └── integration/
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DATA_PIPELINE.md
    ├── EXPORT_TO_UNREAL.md
    ├── PERFORMANCE.md
    └── ROADMAP.md
```

This is the target structure, not a claim that all these files already exist. Create folders and modules as each milestone is implemented; avoid adding empty placeholder files without a purpose.

---

## 12. Backend design (future-ready)

### V1: browser-only

The browser handles small-area OSM requests, parsing, generation, editing, project saving and export. IndexedDB stores local project data. No account system or database server is required.

### V2: API service

When large areas or shared projects are needed, introduce FastAPI.

Proposed API:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Backend health |
| POST | `/api/v1/imports` | Start an OSM import job |
| GET | `/api/v1/imports/{job_id}` | Import status and errors |
| GET | `/api/v1/tiles/{tile_id}` | Fetch normalized tile data |
| POST | `/api/v1/projects` | Create project metadata |
| GET | `/api/v1/projects/{project_id}` | Read project metadata |
| PUT | `/api/v1/projects/{project_id}` | Update project metadata |
| POST | `/api/v1/exports` | Start a server-side export job |
| GET | `/api/v1/exports/{job_id}` | Export status and output reference |

### Backend processing flow

1. Validate the requested Dhaka bounding box and maximum area.
2. Create an import job and return a job ID.
3. Fetch source data through a configured provider.
4. Validate, normalize and project features.
5. Split output into manageable geographic tiles.
6. Store processed data and metadata.
7. Update job status and return tile references to the frontend.

### Backend security

- Keep provider keys and database credentials on the server only.
- Validate bounding boxes, payload size and request rates.
- Add CORS allow-list for the deployed frontend domain.
- Add authentication before enabling private/shared projects.
- Never trust client-supplied geometry or file paths.
- Set upload and export size limits.
- Log errors without exposing secrets.

---

## 13. Large-world performance strategy

A whole-city scene should not be loaded as one giant mesh.

- Split Dhaka into geographic tiles/chunks.
- Load only nearby or selected chunks.
- Use instancing for repeated props and vegetation.
- Merge static geometry by material where appropriate.
- Use LOD (level of detail) for buildings and distant objects.
- Frustum-cull objects outside the camera view.
- Dispose of unused geometries, materials and textures.
- Process large geometry tasks in Web Workers.
- Keep source feature data separate from render meshes.
- Export chunks separately for Unreal Engine World Partition.

V1 should enforce a small area limit and show a warning before attempting a large import.

---

## 14. Save format and export

### Editable project JSON

A project should preserve:

- Project ID and name.
- Selected geographic bounds.
- Source attribution and import timestamp.
- Original normalized features or references to them.
- Generation settings.
- Manual overrides (height, width, materials).
- Layer visibility and editor camera state.
- Export settings.

### Game asset export

- GLB for a compact single-file export.
- GLTF when separate assets and textures are useful.
- Export by tile or category when scenes become large.
- Use metric units and a documented axis/origin convention.
- Include a metadata file describing tile bounds, coordinate origin, scale, attribution and estimated values.
- Validate missing materials, invalid geometry and unusually large meshes before export.

The Unreal import guide must document scale, axis orientation, collision setup, material handling and chunk placement.

---

## 15. Development roadmap

### Milestone 0 — Foundation
- [x] Initialize Vite + TypeScript.
- [x] Add Three.js and MapLibre.
- [x] Set up linting, formatting and basic tests (strict `tsc` as the lint gate, Prettier, Vitest; ESLint is blocked until typescript-eslint supports TypeScript 7). Run `npm run check`.
- [x] Create dark editor shell and responsive layout.
- [x] Configure GitHub Pages deployment.

### Milestone 1 — Dhaka map and selection
- [x] Show an interactive Dhaka map.
- [x] Add rectangle area selection.
- [x] Store and validate selected bounds.
- [x] Show selected area coordinates and size.

### Milestone 2 — OSM import
- [x] Build bounded OSM query requests.
- [x] Add loading, retry and rate-limit handling.
- [x] Parse buildings, roads, paths, water and green areas.
- [x] Show feature counts and import warnings.
- [x] Cache small imports locally.

### Milestone 3 — 3D generation
- [x] Convert geographic coordinates to local metric coordinates.
- [x] Generate building extrusions.
- [x] Generate road surfaces.
- [x] Generate basic water and green-area surfaces.
- [x] Add camera controls, grid and lighting.

### Milestone 4 — Editor
- [x] Select generated buildings and roads.
- [x] Edit building heights and road widths.
- [x] Change materials and visibility.
- [x] Add undo/redo for editor changes.
- [x] Save and reopen project JSON.

### Milestone 5 — Export
- [x] Export GLB/GLTF.
- [x] Export selected tiles separately.
- [x] Validate geometry and material references.
- [x] Write Unreal Engine import documentation.
- [ ] Test exported assets in a small Unreal scene.

### Milestone 6 — Dhaka expansion
- [ ] Test Tejgaon–Farmgate corridor.
- [ ] Add Dhanmondi coverage.
- [ ] Improve intersections and sidewalks.
- [ ] Validate fragmented OSM multipolygon assembly and invalid-ring handling.
- [ ] Add tile streaming and LOD.
  - [x] Tiled import: selections up to 4 km² are fetched as ≤0.25 km² tiles, cached per tile and de-duplicated.
  - [ ] Stream tiles into the 3D scene and add LOD (generation is still one merged city per selection).
- [ ] Profile memory and frame rate.

### Milestone 7 — Optional backend
- [ ] Add FastAPI service.
- [ ] Add asynchronous import jobs.
- [ ] Add PostGIS and object storage if justified.
- [ ] Add project accounts/shared storage only when needed.

---

## 16. Quality and acceptance criteria

V1 is ready for a first release when:

- The app deploys and opens from GitHub Pages.
- A user can select a small area in Dhaka.
- The app can fetch and parse OSM features for that area.
- Roads and building footprints appear in the 3D viewport in approximately correct geographic positions.
- Building height defaults are identified as measured/tagged or estimated.
- The user can adjust a building height and see the result immediately.
- A project can be saved and reopened.
- A GLB export can be imported into a test Unreal Engine scene.
- The interface reports import errors and missing data rather than failing silently.
- OSM attribution and applicable license notices are visible.

---

## 17. Risks and decisions

| Risk | Mitigation |
|---|---|
| Missing or inaccurate building heights | Use tagged values first; mark estimates and allow editing |
| OSM service rate limits | Small requests, cache, throttle, configurable provider |
| Huge browser scenes | Area limits, chunks, LOD, workers |
| Complex road intersections | Start with simple surfaces; improve junction geometry incrementally |
| GitHub Pages has no backend runtime | Keep V1 browser-only; deploy API separately later |
| Exported model scale/orientation errors | Document local origin, units and axis conversion; test in Unreal |
| Licensing / attribution mistakes | Preserve OSM attribution and review ODbL obligations |

### Initial technical decisions

- Dhaka is the only supported city in the first release.
- Use Vite + TypeScript + Three.js + MapLibre for the frontend.
- Start browser-only; do not require a backend to test V1.
- Use OSM as the primary geographic source.
- Generate simple, editable geometry before pursuing photorealism.
- Export chunked GLB/GLTF assets for Unreal Engine.

---

## 18. Immediate next action

Implement **Milestone 0 and Milestone 1** first: initialize the frontend, publish the editor shell to GitHub Pages, show a Dhaka map, and allow the user to select a small rectangular area. Do not start full-city generation until the selection and data-import pipeline has been tested.

---


## 18. Current implementation status (6 November 2026)

The repository has moved beyond the original planning stage. The current code contains a browser editor and a first-generation map-to-3D pipeline.

### Implemented in source code

- MapLibre Dhaka map, rectangle selection, bounds validation and selection preview.
- OSM/Overpass request client with endpoint fallback, retry/backoff and abort signal support.
- OSM feature parsing for buildings, roads, paths, waterways, water and green areas, including an initial endpoint-stitching pass for fragmented multipolygon rings.
- Tiled import with a pause between uncached tile requests.
- IndexedDB tile cache with a seven-day TTL.
- A 10×10 centre-out grid pipeline that overlaps cell import with geometry generation.
- Three.js cell scene, layer visibility, feature picking and selection highlighting.
- Building-height and road-width overrides, undo/redo, project JSON save/open.
- GLB and per-layer ZIP export paths.
- Distance-based visibility LOD for building/path layers, currently using a fixed 2,500 m detail radius.

### Important limitations

- Current LOD hides distant detail layers; it does not substitute low-poly representations.
- Progressive cell generation exists, but camera-driven world streaming/unloading is not complete.
- Cell-edge features are de-duplicated by ID, not geometrically clipped. Road continuity needs tests.
- Multipolygon member ways can now be stitched by matching exact endpoint coordinates; ambiguous branching, self-intersections and broader geometry validity checks still need work.
- Selection raycasting traverses visible world objects on each click; spatial acceleration is not implemented.
- Cancellation/cache safeguards and fragmented multipolygon stitching have unit-test coverage committed, but the tests have not yet been executed; recovery, memory disposal and large-area behavior still need integration tests.
- GLB export exists, but import into a real Unreal Engine project has not been verified.
- Mobile editing drawers, transform gizmos and road spline editing are not complete.
- No backend is required yet; defer it until browser-side limits justify it.

### Development status

| Area | Status |
|---|---|
| Map selection and OSM import | Implemented; integration testing needed |
| Cell generation and IndexedDB cache | Implemented; recovery testing needed |
| Basic 3D editor and property overrides | Implemented |
| Project save/open | Implemented; compatibility testing needed |
| GLB/layer export | Implemented; Unreal validation pending |
| Distance visibility LOD | Integrated; not true multi-level LOD |
| Camera-driven cell streaming | Planned |
| Geometry clipping and robust multipolygons | Planned |
| Road spline/junction editor | Planned |
| Transform gizmos and custom asset placement | Planned |
| Responsive mobile editing drawers | Planned |
| Terrain/elevation | Planned |
| Optional cloud backend | Deferred |

### Immediate implementation order

1. Stabilize cancellation, cache behavior and import recovery.
2. Improve OSM geometry handling and cell-boundary continuity.
3. Add integration tests for generation, selection, save/open and export.
4. Improve picking and scene lifecycle/performance.
5. Add mobile panel drawers and transform tools.
6. Add road editing and custom GLB asset placement.
7. Implement real cell streaming and multi-level LOD.
8. Validate chunked exports in Unreal Engine.
9. Reassess whether a backend is needed.

Do not mark a milestone complete until its acceptance tests pass. See [the technical audit](docs/TECHNICAL_AUDIT.md) for detailed findings and acceptance criteria.

## 19. Latest stabilization update (6 November 2026)

The stabilization branch now includes additional import-cancellation safeguards:

- Tiled import checks abort state around asynchronous cache operations.
- Overpass retry delays clean up their timer and abort listener.
- Overpass requests check cancellation before each attempt and after successful response parsing.
- Invalid retry settings (zero/negative/non-integer attempts or an empty endpoint list) fail early.
- Unit tests cover tiled-cache cancellation and Overpass retry cancellation/configuration.

The tests are committed but **have not yet been run** in this environment. Build and full-suite validation remain outstanding. Continue work on `c2-stabilization`; the original `c2` branch remains the untouched baseline. See [the technical audit](docs/TECHNICAL_AUDIT.md) for the remaining acceptance tests.

## References

- OpenStreetMap: https://www.openstreetmap.org/
- OpenStreetMap Copyright and License: https://www.openstreetmap.org/copyright
- Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
- Three.js: https://threejs.org/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Vite: https://vite.dev/
- FastAPI: https://fastapi.tiangolo.com/
- PostGIS: https://postgis.net/documentation/
- Cesium (possible future terrain/geo reference): https://cesium.com/platform/cesiumjs/
- Unreal Engine: https://www.unrealengine.com/
