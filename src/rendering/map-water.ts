// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
function useMemo<T>(build: () => T, _dependencies: unknown[]): T {
  return build();
}
export function createMapWater({
  cx,
  cz,
  size,
  y,
}: {
  cx: number;
  cz: number;
  size: number;
  y: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uDeep: { value: new THREE.Color('#0c2230') },
            uShallow: { value: new THREE.Color('#163f52') },
            uSky: { value: new THREE.Color('#0a1428') },
            uSunDir: { value: new THREE.Vector3(0.28, 0.86, 0.42) },
            uSunCol: { value: new THREE.Color('#cfe0ff') },
            uNight: { value: 1 },
          },
        ]),
        vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWPos;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // tiny large-scale swell only — stays well below the shoreline
        wp.y += sin(wp.x*0.004 + uTime*0.5)*0.3 + sin(wp.z*0.005 - uTime*0.4)*0.3;
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
        fragmentShader: /* glsl */ `
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunCol;
      uniform vec3 uSunDir; uniform float uNight; uniform float uTime;
      varying vec3 vWPos;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 toCam = cameraPosition - vWPos;
        float dist = length(toCam);
        vec3 V = toCam / max(dist, 1e-4);
        // per-pixel ripple normal, faded out in the distance to keep far water calm
        float fade = clamp(1.0 - dist / 3500.0, 0.0, 1.0);
        vec2 p = vWPos.xz; float t = uTime;
        // gentle, low-slope ripples (kept small so the sheen reads as subtle
        // shimmer instead of bright criss-cross streaks)
        vec2 d = vec2(sin(p.x*0.045 + t*1.0), sin(p.y*0.05 - t*0.85)) * 0.14;
        d += vec2(sin((p.x+p.y)*0.08 + t*1.5), sin((p.x-p.y)*0.07 - t*1.2)) * 0.08;
        d += vec2(sin(p.x*0.15 - t*1.8), sin(p.y*0.13 + t*1.4)) * 0.04;
        d *= fade;
        vec3 N = normalize(vec3(-d.x, 1.0, -d.y));
        // key light: real sun by day, an overhead moon by night (sunDir is below
        // the horizon at night, so blend to an up-ish dir to keep the sheen alive)
        vec3 L = normalize(mix(normalize(uSunDir), vec3(0.30, 0.92, 0.20), uNight));
        float ndl = max(dot(N, L), 0.0);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(uDeep, uShallow, clamp(0.30 + 0.35*ndl, 0.0, 1.0));
        col += uSky * 0.06 * (N.y*0.5 + 0.5);          // soft hemispheric fill
        col = mix(col, uSky * 1.1, fres * 0.35);       // faint sky reflection at grazing
        // tight, faint specular — small glints riding the ripples, not streaks
        float spec = pow(max(dot(N, normalize(L + V)), 0.0), 220.0);
        col += uSunCol * spec * 0.22 * fade;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
      }),
    [],
  );
  const update = (dt: number, night: number, sky: string) => {
    mat.uniforms.uTime!.value += dt;
    mat.uniforms.uNight!.value = night;
    (mat.uniforms.uSky!.value as THREE.Color).set(sky);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 48, 48), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, y, cz);
  return { mesh, update };
}
