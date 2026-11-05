import * as THREE from 'three';
import { createBlockManifest, type CityBlock } from '../data/CityBlockGrid';
import type { Bounds } from '../types/editor';
import type { FeatureCounts, ImportResult, MapFeature } from '../types/features';
import type { Layers, Overrides } from '../types/project';
import { defaultLayers } from '../types/project';
import { generateCity, type CityStats } from './CityGenerator';

export interface BlockModelBuild {
  group: THREE.Group;
  stats: CityStats;
  blocks: CityBlock[];
  manifest: ReturnType<typeof createBlockManifest> & {
    modelVersion: 1;
    coordinateSystem: 'shared-selection-origin';
    assignment: 'feature-geometry-centre';
  };
}

function countsFor(features: MapFeature[]): FeatureCounts {
  const counts: FeatureCounts = {
    building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0,
  };
  for (const feature of features) counts[feature.kind]++;
  return counts;
}

/**
 * Build one independent Three.js group per 250 m city block.
 *
 * Every block is generated with the SAME selection-wide projection. This is
 * intentional: neighbouring models therefore share one coordinate frame and
 * line up without being re-centred independently.
 *
 * OSM features are assigned to one block by their geometry centre. Long
 * features are not clipped at block borders yet; they remain continuous while
 * all blocks are loaded, but need clipping/segment ownership before streaming.
 */
export function generateBlockCity(
  result: ImportResult,
  bounds: Bounds,
  blocks: CityBlock[],
  overrides: Overrides = {},
  layers: Layers = defaultLayers(),
): BlockModelBuild {
  const root = new THREE.Group();
  root.name = 'dhaka-city';
  const featureById = new Map(result.features.map((feature) => [feature.id, feature]));
  const builtBlocks: CityBlock[] = [];
  let triangles = 0;
  let meshes = 0;

  for (const block of blocks) {
    const features = block.featureIds
      .map((id) => featureById.get(id))
      .filter((feature): feature is MapFeature => feature !== undefined);
    const blockResult: ImportResult = {
      features,
      counts: countsFor(features),
      warnings: [],
    };

    const generated = generateCity(blockResult, bounds, overrides, layers);
    const blockGroup = new THREE.Group();
    blockGroup.name = `city-block-${block.id}`;
    blockGroup.userData.blockId = block.id;
    blockGroup.userData.bounds = { ...block.bounds };
    blockGroup.userData.modelVersion = 1;
    blockGroup.userData.featureCount = features.length;
    blockGroup.userData.featureIds = features.map((feature) => feature.id);

    // Move the generated layer meshes into this block's persistent scene unit.
    while (generated.group.children.length) {
      blockGroup.add(generated.group.children[0]);
    }
    root.add(blockGroup);

    triangles += generated.stats.triangles;
    meshes += generated.stats.meshes;
    builtBlocks.push({
      ...block,
      status: 'validated',
      featureIds: features.map((feature) => feature.id),
      counts: { ...block.counts },
    });
  }

  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const baseManifest = createBlockManifest(builtBlocks);
  const manifest = {
    ...baseManifest,
    modelVersion: 1 as const,
    coordinateSystem: 'shared-selection-origin' as const,
    assignment: 'feature-geometry-centre' as const,
  };

  root.userData.modelVersion = 1;
  root.userData.blockManifest = manifest;
  root.userData.coordinateSystem = 'shared-selection-origin';

  return {
    group: root,
    stats: {
      triangles,
      meshes,
      widthM: size.x,
      heightM: size.y,
    },
    blocks: builtBlocks,
    manifest,
  };
}
