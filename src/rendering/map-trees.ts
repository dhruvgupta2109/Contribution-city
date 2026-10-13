// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import type { MapAsset } from './world-types.ts';
function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function sampleTrees(sfMap: MapAsset): Float32Array {
  const rng = rngFrom(917283);
  const out: number[] = [];
  // park trees: area-weighted sampling over triangulated parks
  const tris: number[] = [];
  const cum: number[] = [];
  let area = 0;
  for (const pk of sfMap.parks) {
    const p = pk.p;
    if (p.length < 8) continue;
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i + 1 < p.length; i += 2)
      contour.push(new THREE.Vector2(p[i]!, p[i + 1]!));
    let t: number[][];
    try {
      t = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      continue;
    }
    for (const tr of t) {
      const a = contour[tr[0]!]!,
        b = contour[tr[1]!]!,
        c = contour[tr[2]!]!;
      const ar =
        Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      if (ar < 1) continue;
      tris.push(a.x, a.y, b.x, b.y, c.x, c.y);
      area += ar;
      cum.push(area);
    }
  }
  const PARK_TREES = Math.min(5000, Math.round(area / 520)); // ~1 tree / 520 m²
  for (let i = 0; i < PARK_TREES && cum.length; i++) {
    const r = rng() * area;
    let lo = 0,
      hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < r) lo = mid + 1;
      else hi = mid;
    }
    const o = lo * 6;
    let u = rng(),
      v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const x =
      tris[o]! + u * (tris[o + 2]! - tris[o]!) + v * (tris[o + 4]! - tris[o]!);
    const z =
      tris[o + 1]! +
      u * (tris[o + 3]! - tris[o + 1]!) +
      v * (tris[o + 5]! - tris[o + 1]!);
    out.push(x, z, 0.8 + rng() * 0.8);
  }
  // street trees along primary/secondary roads
  let street = 0;
  for (const rd of sfMap.roads) {
    if (rd.c !== 1 && rd.c !== 2) continue;
    const p = rd.p,
      off = (rd.c === 1 ? 9 : 6) + 4;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const x1 = p[i]!,
        z1 = p[i + 1]!,
        x2 = p[i + 2]!,
        z2 = p[i + 3]!;
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.hypot(dx, dz);
      const steps = Math.floor(len / 38);
      const nx = -dz / (len || 1),
        nz = dx / (len || 1);
      for (let s = 1; s <= steps; s++) {
        if (rng() > 0.5) continue;
        const tt = s / (steps + 1);
        const bx = x1 + dx * tt,
          bz = z1 + dz * tt;
        const side = rng() > 0.5 ? 1 : -1;
        out.push(bx + nx * off * side, bz + nz * off * side, 0.7 + rng() * 0.6);
        if (++street > 6000) break;
      }
      if (street > 6000) break;
    }
    if (street > 6000) break;
  }
  return new Float32Array(out);
}
