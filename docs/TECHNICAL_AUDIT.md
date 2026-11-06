# GTA Dhaka Map — Technical Audit

**Baseline:** `c2`, 6 November 2026  
**Working branch:** `c2-stabilization`

## Executive assessment

The project is an implemented browser prototype, not merely a blueprint. It has MapLibre area selection, OSM import/parsing, tiled imports, IndexedDB caching, a centre-out cell generation pipeline, a Three.js editor, basic feature overrides, undo/redo, project JSON save/open and GLB/layer export.

The next phase should prioritize correctness and repeatable tests over adding more visible features. Source-code presence is not proof of end-to-end behavior.

## Verified architecture

- Frontend: Vite + TypeScript.
- 2D map: MapLibre GL JS with OSM raster tiles and attribution.
- Data: Overpass client with endpoint fallback and retry/backoff.
- Import: bounded tile requests, one-second pause between uncached tiles, feature-ID de-duplication.
- Cache: IndexedDB with a seven-day TTL and best-effort writes.
- Generation: centre-out grid, import/generation overlap, shared local projection.
- Rendering: Three.js scene grouped by generated cell.
- Editing: click picking, highlight overlay, building-height and road-width overrides, undo/redo.
- Export: GLB and layer ZIP paths.
- LOD: distance-based visibility hiding for building/path layers; not low-poly substitution or cell streaming.

## Findings and fixes

### P0 — Import cancellation and recovery

**Observed:** `importTiled` awaits cache lookup at the start of each tile iteration but does not check `signal.aborted` before processing a cached tile. A fully cached import can continue through tiles after cancellation is requested. Network fetch and pause paths are abort-aware, but cache-hit behavior needs explicit coverage.

**Action:** Check abort state before and after asynchronous cache reads and before cache writes. Ensure aborted imports do not report successful completion or cache incomplete results.

**Acceptance tests:** Abort before the first tile; abort between uncached tiles; abort after a cache hit; abort during fetch; confirm no later tiles are processed.

### P0 — OSM polygon correctness

**Observed:** The parser previously accepted only relation member ways that were individually closed.

**Change now committed:** Relation member geometries are joined by matching endpoint coordinates, in either direction and in arbitrary member order. Closed rings are emitted independently, inner rings are assigned to containing outers, and incomplete chains produce an `open-ring` warning instead of invalid polygon output.

**Remaining risks:** Endpoint matching currently relies on exact Overpass coordinate equality. Ambiguous branching member graphs, ring self-intersections, winding normalization and robust geometric validity checks are not yet handled.

**Acceptance tests added:** Existing closed-way and closed-hole cases; fragmented outer ring in mixed order/direction; fragmented inner courtyard; multiple outer rings with a contained hole; incomplete fragmented ring.

**Validation status:** Tests are committed but not executed in this environment.

### P0 — Cell boundary continuity

**Observed:** `GridPipeline` de-duplicates features by ID using a first-cell-wins set. It does not clip geometry at cell boundaries. A road crossing cells may be assigned to only one cell.

**Action:** Separate source feature identity from render fragments. Clip lines/polygons to each cell while retaining stable edit identity. Define deterministic ownership for buildings.

**Acceptance tests:** Straight/curved roads crossing cell edges; boundary-touching buildings; no gaps/duplicates/z-fighting; editing a source feature updates all fragments.

### P1 — Selection performance

**Observed:** `SelectionManager.pickAt` traverses visible world objects to rebuild the raycast candidate list for every click.

**Action:** Maintain candidates per cell and investigate spatial indexing or simplified pick proxies. Benchmark before and after.

### P1 — Scene lifecycle

**Observed:** `SceneManager.dispose` releases renderer, controls and resize observer, but app-level listeners and the LOD timer need coordinated teardown. `SelectionManager` uses anonymous pointer listeners and has no dispose method.

**Action:** Add explicit dispose methods, retain listener references, stop LOD during teardown, and dispose overlays/subscriptions.

**Acceptance tests:** Repeated app create/dispose cycles without duplicate listeners, orphaned timers or rising GPU resource counts.

### P1 — LOD semantics

**Observed:** `CellLod` hides building/path meshes beyond a fixed radius. It does not replace them with simplified geometry.

**Action:** Make LOD deterministic/configurable, then add per-cell simplified representations and hysteresis. Keep export independent of runtime visibility.

### P1 — Project and export validation

**Observed:** Save/open and export code exists. Actual Unreal Engine import has not been verified in this audit.

**Action:** Add project schema/version validation, export manifests with bounds/origin/units/axis/attribution, and a small Unreal fixture project.

**Acceptance tests:** Save-reload-edit-save; export a known small area; import into Unreal and verify scale, orientation, materials and chunk placement.

### P2 — Editor workflow

Add responsive collapsible drawers for map/tools and properties, then transform gizmos and a road spline editor. Keep one shared editor state across desktop and mobile.

### P2 — Custom assets and terrain

Add GLB placement with transform, duplicate, delete and project persistence. Add terrain only after data resolution, licensing and coordinate alignment are defined.

### P3 — Backend

Defer FastAPI/PostGIS/cloud storage until measured import size, persistence or collaboration requirements justify it.

## Ordered implementation phases

| Phase | Scope | Exit condition |
|---|---|---|
| 1 | Import cancellation/cache recovery | Abort tests pass for cache and network paths |
| 2 | OSM ring and polygon correctness | Multipolygon fixtures pass |
| 3 | Cell boundary continuity | Road/building seam tests pass |
| 4 | Selection and scene lifecycle | No stale listeners/resources; picking benchmark recorded |
| 5 | Project and export verification | Round-trip tests and Unreal fixture pass |
| 6 | Mobile drawers and transform gizmos | Core editing usable on desktop and mobile |
| 7 | Road editor and custom assets | Edits persist and export correctly |
| 8 | Real streaming and multi-level LOD | Camera-driven load/unload and LOD benchmark pass |
| 9 | Terrain and optional backend | Added only with validated requirements |

## Progress update — 6 November 2026

The import-cancellation patch and the first multipolygon-stitching pass are now in the working branch:

- `TiledImport` checks cancellation before tile work and after asynchronous cache reads/writes.
- The retry-delay helper in `OSMClient` now handles an already-aborted signal, clears its timer and removes its abort listener when the delay completes or is cancelled.
- `fetchOSM` checks cancellation before starting each request and after parsing a successful response.
- Retry configuration now rejects a non-positive/non-integer attempt count and an empty endpoint list.
- Unit tests cover pre-aborted requests, retry-listener cleanup, invalid retry configuration, tiled-cache cancellation and fragmented multipolygon rings.

**Validation status:** Tests have been added to the repository but have not been executed in this environment. Network-fetch abort behavior, mid-response cancellation, ambiguous multipolygon junctions, self-intersections and full import integration still need runtime verification. Do not close these phases until the complete test suite and build pass.

## Guardrails

- Keep `c2` unchanged as the audit baseline; work on `c2-stabilization`.
- Make one focused change per phase.
- Do not claim runtime validation unless build/tests were actually run.
- Preserve OSM attribution and respect the selected data service policy.
- Keep original geographic feature identity separate from generated mesh fragments.
- Avoid a backend until a measured need exists.