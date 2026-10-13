// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import { mergeGeometries as mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function useMemo<T>(build: () => T, _dependencies: unknown[]): T {
  return build();
}
const GG_ORANGE = '#c0392b'; // International Orange, slightly muted for night
// Axis-aligned box translated into place.
function ggBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
// Thin strut between two points in the X/Y plane at a fixed Z (for cable spans).
function ggStrut(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  thick: number,
): THREE.BufferGeometry {
  const dx = x1 - x0,
    dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const m = new THREE.Matrix4().makeRotationZ(Math.atan2(dy, dx));
  m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, z);
  const g = new THREE.BoxGeometry(L, thick, thick);
  g.applyMatrix4(m);
  return g;
}
function ggMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeBufferGeometries(parts, false) ?? parts[0]!;
}
// Suspension bridge built from the real roadway span: the deck sits low (on the
// street), twin tapered towers rise from the water, and parabolic main cables
// drape between them with vertical suspenders down to the deck.
export function createGoldenGateBridge({
  a,
  b,
}: {
  a: [number, number];
  b: [number, number];
}) {
  const { deckGeo, towerGeo, cableGeo, mid, rotY } = useMemo(() => {
    const dx = b[0]! - a[0]!,
      dz = b[1]! - a[1]!;
    const len = Math.hypot(dx, dz) || 1;
    const mid: [number, number] = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2];
    const rotY = -Math.atan2(dz, dx);
    const half = len / 2;
    // wide enough to fully cover the class-0 roadway (half-width 10 + sidewalk)
    const deckW = 26,
      deckThick = 2.2,
      deckY = 4;
    const deckTopY = deckY + deckThick / 2;
    const railH = 1.8;
    const baseY = -3; // tower feet, just under the water
    const cableZ = deckW / 2 - 1.5; // cable plane just inside deck edge
    // Real Golden Gate proportions: towers sit ~22% in from each end (so there's
    // a deep central main span + two side spans), and rise high above the deck.
    const xT = half * 0.56; // tower x (±) → towers at 22%/78%
    const towerAbove = 0.12 * (2 * xT); // tall: ~12% of the main span
    const towerTopY = deckY + towerAbove;
    const sag = 0.42 * towerAbove; // main-span cable dip below towers
    const mainCenterY = towerTopY - sag;
    const yAnchor = deckY + 3; // cable touches deck at the ends
    // Suspension-cable height profile: rises on the side spans, parabolic dip in
    // the main span between the two towers.
    const cableY = (x: number): number => {
      if (x <= -xT)
        return yAnchor + (towerTopY - yAnchor) * ((x + half) / (half - xT));
      if (x >= xT)
        return towerTopY + (yAnchor - towerTopY) * ((x - xT) / (half - xT));
      const u = x / xT; // -1..1 across the main span
      return mainCenterY + (towerTopY - mainCenterY) * u * u;
    };
    // ── deck: roadway + deep under-truss + edge railings ──
    const deckParts = [
      ggBox(len + 30, deckThick, deckW, 0, deckY, 0),
      ggBox(len + 30, 2.6, deckW - 6, 0, deckY - deckThick / 2 - 1.3, 0), // truss below
    ];
    for (const s of [1, -1]) {
      deckParts.push(
        ggBox(
          len + 30,
          railH,
          1.1,
          0,
          deckTopY + railH / 2,
          s * (deckW / 2 - 0.6),
        ),
      );
    }
    const deckGeo = ggMerge(deckParts);
    // ── twin towers: tapered legs + stacked portal crossbeams ──
    const towerParts: THREE.BufferGeometry[] = [];
    const beamD = cableZ * 2 + 6;
    const legSegs = 3;
    for (const tx of [-xT, xT]) {
      for (const tz of [cableZ, -cableZ]) {
        for (let s = 0; s < legSegs; s++) {
          const y0 = baseY + ((towerTopY - baseY) * s) / legSegs;
          const y1 = baseY + ((towerTopY - baseY) * (s + 1)) / legSegs;
          const w = 9 - 1.8 * s; // taper 9 → 7.2 → 5.4
          towerParts.push(ggBox(w, y1 - y0, w - 1.5, tx, (y0 + y1) / 2, tz));
        }
      }
      // portal crossbeams between the two legs, from just above deck to the top
      const nBeams = 4;
      for (let i = 0; i < nBeams; i++) {
        const y =
          deckY + 8 + (towerTopY - 5 - (deckY + 8)) * (i / (nBeams - 1));
        towerParts.push(ggBox(5.5, 3.2, beamD, tx, y, 0));
      }
    }
    const towerGeo = ggMerge(towerParts);
    // ── main cables (sampled profile) + vertical suspenders ──
    const cableParts: THREE.BufferGeometry[] = [];
    const cableThick = Math.max(1.6, len * 0.001);
    const segN = 96;
    for (const cz of [cableZ, -cableZ]) {
      for (let i = 0; i < segN; i++) {
        const x0 = -half + (len * i) / segN,
          x1 = -half + (len * (i + 1)) / segN;
        cableParts.push(
          ggStrut(x0, cableY(x0), x1, cableY(x1), cz, cableThick),
        );
      }
    }
    const susThick = 0.55,
      susSpacing = 26;
    const nSus = Math.floor(len / susSpacing);
    for (const cz of [cableZ, -cableZ]) {
      for (let i = 1; i < nSus; i++) {
        const x = -half + (len * i) / nSus;
        const cy = cableY(x);
        if (cy - deckTopY < 1.5) continue;
        cableParts.push(
          ggBox(susThick, cy - deckTopY, susThick, x, (cy + deckTopY) / 2, cz),
        );
      }
    }
    const cableGeo = ggMerge(cableParts);
    return { deckGeo, towerGeo, cableGeo, mid, rotY };
  }, [a, b]);
  const group = new THREE.Group();
  group.position.set(mid[0]!, 0, mid[1]!);
  group.rotation.y = rotY;
  for (const [geometry, intensity, roughness] of [
    [deckGeo, 0.28, 0.6],
    [towerGeo, 0.34, 0.55],
    [cableGeo, 0.3, 0.5],
  ] as const) {
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: GG_ORANGE,
          emissive: GG_ORANGE,
          emissiveIntensity: intensity,
          roughness,
        }),
      ),
    );
  }
  return group;
}
