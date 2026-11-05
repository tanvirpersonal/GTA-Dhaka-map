import * as THREE from 'three';
import type { Bounds } from '../types/editor';
import type { OSMFeature, OSMNode } from '../data/OSMClient';
import { boundsSizeMeters } from '../map/DhakaBounds';

export interface GenerationStats {
  buildings: number;
  roads: number;
  sidewalks: number;
  intersections: number;
  greenAreas: number;
  waterAreas: number;
  skipped: number;
}
export interface GeneratedCity {
  group: THREE.Group;
  stats: GenerationStats;
}

function localPoint(node: OSMNode, bounds: Bounds): THREE.Vector2 {
  const size = boundsSizeMeters(bounds);
  const midLat = (bounds.north + bounds.south) / 2;
  const x = ((node.lon - bounds.west) / (bounds.east - bounds.west)) * size.width - size.width / 2;
  const z = -(((node.lat - bounds.south) / (bounds.north - bounds.south)) * size.height - size.height / 2);
  // Keep the scene in local metric coordinates. Latitude/longitude are retained in source data.
  return new THREE.Vector2(x, z * Math.cos((midLat * Math.PI) / 180) / Math.cos((midLat * Math.PI) / 180));
}

function polygonShape(points: THREE.Vector2[]): THREE.Shape | null {
  if (points.length < 4) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.closePath();
  return shape;
}

