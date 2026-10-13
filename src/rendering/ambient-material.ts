import { Color, ShaderMaterial } from 'three';
import type { CityTheme } from './themes.ts';

// A procedural, subdued skyline avoids tens of thousands of window meshes.
// Its hash pattern is decorative: repository activity is drawn only by the
// separate data-tower material.
export const AMBIENT_VERTEX = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aPattern;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTint;
  varying vec4 vPattern;
  varying float vDepth;
  void main() {
    vUv = uv;
    vNormal = normal;
    vTint = instanceColor;
    vPattern = aPattern;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

export const AMBIENT_FRAGMENT = `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uOff;
  uniform vec3 uWindow;
  uniform vec3 uRoof;
  uniform vec3 uFog;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTint;
  varying vec4 vPattern;
  varying float vDepth;
  void main() {
    #include <logdepthbuf_fragment>
    float roof = step(.5, abs(vNormal.y));
    bool front = abs(vNormal.z) > .5;
    vec2 grid = vUv * vec2(front ? vPattern.x : vPattern.y, vPattern.z);
    vec2 cell = floor(grid);
    float random = fract(sin(dot(vec3(cell, vPattern.w), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vec2 inset = abs(fract(grid) - .5);
    vec2 aa = max(fwidth(grid) * .5, vec2(.002));
    float window = (1. - smoothstep(.28 - aa.x, .28 + aa.x, inset.x)) *
                   (1. - smoothstep(.30 - aa.y, .30 + aa.y, inset.y));
    float detail = 1. - smoothstep(.6, 1.4, max(fwidth(grid.x), fwidth(grid.y)));
    vec3 light = mix(uOff, uWindow * (.75 + random * .3), step(.76, random));
    vec3 wall = mix(vTint * .68, light, window * detail);
    vec3 color = mix(wall, uRoof * .85, roof);
    color *= max(dot(vNormal, normalize(vec3(.3, 1., .5))), 0.) * .3 + .7;
    color = mix(color, uFog, smoothstep(400., 3500., vDepth));
    gl_FragColor = vec4(color, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createAmbientMaterial(theme: CityTheme) {
  const material = new ShaderMaterial({
    vertexShader: AMBIENT_VERTEX,
    fragmentShader: AMBIENT_FRAGMENT,
    toneMapped: false,
    uniforms: {
      uOff: { value: new Color() },
      uWindow: { value: new Color() },
      uRoof: { value: new Color() },
      uFog: { value: new Color() },
    },
  });
  const setTheme = (next: CityTheme) => {
    material.uniforms.uOff!.value.set(next.off);
    material.uniforms.uWindow!.value.set(next.windows[2]);
    material.uniforms.uRoof!.value.set(next.roof);
    material.uniforms.uFog!.value.set(next.fog);
  };
  setTheme(theme);
  return { material, setTheme, dispose: () => material.dispose() };
}
