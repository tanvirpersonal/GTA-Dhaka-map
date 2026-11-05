# Exporting to Unreal Engine

Dhaka World Builder exports GLB (binary glTF 2.0). Units are **metres**, **Y-up**, **-Z = north**, **+X = east**.

## Two export options

| Button | Output | Use when |
| --- | --- | --- |
| Export GLB | One `.glb` containing every visible layer | Quick look, single-asset import |
| Export layers | `.zip` with one GLB per visible layer + `manifest.json` | Real projects: replace, hide or LOD layers independently |

Hidden layers (unchecked in the Layers panel) are not exported. Per-feature edits (height, width, hidden) are baked in.

## Import (Unreal Engine 5.x)

1. Enable the **Interchange** and **glTF Importer** plugins (Edit → Plugins), then restart.
2. Drag the `.glb` files into the Content Browser.
3. Unreal uses centimetres. In the import dialog set a **uniform scale of 100** (1 m → 100 uu).
4. Import every layer from one ZIP with the **same transform** (all share one origin, the centre of your selected area).
5. Axis conversion: glTF is Y-up/right-handed, Unreal is Z-up/left-handed; the importer handles this. After import, verify orientation against a known road using the manifest `origin`.

## manifest.json

- `origin`: longitude/latitude of the local (0, 0, 0). Use it to georeference the area.
- `layers`: file names and triangle counts.
- `attribution`: required credit for OpenStreetMap data (ODbL).

## Materials and collision

- Materials are simple PBR colours. Replace them in Unreal with your own material instances.
- Buildings use vertex colours for per-building tint; use a material that reads vertex colour if you want to keep it.
- Generate collision in Unreal (Static Mesh Editor → Collision) or use complex-as-simple for roads and buildings.

## Validation

Before every export the tool checks: missing vertices or materials, NaN coordinates, degenerate triangles, very high triangle counts and very large extents. Errors block export; warnings are shown in the status bar.

## Known limits

- Roads are flat ribbons without intersections, sidewalks or elevation. Overpasses and flyovers are not separated by level yet.
- Terrain is flat.
- Building heights come from OSM tags where present; otherwise they are estimated from the building type.

## Licence

Map data © OpenStreetMap contributors, ODbL 1.0. Keep the attribution when you ship anything built from this data.
