// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
// Instanced facade shading and pixel cells from InstancedBuildings.tsx. See NOTICE.
import {
  Color,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
} from 'three';
import type { RepoBuilding } from './repository-layout.ts';
import type { CityTheme } from './themes.ts';

export const REPOSITORY_VERTEX = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aGrid;
  attribute float aDim;
  attribute float aCustom;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTint;
  varying vec4 vGrid;
  varying float vDim;
  varying float vDepth;
  varying float vCustom;
  void main() {
    vUv = uv; vNormal = normal; vGrid = aGrid; vDim = aDim;
    vTint = instanceColor;
    vCustom = aCustom;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;
export const REPOSITORY_FRAGMENT = `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uActivity;
  uniform float uRows;
  uniform vec3 uFace;
  uniform vec3 uRoof;
  uniform vec3 uOff;
  uniform vec3 uWindows[5];
  uniform vec3 uFog;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTint;
  varying vec4 vGrid;
  varying float vDim;
  varying float vDepth;
  varying float vCustom;
  void main() {
    #include <logdepthbuf_fragment>
    float roof = step(.5, abs(vNormal.y));
    bool front = abs(vNormal.z) > .5;
    float columns = front ? vGrid.x : vGrid.y;
    vec2 grid = vUv * vec2(columns, vGrid.z);
    float slot = min(floor(grid.x), columns - 1.) + min(floor(grid.y), vGrid.z - 1.) * columns;
    float offset = front ? 0. : 1024.;
    float level = floor(texture2D(uActivity, vec2((offset + slot + .5) / 2048., (vGrid.w + .5) / uRows)).r * 255. + .5);
    vec2 inset = abs(fract(grid) - .5);
    vec2 aa = max(fwidth(grid) * .5, vec2(.002));
    float window = (1. - smoothstep(.375 - aa.x, .375 + aa.x, inset.x)) * (1. - smoothstep(.375 - aa.y, .375 + aa.y, inset.y));
    vec3 light = uOff;
    if (level > .5) {
      int index = int(clamp(level, 1., 4.));
      light = mix(uWindows[index], vTint * (.35 + level * .16), vCustom) * 1.8;
    }
    float detail = 1. - smoothstep(.6, 1.4, max(fwidth(grid.x), fwidth(grid.y)));
    vec3 wall = mix(uFace * .75, light, window * detail);
    vec3 color = mix(wall, uRoof * 1.4, roof);
    float directional = max(dot(vNormal, normalize(vec3(.3,1.,.5))),0.) * .3 + .7;
    color *= directional * vDim;
    color = mix(color, uFog, smoothstep(400., 3500., vDepth));
    gl_FragColor = vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** All 365 days contribute to each face's temporal buckets, including sparse activity. */
export function activityBuckets(counts: number[], slots: number): Uint8Array {
  const totals = new Float64Array(slots);
  counts.forEach((count, day) => {
    totals[
      Math.min(
        slots - 1,
        Math.floor((day * slots) / Math.max(1, counts.length)),
      )
    ]! += count;
  });
  const peak = Math.max(1, ...totals);
  return Uint8Array.from(totals, (count) =>
    count === 0
      ? 0
      : Math.min(4, 1 + Math.floor((Math.log1p(count) / Math.log1p(peak)) * 3)),
  );
}

export function createRepositoryMaterial(
  buildings: RepoBuilding[],
  theme: CityTheme,
) {
  const rows = Math.max(1, buildings.length),
    pixels = new Uint8Array(2048 * rows * 4);
  buildings.forEach((building, row) => {
    for (const [columns, offset] of [
      [building.columns, 0],
      [building.sideColumns, 1024],
    ] as const) {
      const levels = activityBuckets(
        building.dailyCounts,
        building.floors * columns,
      );
      levels.forEach((level, slot) => {
        pixels[(row * 2048 + offset + slot) * 4] = level;
        pixels[(row * 2048 + offset + slot) * 4 + 3] = 255;
      });
    }
  });
  const texture = new DataTexture(
    pixels,
    2048,
    rows,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  const material = new ShaderMaterial({
    vertexShader: REPOSITORY_VERTEX,
    fragmentShader: REPOSITORY_FRAGMENT,
    toneMapped: false,
    uniforms: {
      uActivity: { value: texture },
      uRows: { value: rows },
      uFace: { value: new Color() },
      uRoof: { value: new Color() },
      uOff: { value: new Color() },
      uWindows: { value: [] },
      uFog: { value: new Color() },
    },
  });
  const setTheme = (t: CityTheme) => {
    material.uniforms.uFace!.value.set(t.face);
    material.uniforms.uRoof!.value.set(t.roof);
    material.uniforms.uOff!.value.set(t.off);
    material.uniforms.uWindows!.value = t.windows.map(
      (color) => new Color(color),
    );
    material.uniforms.uFog!.value.set(t.fog);
  };
  setTheme(theme);
  return {
    material,
    setTheme,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}
