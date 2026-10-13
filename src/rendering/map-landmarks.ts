// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import { mergeGeometries as mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function useMemo<T>(build: () => T, _dependencies: unknown[]): T {
  return build();
}
const K_PLAIN = 0,
  K_FLOORS = 1,
  K_LIGHT = 2;
// ─── Geometry helpers ───────────────────────────────────────
/** Non-indexed with flat normals, one color and one kind for all its vertices. */
function paint(
  g: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  kind = K_PLAIN,
  sideColor?: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const name of Object.keys(geo.attributes))
    if (name !== 'position') geo.deleteAttribute(name);
  geo.computeVertexNormals();
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3),
    kinds = new Float32Array(n).fill(kind);
  const top = new THREE.Color(color),
    side = new THREE.Color(sideColor ?? color);
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i++) {
    const c = sideColor && nrm.getY(i) < 0.6 ? side : top;
    col[i * 3]! = c.r;
    col[i * 3 + 1]! = c.g;
    col[i * 3 + 2]! = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  return geo;
}
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
/** A square beam from a to b. */
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
      d.normalize(),
    ),
  );
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/** A flat [x, z, x, z…] footprint extruded from y0 up to y1. */
function prism(
  flat: readonly number[],
  y0: number,
  y1: number,
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2)
    pts.push(new THREE.Vector2(flat[i]!, -flat[i + 1]!));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: y1 - y0,
    bevelEnabled: false,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}
