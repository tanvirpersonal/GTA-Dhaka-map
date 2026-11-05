/**
 * Maps vertex ranges of a merged, non-indexed mesh back to feature ids,
 * so one draw call per layer can still support per-feature picking.
 */
export interface PickMap {
  ids: string[];
  /** Start vertex of each feature; ascending. */
  starts: number[];
  /** Total vertex count. */
  total: number;
}

/** Find the feature id containing a triangle (face index of a non-indexed mesh). */
export function featureAtFace(pick: PickMap, faceIndex: number): string | null {
  const v = faceIndex * 3;
  let lo = 0;
  let hi = pick.starts.length - 1;
  if (hi < 0 || v >= pick.total) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pick.starts[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return pick.ids[lo];
}

/** Vertex range [start, end) of a feature id, or null. */
export function rangeOf(pick: PickMap, id: string): [number, number] | null {
  const i = pick.ids.indexOf(id);
  if (i < 0) return null;
  return [pick.starts[i], i + 1 < pick.starts.length ? pick.starts[i + 1] : pick.total];
}
