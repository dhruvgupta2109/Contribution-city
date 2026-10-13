// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import type { MapAsset } from './world-types.ts';
const sfIndexCache = new WeakMap<
  MapAsset,
  {
    F: number[];
    candidates: Int32Array;
    parkPolys: number[][];
  }
>();
export function indexMapFootprints(asset: MapAsset) {
  const hit = sfIndexCache.get(asset);
  if (hit) return hit;
  const F = asset.footprints;
  const NF = (F.length / 3) | 0;
  const [dtx, dtz] = asset.meta.downtown;
  const dd = new Float64Array(NF);
  const order = new Array<number>(NF);
  for (let i = 0; i < NF; i++) {
    const x = F[i * 3]!,
      z = F[i * 3 + 1]!;
    const ex = x - dtx,
      ez = z - dtz;
    dd[i]! = ex * ex + ez * ez;
    order[i]! = i;
  }
  order.sort((a, b) => dd[a]! - dd[b]!);
  // ---- road clearance: reject footprints that fall on a road (walkable streets) ----
  const ROAD_CLEAR = [16, 9, 5.5, 4];
  const RCELL = 64;
  type RSeg = {
    x1: number;
    z1: number;
    x2: number;
    z2: number;
    r2: number;
  };
  const roadGrid = new Map<string, RSeg[]>();
  for (const rd of asset.roads) {
    const clr = ROAD_CLEAR[rd.c]! ?? 5;
    const r2 = clr * clr;
    const p = rd.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const seg: RSeg = {
        x1: p[i]!,
        z1: p[i + 1]!,
        x2: p[i + 2]!,
        z2: p[i + 3]!,
        r2,
      };
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1) / RCELL),
      );
      for (let s = 0; s <= steps; s++) {
        const mx = seg.x1 + ((seg.x2 - seg.x1) * s) / steps,
          mz = seg.z1 + ((seg.z2 - seg.z1) * s) / steps;
        const k = `${Math.floor(mx / RCELL)},${Math.floor(mz / RCELL)}`;
        (roadGrid.get(k) ?? roadGrid.set(k, []).get(k)!).push(seg);
      }
    }
  }
  const onRoad = (x: number, z: number): boolean => {
    const gx = Math.floor(x / RCELL),
      gz = Math.floor(z / RCELL);
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++) {
        const arr = roadGrid.get(`${gx + ax},${gz + az}`);
        if (!arr) continue;
        for (const s of arr) {
          const dx = s.x2 - s.x1,
            dz = s.z2 - s.z1,
            l2 = dx * dx + dz * dz;
          let t = l2 ? ((x - s.x1) * dx + (z - s.z1) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ddx = x - (s.x1 + t * dx),
            ddz = z - (s.z1 + t * dz);
          if (ddx * ddx + ddz * ddz < s.r2) return true;
        }
      }
    return false;
  };
  // ---- park index: reject footprints inside parks (parks stay open green) ----
  const PKCELL = 200;
  const parkGrid = new Map<string, number[]>();
  const parkPolys = asset.parks.map((p) => p.p);
  for (let pi = 0; pi < parkPolys.length; pi++) {
    const p = parkPolys[pi]!;
    if (p.length < 6) continue;
    let mnx = Infinity,
      mnz = Infinity,
      mxx = -Infinity,
      mxz = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i]!,
        z = p[i + 1]!;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (z < mnz) mnz = z;
      if (z > mxz) mxz = z;
    }
    for (
      let cx = Math.floor(mnx / PKCELL);
      cx <= Math.floor(mxx / PKCELL);
      cx++
    )
      for (
        let cz = Math.floor(mnz / PKCELL);
        cz <= Math.floor(mxz / PKCELL);
        cz++
      ) {
        const k = `${cx},${cz}`;
        (parkGrid.get(k) ?? parkGrid.set(k, []).get(k)!).push(pi);
      }
  }
  const pointInPoly = (x: number, z: number, p: number[]): boolean => {
    let inside = false;
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[i * 2]!,
        zi = p[i * 2 + 1]!,
        xj = p[j * 2]!,
        zj = p[j * 2 + 1]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
        inside = !inside;
    }
    return inside;
  };
  const inPark = (x: number, z: number): boolean => {
    const arr = parkGrid.get(
      `${Math.floor(x / PKCELL)},${Math.floor(z / PKCELL)}`,
    );
    if (!arr) return false;
    for (const pi of arr) if (pointInPoly(x, z, parkPolys[pi]!)) return true;
    return false;
  };
  // Cleared civic plaza at downtown for the landmarks (spire, bank, sponsors).
  const PLAZA_R2 = 340 * 340;
  const cand: number[] = [];
  for (let oi = 0; oi < NF; oi++) {
    const fi = order[oi]!;
    const x = F[fi * 3]!,
      z = F[fi * 3 + 1]!;
    if (onRoad(x, z)) continue;
    if (inPark(x, z)) continue;
    if ((x - dtx) * (x - dtx) + (z - dtz) * (z - dtz) < PLAZA_R2) continue;
    cand.push(fi);
  }
  const index = { F, candidates: Int32Array.from(cand), parkPolys };
  sfIndexCache.set(asset, index);
  return index;
}