function material(color: number, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function wayNodes(feature: OSMFeature): OSMNode[] {
  return 'geometry' in feature && feature.geometry ? feature.geometry : [];
}

function isClosed(nodes: OSMNode[]): boolean {
  return nodes.length >= 4 && nodes[0].lat === nodes[nodes.length - 1].lat && nodes[0].lon === nodes[nodes.length - 1].lon;
}

function buildingHeight(tags: Record<string, string> = {}): number {
  const explicit = Number.parseFloat((tags.height ?? '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(explicit) && explicit > 2 && explicit < 300) return explicit;
  const levels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0 && levels < 80) return Math.max(3, levels * 3.1);
  const kind = tags.building ?? '';
  if (['industrial', 'warehouse', 'garages'].includes(kind)) return 7;
  if (['house', 'detached', 'semidetached_house', 'residential'].includes(kind)) return 9;
  if (['commercial', 'office', 'retail'].includes(kind)) return 15;
  return 10; // estimate; source height was not provided
}

function roadWidth(tags: Record<string, string> = {}): number {
  const explicit = Number.parseFloat((tags.width ?? '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(explicit) && explicit > 1 && explicit < 100) return explicit;
  const widths: Record<string, number> = {
    motorway: 18, trunk: 16, primary: 14, secondary: 11, tertiary: 9,
    residential: 7, unclassified: 6, service: 4, living_street: 5, footway: 2,
    path: 1.8, track: 3,
  };
  return widths[tags.highway ?? ''] ?? 6;
}

function roadRibbon(points: THREE.Vector2[], width: number, lateralOffset = 0): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const direction = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x);
    const center = points[i].clone().addScaledVector(normal, lateralOffset);
    const half = normal.clone().multiplyScalar(width / 2);
    vertices.push(center.x + half.x, 0.075, center.y + half.y);
    vertices.push(center.x - half.x, 0.075, center.y - half.y);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function generateCity(features: OSMFeature[], bounds: Bounds): GeneratedCity {
  const group = new THREE.Group();
  group.name = 'Dhaka Generated City';
  const buildingMat = material(0x777f8b);
  const roadMats = new Map<string, THREE.MeshStandardMaterial>();
  const greenMat = material(0x315c43);
  const roadEndpoints = new Map<string, { point: THREE.Vector2; count: number; maxRadius: number }>();
  const sidewalkMat = material(0x77736a);
  const junctionMat = material(0x343a43);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x245b79, roughness: 0.28, metalness: 0.08 });
  const stats: GenerationStats = { buildings: 0, roads: 0, sidewalks: 0, intersections: 0, greenAreas: 0, waterAreas: 0, skipped: 0 };
  for (const feature of features) {
    if (feature.type !== 'way') continue;
    const nodes = wayNodes(feature);
    if (nodes.length < 2) { stats.skipped++; continue; }
    const tags = feature.tags ?? {};
    const points = nodes.map((n) => localPoint(n, bounds));
    const closed = isClosed(nodes);

    if (tags.building && closed) {
      const shape = polygonShape(points);
      if (!shape) { stats.skipped++; continue; }
      const height = buildingHeight(tags);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, 0);
      // ExtrudeGeometry's depth becomes vertical after rotation; shape Y maps to world Z.
      const mesh = new THREE.Mesh(geometry, buildingMat);
      mesh.position.y = 0;
      mesh.userData = { osmId: feature.id, kind: 'building', name: tags.name ?? '', height, heightEstimated: !tags.height && !tags['building:levels'], tags };
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      stats.buildings++;
      continue;
    }

    if (tags.highway) {
      const key = tags.highway;
      if (!roadMats.has(key)) roadMats.set(key, material(['motorway', 'trunk', 'primary'].includes(key) ? 0x4b5059 : 0x343a43));
      const geometry = roadRibbon(points, roadWidth(tags));
      if (!geometry) { stats.skipped++; continue; }
      const mesh = new THREE.Mesh(geometry, roadMats.get(key)!);
      mesh.name = `Road ${tags.name ?? key}`;
      mesh.userData = { osmId: feature.id, kind: 'road', name: tags.name ?? '', roadClass: key, width: roadWidth(tags), tags };
      group.add(mesh);
      stats.roads++;
      const pedestrianRoad = ['footway', 'path', 'cycleway', 'steps', 'bridleway'].includes(key);
      if (!pedestrianRoad && roadWidth(tags) >= 5) {
        for (const side of [-1, 1]) {
          const sidewalkGeometry = roadRibbon(points, 1.6, side * (roadWidth(tags) / 2 + 0.8));
          if (!sidewalkGeometry) continue;
          const sidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMat);
          sidewalk.name = 'Sidewalk';
          sidewalk.userData = { kind: 'sidewalk', osmId: feature.id, side, width: 1.6 };
          group.add(sidewalk);
          stats.sidewalks++;
        }
      }
      for (const endpoint of [points[0], points[points.length - 1]]) {
        const endpointKey = endpoint.x.toFixed(1) + ':' + endpoint.y.toFixed(1);
        const entry = roadEndpoints.get(endpointKey);
        if (entry) { entry.count++; entry.maxRadius = Math.max(entry.maxRadius, roadWidth(tags) / 2); }
        else roadEndpoints.set(endpointKey, { point: endpoint.clone(), count: 1, maxRadius: roadWidth(tags) / 2 });
      }
      continue;
    }

    if (closed && (tags.leisure === 'park' || ['grass', 'forest', 'recreation_ground'].includes(tags.landuse ?? ''))) {
      const shape = polygonShape(points);
      if (!shape) { stats.skipped++; continue; }
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, greenMat);
      mesh.position.y = 0.04;
      mesh.userData = { osmId: feature.id, kind: 'green', name: tags.name ?? '', tags };
      group.add(mesh);
      stats.greenAreas++;
      continue;
    }

    if (closed && (tags.natural === 'water' || tags.waterway || tags.water)) {
      const shape = polygonShape(points);
      if (!shape) { stats.skipped++; continue; }
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, waterMat);
      mesh.position.y = 0.03;
      mesh.userData = { osmId: feature.id, kind: 'water', name: tags.name ?? '', tags };
      group.add(mesh);
      stats.waterAreas++;
    }
  }
  for (const junction of roadEndpoints.values()) {
    if (junction.count < 3) continue;
    const radius = Math.max(3, junction.maxRadius * 1.12);
    const geometry = new THREE.CircleGeometry(radius, 16);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, junctionMat);
    mesh.position.set(junction.point.x, 0.09, junction.point.y);
    mesh.name = 'Road junction';
    mesh.userData = { kind: 'junction', connectedRoads: junction.count, radius };
    group.add(mesh); stats.intersections++;
  }
  for (const junction of roadEndpoints.values()) {
    if (junction.count < 3) continue;
    const radius = Math.max(3, junction.maxRadius * 1.12);
    const geometry = new THREE.CircleGeometry(radius, 16);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, junctionMat);
    mesh.position.set(junction.point.x, 0.09, junction.point.y);
    mesh.name = 'Road junction';
    mesh.userData = { kind: 'junction', connectedRoads: junction.count, radius };
    group.add(mesh);
    stats.intersections++;
  }
  return { group, stats };
}