function place(
  g: THREE.BufferGeometry,
  x: number,
  z: number,
  rotY: number,
): THREE.BufferGeometry {
  g.rotateY(rotY);
  g.translate(x, 0, z);
  return g;
}
// ─── Alcatraz ───────────────────────────────────────────────
// The Rock from its OSM coastline: cliffs to a first terrace, the island's
// crown above it, and on it the cellhouse, the lighthouse and the water tower.
// Terrace heights are stylized (the real top is 41 m).
const ALCATRAZ = {
  coast: [
    -1871, -3629, -1881, -3634, -1893, -3639, -1897, -3640, -1916, -3652, -1933,
    -3660, -1961, -3692, -1972, -3701, -1984, -3717, -2003, -3726, -2007, -3728,
    -2011, -3729, -2016, -3730, -2023, -3730, -2033, -3730, -2041, -3739, -2050,
    -3744, -2058, -3753, -2065, -3758, -2075, -3758, -2087, -3753, -2105, -3758,
    -2115, -3757, -2121, -3754, -2128, -3760, -2136, -3758, -2141, -3759, -2146,
    -3761, -2156, -3754, -2162, -3759, -2177, -3754, -2188, -3746, -2192, -3737,
    -2193, -3731, -2191, -3727, -2192, -3723, -2186, -3713, -2187, -3705, -2166,
    -3693, -2161, -3697, -2155, -3692, -2150, -3686, -2149, -3682, -2141, -3671,
    -2140, -3667, -2141, -3664, -2134, -3645, -2131, -3635, -2127, -3626, -2124,
    -3620, -2122, -3617, -2109, -3601, -2091, -3593, -2093, -3584, -2096, -3577,
    -2099, -3575, -2099, -3573, -2100, -3572, -2100, -3571, -2100, -3569, -2097,
    -3566, -2094, -3566, -2093, -3563, -2085, -3557, -2078, -3559, -2076, -3558,
    -2075, -3559, -2072, -3561, -2068, -3559, -2067, -3557, -2052, -3550, -2046,
    -3553, -2041, -3554, -2036, -3554, -2032, -3550, -2028, -3545, -2026, -3541,
    -2027, -3523, -2029, -3513, -2024, -3505, -2009, -3498, -1993, -3490, -1986,
    -3483, -1979, -3481, -1970, -3478, -1961, -3476, -1956, -3470, -1943, -3464,
    -1940, -3454, -1936, -3441, -1934, -3439, -1931, -3438, -1926, -3439, -1920,
    -3436, -1919, -3436, -1914, -3434, -1887, -3418, -1863, -3400, -1857, -3396,
    -1850, -3394, -1840, -3392, -1829, -3393, -1803, -3396, -1801, -3394, -1775,
    -3403, -1772, -3405, -1762, -3410, -1759, -3415, -1748, -3428, -1746, -3432,
    -1744, -3436, -1736, -3457, -1732, -3466, -1734, -3476, -1736, -3483, -1740,
    -3509, -1747, -3517, -1750, -3522, -1754, -3526, -1775, -3547, -1773, -3550,
    -1775, -3551, -1792, -3569, -1787, -3573, -1786, -3574, -1783, -3577, -1783,
    -3580, -1821, -3612, -1822, -3610, -1828, -3602, -1856, -3621, -1861, -3614,
    -1866, -3618,
  ],
  cellhouse: [
    -1986, -3581, -1990, -3577, -1996, -3572, -1963, -3537, -1955, -3545, -1943,
    -3533, -1941, -3535, -1916, -3559, -1949, -3594, -1956, -3587, -1968, -3599,
    -1972, -3595,
  ],
  admin: [-1941, -3535, -1930, -3524, -1918, -3537, -1905, -3549, -1916, -3559],
  dining: [
    -1986, -3581, -1972, -3595, -2003, -3627, -2006, -3625, -2011, -3630, -2020,
    -3621, -2015, -3616, -2018, -3613,
  ],
  newInd: [
    -2139, -3696, -2136, -3698, -2133, -3699, -2123, -3705, -2121, -3706, -2076,
    -3624, -2078, -3623, -2086, -3619, -2094, -3615, -2138, -3695,
  ],
  modelInd: [
    -2176, -3738, -2188, -3723, -2180, -3718, -2186, -3710, -2171, -3699, -2168,
    -3703, -2157, -3694, -2151, -3702, -2170, -3716, -2161, -3727,
  ],
  power: [
    -2110, -3729, -2084, -3730, -2081, -3739, -2081, -3744, -2085, -3744, -2096,
    -3744, -2096, -3754, -2103, -3754, -2103, -3745, -2110, -3745, -2110, -3742,
    -2125, -3742, -2125, -3730, -2110, -3730,
  ],
  quarter: [
    -2068, -3740, -2076, -3731, -2070, -3726, -2050, -3710, -2042, -3720,
  ],
  b64: [
    -1874, -3609, -1885, -3595, -1834, -3557, -1836, -3544, -1818, -3541, -1814,
    -3565,
  ],
  sally: [
    -1908, -3646, -1898, -3639, -1900, -3635, -1891, -3629, -1893, -3625, -1897,
    -3621, -1917, -3634, -1914, -3638,
  ],
  chapel: [
    -1917, -3634, -1925, -3637, -1921, -3643, -1918, -3647, -1915, -3651, -1908,
    -3646, -1914, -3638,
  ],
  pier: [
    -1780, -3578, -1769, -3569, -1761, -3563, -1769, -3553, -1788, -3569, -1785,
    -3572, -1784, -3573,
  ],
};
export const ALCATRAZ_LIGHTHOUSE = { x: -1900, z: -3524, top: 51 };
function alcatraz(out: THREE.BufferGeometry[]) {
  const ROCK = '#5f584d',
    SCRUB = '#56613f',
    CONCRETE = '#b3ad9f',
    DARK = '#9d968a';
  const { coast } = ALCATRAZ;
  let cx = 0,
    cz = 0;
  const n = coast.length / 2;
  for (let i = 0; i < coast.length; i += 2) {
    cx += coast[i]!;
    cz += coast[i + 1]!;
  }
  cx /= n;
  cz /= n;
  const inner = coast.map((v, i) =>
    i % 2 ? cz + (v - cz) * 0.66 : cx + (v - cx) * 0.66,
  );
  const LOW = 10,
    HIGH = 25;
  out.push(paint(prism(coast, -3, LOW), SCRUB, K_PLAIN, ROCK));
  out.push(paint(prism(inner, LOW - 1, HIGH), SCRUB, K_PLAIN, ROCK));
  const on = (
    flat: number[],
    base: number,
    h: number,
    color: string,
    kind = K_PLAIN,
  ) => out.push(paint(prism(flat, base - 0.5, base + h), color, kind));
  on(ALCATRAZ.cellhouse, HIGH, 15, CONCRETE, K_FLOORS);
  on(ALCATRAZ.admin, HIGH, 12, CONCRETE);
  on(ALCATRAZ.dining, HIGH, 10, CONCRETE);
  on(ALCATRAZ.newInd, LOW, 9, DARK);
  on(ALCATRAZ.modelInd, LOW, 8, DARK);
  on(ALCATRAZ.power, LOW, 8, '#8a6f5a');
  on(ALCATRAZ.quarter, LOW, 7, CONCRETE);
  on(ALCATRAZ.sally, LOW, 7, DARK);
  on(ALCATRAZ.chapel, LOW, 9, '#b9ad93');
  on(ALCATRAZ.b64, 1, 14, '#b9ad93', K_FLOORS);
  on(ALCATRAZ.pier, -1, 2.5, '#6b5d4c');
  // the powerhouse chimney
  out.push(
    paint(
      new THREE.CylinderGeometry(1.6, 2.2, 30, 8).translate(
        -2086,
        LOW + 15,
        -3747,
      ),
      '#8a6f5a',
    ),
  );
  // the water tower: a tank on four legs
  const [wx, wz] = [-2044, -3670];
  out.push(
    paint(
      new THREE.CylinderGeometry(7, 7, 11, 12).translate(wx, LOW + 25.5, wz),
      '#cfc6b3',
    ),
  );
  out.push(
    paint(
      new THREE.ConeGeometry(7.4, 3, 12).translate(wx, LOW + 32.5, wz),
      '#b8ad98',
    ),
  );
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    out.push(
      paint(
        strut(
          new THREE.Vector3(wx + sx * 6.5, LOW, wz + sz * 6.5),
          new THREE.Vector3(wx + sx * 4.5, LOW + 20, wz + sz * 4.5),
          1,
        ),
        DARK,
      ),
    );
  }
  // the lighthouse: a white octagonal tower with its lamp room
  const L = ALCATRAZ_LIGHTHOUSE;
  out.push(
    paint(
      new THREE.CylinderGeometry(2, 2.6, 23, 8).translate(
        L.x,
        HIGH + 11.5,
        L.z,
      ),
      '#f1ede4',
    ),
  );
  out.push(
    paint(
      new THREE.CylinderGeometry(2.4, 2.4, 3, 8).translate(
        L.x,
        HIGH + 24.5,
        L.z,
      ),
      '#ffe7a3',
      K_LIGHT,
    ),
  );
  out.push(
    paint(
      new THREE.ConeGeometry(2.8, 2.5, 8).translate(L.x, HIGH + 27.2, L.z),
      '#2f3136',
    ),
  );
}
// ─── The house of Git ───────────────────────────────────────
// GitHub's HQ at 88 Colin P. Kelly Jr. St: a brick block on a round square of
// its own (migration 163 keeps lots 110 m away), and on its roof a giant dark
// octo-cat, a nod to the mascot, its tentacles spilling over the edges. The
// block is the OSM footprint the HQ's entrance sits on.
function gitHouse(out: THREE.BufferGeometry[]) {
  const BRICK = '#8c4a39',
    INK = '#24292f',
    X = 833,
    Z = 1393,
    ROT = -Math.PI / 4;
  const H = 17;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(40, H, 40, 0, H / 2, 0), BRICK, K_FLOORS));
  parts.push(paint(box(40.6, 1.2, 40.6, 0, H + 0.6, 0), '#6f3a2d'));
  // the square: round paving under the streets (they draw over it), inside the
  // 110 m the lots keep clear, with a curb ring
  parts.push(
    paint(
      new THREE.CylinderGeometry(92, 92, 0.2, 48).translate(0, -0.35, 0),
      '#5d6270',
    ),
  );
  const curb = new THREE.TorusGeometry(92, 0.7, 4, 64);
  curb.rotateX(Math.PI / 2);
  parts.push(paint(curb.translate(0, -0.1, 0), '#7a7f8c'));
  const cat: THREE.BufferGeometry[] = [];
  // the octo-cat: a round head with ears, a pale face, dark eyes, a small
  // body and five tentacles curling out over the roof (units of C meters)
  const C = 8,
    y0 = H + 1.2;
  const blob = (
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const g = new THREE.SphereGeometry(1, 10, 7);
    g.scale(sx * C, sy * C, sz * C);
    return g.translate(x * C, y0 + y * C, z * C);
  };
  cat.push(paint(blob(3.2, 3, 2.8, 0, 3, 0), INK)); // body
  cat.push(paint(blob(5.4, 4.3, 4.6, 0, 8.6, 0), INK)); // head
  for (const s of [1, -1]) {
    const ear = new THREE.ConeGeometry(1.8 * C, 3.6 * C, 4);
    ear.rotateZ(-s * 0.3);
    ear.translate(s * 3.4 * C, y0 + 12.6 * C, 0);
    cat.push(paint(ear, INK));
  }
  cat.push(paint(blob(4.2, 2.9, 1.2, 0, 8.1, 3.9), '#f2c9b1', K_LIGHT)); // face
  for (const s of [1, -1])
    cat.push(paint(blob(0.55, 0.85, 0.4, s * 1.55, 8.5, 4.95), INK));
  // tentacles run out over the roof, then drape down the facade to the square
  const drape = (r: number) =>
    Math.max(0.6, y0 + 0.7 * C - Math.max(0, r * C - 19) * 1.15);
  for (let t = 0; t < 5; t++) {
    const a = Math.PI * 0.1 + (t / 4) * Math.PI * 0.8; // fanned out the front
    let pr = 2,
      px = Math.cos(a) * pr,
      pz = Math.sin(a) * pr;
    for (let k = 0; k < 5; k++) {
      const ang = a + (k + 1) * 0.22 * (t % 2 ? 1 : -1);
      const r = 3.4 + k * 1.6;
      const nx = Math.cos(ang) * r,
        nz = Math.sin(ang) * r;
      cat.push(
        paint(
          strut(
            new THREE.Vector3(px * C, drape(pr), pz * C),
            new THREE.Vector3(nx * C, drape(r), nz * C),
            (1.3 - k * 0.18) * C,
          ),
          INK,
        ),
      );
      px = nx;
      pz = nz;
      pr = r;
    }
  }
  // it faces the street, where the door is (northwest)
  for (const g of cat) parts.push(g.rotateY(-Math.PI / 2));
  for (const g of parts) out.push(place(g, X, Z, ROT));
}
// ─── Material ───────────────────────────────────────────────
// One landmark layer in the scene, so its time and night level live here.
const UNIFORMS = { uNight: { value: 1 } };
const BEAM_UNIFORMS = { uOpacity: { value: 0 } };
function landmarkMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.05,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aKind;\nvarying float vKind;\nvarying vec3 vLPos;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vKind = aKind;\n  vLPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uNight;\nvarying float vKind;\nvarying vec3 vLPos;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec3 base = diffuseColor.rgb;
          vec3 glow = base * (0.08 + 0.14 * uNight);
          if (vKind > 0.5 && vKind < 1.5) {
            // lit floors: the facade goes dark at night and its rooms light up
            // in warm bands, a few left dark
            float floorBand = step(0.42, fract(vLPos.y / 4.2));
            float room = step(0.55, fract(sin(dot(floor(vec3(vLPos.x / 5.0, vLPos.y / 4.2, vLPos.z / 5.0)), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
            glow += vec3(1.0, 0.78, 0.45) * floorBand * room * uNight * 0.4;
            diffuseColor.rgb *= 1.0 - 0.6 * uNight;
            glow *= 1.0 - 0.3 * uNight * (1.0 - floorBand * room);
          } else if (vKind > 1.5 && vKind < 2.5) {
            glow = base * (0.25 + uNight * 1.6);
          }
          totalEmissiveRadiance += glow;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'gc-landmarks';
  return mat;
}
// The lighthouse beam: a soft additive cone sweeping round after dark, bright
// at the lamp and fading out along its length and toward its edges.
function createLighthouseBeam() {
  const group = { current: new THREE.Group() };
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: BEAM_UNIFORMS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
      varying float vAlong; varying float vEdge;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vAlong = uv.y; // 1 at the lamp (the apex), 0 at the far rim
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
        fragmentShader: /* glsl */ `
      uniform float uOpacity; varying float vAlong; varying float vEdge;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float a = pow(vAlong, 1.6) * pow(vEdge, 1.2) * uOpacity;
        gl_FragColor = vec4(1.0, 0.93, 0.74, a);
      }`,
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(34, 900, 20, 1, true);
    g.translate(0, -450, 0);
    g.rotateZ(Math.PI / 2 + 0.05); // tip at the lamp, opening outward along +x, a little upward
    return g;
  }, []);
  const update = (dt: number, night: number) => {
    group.current.rotation.y += dt * 0.6;
    BEAM_UNIFORMS.uOpacity.value = Math.max(0, night - 0.25) * 0.5;
    group.current.visible = BEAM_UNIFORMS.uOpacity.value > 0.005;
  };
  const L = ALCATRAZ_LIGHTHOUSE;
  group.current.position.set(L.x, L.top - 1.5, L.z);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  group.current.add(mesh);
  return { group: group.current, update };
}
export function createMapLandmarks() {
  const parts: THREE.BufferGeometry[] = [];
  alcatraz(parts);
  gitHouse(parts);
  const geometry = mergeBufferGeometries(parts, false) ?? parts[0]!;
  for (const part of parts) if (part !== geometry) part.dispose();
  geometry.computeBoundingSphere();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, landmarkMaterial()));
  const beam = createLighthouseBeam();
  group.add(beam.group);
  return {
    group,
    update: (dt: number, night: number) => {
      UNIFORMS.uNight.value = night;
      beam.update(dt, night);
    },
  };
}
