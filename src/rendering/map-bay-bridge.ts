// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import { mergeGeometries as mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function useMemo<T>(build: () => T, _dependencies: unknown[]): T {
  return build();
}
const STEEL = '#8e98a4';
const LIGHTS = '#dfe9ff';
type P = [number, number];
/** West span roadway: the SF approach to the Yerba Buena tunnel. */
const WEST: [P, P] = [
  [906, 902],
  [2939, -1500],
];
/** East span roadways (eastbound, westbound), Yerba Buena to the Oakland shore. */
const EAST_EB: P[] = [
  [3248, -1860],
  [3305, -1930],
  [3351, -1981],
  [3401, -2032],
  [3455, -2081],
  [3508, -2126],
  [3571, -2173],
  [4037, -2510],
  [4110, -2558],
  [4188, -2601],
  [4268, -2636],
  [4350, -2665],
  [4461, -2692],
  [5208, -2830],
  [5902, -2959],
  [6018, -2979],
  [6133, -2997],
  [6248, -3012],
  [6420, -3031],
];
const EAST_WB: P[] = [
  [3541, -2203],
  [4000, -2535],
  [4085, -2592],
  [4161, -2634],
  [4241, -2670],
  [4323, -2700],
  [4478, -2738],
  [5206, -2872],
  [5895, -3000],
  [6005, -3019],
  [6120, -3037],
  [6235, -3052],
  [6417, -3071],
];
/** The self-anchored span runs along these points of each east roadway (its straight run off the island). */
const SAS_EB: [P, P] = [
  [3571, -2173],
  [4037, -2510],
];
const SAS_WB: [P, P] = [
  [3541, -2203],
  [4000, -2535],
];
/** Its tower stands this far along the span from the island end (the real one: 385 m of 565). */
const SAS_TOWER_AT = 0.68;
const DECK_Y = 4;
const BASE_Y = -3;
function box(
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
/** A square beam from a to b (world space). */
function strut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  thick: number,
): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(thick, d.length() || 1, thick);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.clone().normalize(),
    ),
  );
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeBufferGeometries(parts, false) ?? parts[0]!;
}
/**
 * One suspension bridge in its own frame (x along the span, 0 at its middle):
 * the cable profile of the Golden Gate's (towers 22% in, parabolic main span),
 * pushed into the given part lists.
 */
