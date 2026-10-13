// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
export function patchGround(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      /* glsl */ `#include <common>
      varying vec3 vGPos;
      float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gNoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(gHash(i), gHash(i+vec2(1.0,0.0)), u.x),
                   mix(gHash(i+vec2(0.0,1.0)), gHash(i+vec2(1.0,1.0)), u.x), u.y);
      }
      float gFbm(vec2 p){ float v=0.0,a=0.5; for(int k=0;k<4;k++){ v+=a*gNoise(p); p*=2.0; a*=0.5; } return v; }`,
    )
    .replace(
      '#include <normal_fragment_begin>',
      /* glsl */ `#include <normal_fragment_begin>
      {
        vec2 q = vGPos.xz;
        float e = 6.0;
        float gx = gNoise((q + vec2(e,0.0))*0.012) - gNoise((q - vec2(e,0.0))*0.012);
        float gz = gNoise((q + vec2(0.0,e))*0.012) - gNoise((q - vec2(0.0,e))*0.012);
        normal = normalize(normal + mat3(viewMatrix) * vec3(-gx, 0.0, -gz) * 3.5);
      }`,
    )
    .replace(
      '#include <map_fragment>',
      /* glsl */ `#include <map_fragment>
      diffuseColor.rgb *= 0.80 + 0.42 * gFbm(vGPos.xz * 0.0045);        // large-scale mottle
      diffuseColor.rgb *= 0.94 + 0.12 * gNoise(vGPos.xz * 0.06);        // fine grain`,
    );
}
