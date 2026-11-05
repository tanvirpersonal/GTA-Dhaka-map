# Block-based Dhaka world pipeline

The city is built in small geographic work units rather than as one enormous scene.

## First milestone: geographic block blueprint

- Default block size: 250 metres (metric approximation at each block's latitude).
- Each block receives a stable row/column ID such as `B-003-012`.
- Edge blocks are clipped to the selected geographic bounds.
- Imported OSM features are assigned to the block containing their geometry centre.
- A block manifest records geographic bounds, feature IDs, feature counts and lifecycle status.

## Block lifecycle

`pending → generating → generated → validated`

A failed job uses `failed` and can be retried independently. Do not mark a block generated merely because its OSM data was downloaded: generation and validation are separate future pipeline stages.

## Planned next stages

1. Add block selection and manifest export to the editor.
2. Generate an independent 3D scene per block while preserving shared world coordinates.
3. Add cross-block seam checks for roads, paths, water and building footprints.
4. Add block-level collision, LOD and streaming.
5. Add AI-assisted asset/model generation as an optional worker. Keep deterministic procedural fallback so the pipeline does not depend on a paid AI API.

## Geographic accuracy

OpenStreetMap data is the geographic source of truth where mapped. Missing building heights or details must be marked as estimated rather than presented as verified facts. Feature assignment currently uses each feature's geometry centre; later clipping must handle long roads and polygons that cross block boundaries so adjacent blocks remain continuous.