function suspension(
  len: number,
  x0: number,
  towerAbove: number,
  deckW: number,
  out: {
    tower: THREE.BufferGeometry[];
    cable: THREE.BufferGeometry[];
    lights: THREE.BufferGeometry[];
  },
) {
  const half = len / 2;
  const xT = half * 0.56;
  const topY = DECK_Y + towerAbove;
  const midY = topY - 0.42 * towerAbove;
  const endY = DECK_Y + 3;
  const cableY = (x: number) => {
    if (x <= -xT) return endY + (topY - endY) * ((x + half) / (half - xT));
    if (x >= xT) return topY + (endY - topY) * ((x - xT) / (half - xT));
    const u = x / xT;
    return midY + (topY - midY) * u * u;
  };
  const cz = deckW / 2 - 1.5;
  for (const tx of [-xT, xT]) {
    for (const tz of [cz, -cz]) {
      for (let s = 0; s < 3; s++) {
        const y0 = BASE_Y + ((topY - BASE_Y) * s) / 3;
        const y1 = BASE_Y + ((topY - BASE_Y) * (s + 1)) / 3;
        const w = 7 - 1.4 * s;
        out.tower.push(box(w, y1 - y0, w - 1.2, x0 + tx, (y0 + y1) / 2, tz));
      }
    }
    // The west span's towers are X-braced steel: two crossbeams and the top.
    for (const y of [DECK_Y + 10, DECK_Y + towerAbove * 0.55, topY - 3])
      out.tower.push(box(4.5, 3, cz * 2 + 5, x0 + tx, y, 0));
  }
  const segN = 60;
  for (const z of [cz, -cz]) {
    for (let i = 0; i < segN; i++) {
      const a = -half + (len * i) / segN,
        b = -half + (len * (i + 1)) / segN;
      out.cable.push(
        strut(
          new THREE.Vector3(x0 + a, cableY(a), z),
          new THREE.Vector3(x0 + b, cableY(b), z),
          1.4,
        ),
      );
    }
    const n = Math.floor(len / 22);
    for (let i = 1; i < n; i++) {
      const x = -half + (len * i) / n;
      const top = cableY(x);
      if (top - DECK_Y < 3) continue;
      out.lights.push(
        box(0.6, top - DECK_Y - 1, 0.6, x0 + x, (top + DECK_Y + 1) / 2, z),
      );
    }
  }
}
/** Resamples a polyline to points about `step` apart, with the distance along it. */
function resample(
  line: P[],
  step: number,
): {
  p: THREE.Vector3;
  s: number;
}[] {
  const out: {
    p: THREE.Vector3;
    s: number;
  }[] = [];
  let s = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i]!,
      [bx, bz] = line[i + 1]!;
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++)
      out.push({
        p: new THREE.Vector3(
          ax + ((bx - ax) * k) / n,
          0,
          az + ((bz - az) * k) / n,
        ),
        s: s + (L * k) / n,
      });
    s += L;
  }
  const [lx, lz] = line[line.length - 1]!;
  out.push({ p: new THREE.Vector3(lx, 0, lz), s });
  return out;
}
/** A deck along a roadway (flat, at DECK_Y), and a pier every `pierEvery` units under it. */
function deckAlong(
  line: P[],
  width: number,
  pierEvery: number,
  deck: THREE.BufferGeometry[],
  piers: THREE.BufferGeometry[],
) {
  const pts = resample(line, 30);
  let nextPier = pierEvery;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!.p,
      b = pts[i + 1]!.p;
    const d = new THREE.Vector3().subVectors(b, a);
    const L = d.length();
    const g = new THREE.BoxGeometry(L + 1, 2.2, width);
    g.rotateY(-Math.atan2(d.z, d.x));
    g.translate((a.x + b.x) / 2, DECK_Y, (a.z + b.z) / 2);
    deck.push(g);
    if (pts[i]!.s >= nextPier) {
      nextPier += pierEvery;
      const p = new THREE.BoxGeometry(5, DECK_Y - BASE_Y, width * 0.7);
      p.rotateY(-Math.atan2(d.z, d.x));
      p.translate(a.x, (DECK_Y + BASE_Y) / 2 - 1, a.z);
      piers.push(p);
    }
  }
}
export function createBayBridge() {
  const geos = useMemo(() => {
    const tower: THREE.BufferGeometry[] = [];
    const cable: THREE.BufferGeometry[] = [];
    const lights: THREE.BufferGeometry[] = [];
    const deck: THREE.BufferGeometry[] = [];
    // ── west span, built along +x and turned onto its roadway ──
    const [[ax, az], [bx, bz]] = WEST;
    const len = Math.hypot(bx - ax, bz - az);
    const halfLen = len / 2;
    const anchorW = 70;
    const spanLen = halfLen - anchorW / 2;
    const deckW = 26;
    const west = {
      tower: [] as THREE.BufferGeometry[],
      cable: [] as THREE.BufferGeometry[],
      lights: [] as THREE.BufferGeometry[],
    };
    for (const x0 of [-(anchorW / 2 + spanLen / 2), anchorW / 2 + spanLen / 2])
      suspension(spanLen, x0, 115, deckW, west);
    // The concrete anchorage between the two spans, where their cables meet.
    west.tower.push(
      box(
        anchorW,
        DECK_Y + 16 - BASE_Y,
        deckW + 14,
        0,
        (DECK_Y + 16 + BASE_Y) / 2,
        0,
      ),
    );
    const westDeck = [
      box(len + 20, 2.2, deckW, 0, DECK_Y, 0),
      box(len + 20, 3, deckW - 6, 0, DECK_Y - 2.6, 0),
    ];
    const m = new THREE.Matrix4()
      .makeRotationY(-Math.atan2(bz - az, bx - ax))
      .setPosition((ax + bx) / 2, 0, (az + bz) / 2);
    for (const g of [...west.tower, ...westDeck]) tower.push(g.applyMatrix4(m));
    for (const g of west.cable) cable.push(g.applyMatrix4(m));
    for (const g of west.lights) lights.push(g.applyMatrix4(m));
    // ── east span: twin decks on piers ──
    const piers: THREE.BufferGeometry[] = [];
    deckAlong(EAST_EB, 22, 120, deck, piers);
    deckAlong(EAST_WB, 22, 120, deck, piers);
    // The self-anchored span's single tower between the decks, and its cable
    // on each deck's outer edge: from the island end up over the tower, down
    // to the far end (anchored in the deck itself).
    const at = (l: [P, P], u: number) =>
      new THREE.Vector3(
        l[0]![0]! + (l[1]![0]! - l[0]![0]!) * u,
        0,
        l[0]![1]! + (l[1]![1]! - l[0]![1]!) * u,
      );
    const tEB = at(SAS_EB, SAS_TOWER_AT),
      tWB = at(SAS_WB, SAS_TOWER_AT);
    const mid = tEB.clone().add(tWB).multiplyScalar(0.5);
    const across = tEB.clone().sub(tWB).normalize();
    const along = new THREE.Vector3(
      SAS_EB[1]![0]! - SAS_EB[0]![0]!,
      0,
      SAS_EB[1]![1]! - SAS_EB[0]![1]!,
    ).normalize();
    const sasTop = DECK_Y + 150;
    // Four tapered legs close together, the real tower's shape.
    for (const sa of [-1, 1])
      for (const sx of [-1, 1]) {
        const foot = mid
          .clone()
          .addScaledVector(across, sx * 6)
          .addScaledVector(along, sa * 4)
          .setY(BASE_Y);
        const head = mid
          .clone()
          .addScaledVector(across, sx * 3)
          .addScaledVector(along, sa * 2.5)
          .setY(sasTop);
        tower.push(strut(foot, head, 4.5));
      }
    for (const y of [DECK_Y + 40, DECK_Y + 90, sasTop - 8])
      tower.push(
        strut(
          mid.clone().addScaledVector(across, -5).setY(y),
          mid.clone().addScaledVector(across, 5).setY(y),
          3,
        ),
      );
    for (const [line, , side] of [
      [SAS_EB, tEB, 1],
      [SAS_WB, tWB, -1],
    ] as const) {
      const off = across.clone().multiplyScalar(side * 10);
      const a = new THREE.Vector3(line[0]![0]!, 0, line[0]![1]!).add(off);
      const b = new THREE.Vector3(line[1]![0]!, 0, line[1]![1]!).add(off);
      const top = mid
        .clone()
        .addScaledVector(across, side * 3)
        .setY(sasTop - 4);
      const L = a.distanceTo(b);
      const tu = SAS_TOWER_AT;
      const yAt = (u: number) => {
        // Two sagging arcs meeting at the tower top.
        const k = u < tu ? u / tu : (1 - u) / (1 - tu);
        return DECK_Y + 3 + (sasTop - 4 - DECK_Y - 3) * k * k;
      };
      const n = 40;
      let prev = a.clone().setY(yAt(0));
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const p = a.clone().lerp(b, u).setY(yAt(u));
        if (Math.abs(u - tu) < 0.5 / n) p.copy(top);
        cable.push(strut(prev, p, 1.4));
        prev = p;
      }
      const hangers = Math.floor(L / 20);
      for (let i = 1; i < hangers; i++) {
        const u = i / hangers;
        const y = yAt(u);
        if (y - DECK_Y < 4) continue;
        const p = a.clone().lerp(b, u);
        cable.push(strut(p.clone().setY(DECK_Y + 1), p.clone().setY(y), 0.5));
      }
    }
    return {
      tower: merge([...tower, ...piers]),
      cable: merge(cable),
      lights: merge(lights),
      deck: merge(deck),
    };
  }, []);
  const group = new THREE.Group();
  for (const [geometry, color, intensity, roughness] of [
    [geos.deck, STEEL, 0.18, 0.7],
    [geos.tower, STEEL, 0.22, 0.6],
    [geos.cable, STEEL, 0.3, 0.5],
    [geos.lights, LIGHTS, 1.6, 0.5],
  ] as const) {
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: intensity,
          roughness,
          toneMapped: color !== LIGHTS,
        }),
      ),
    );
  }
  return group;
}
