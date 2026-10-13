import { Color, Matrix4, MeshBasicMaterial } from 'three';
import type { PerspectiveCamera } from 'three';

/** Windows beyond the instance budget are drawn on the instanced repo bands. */
export function createBandMaterial() {
  const uniforms = {
    ccProjectionView: { value: new Matrix4() },
    ccViewportHeight: { value: 1 },
    ccBodyFaces: { value: ['#1c2856', '#273464', '#3a4773', '#131d3f', '#1f2b5e', '#192448'].map((hex) => new Color(hex)) },
    ccDim: { value: new Color('#464d67') },
    ccDarkWindow: { value: new Color('#10192f') },
  };
  const material = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  material.customProgramCacheKey = () => 'contribution-bands-with-virtual-windows-v1';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 ccBandInfo;
      attribute vec2 ccBandState;
      varying vec4 vCCInfo;
      varying vec2 vCCState;
      varying vec2 vCCUv;
      varying vec3 vCCNormal;
      varying vec3 vCCWorld;
      varying float vCCFloorHeight;
      varying float vCCWidth;
    `).replace('#include <begin_vertex>', `#include <begin_vertex>
      vCCInfo = ccBandInfo;
      vCCState = ccBandState;
      vCCUv = uv;
      vCCNormal = normal;
      vCCWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
      vCCFloorHeight = instanceMatrix[1][1] / ccBandInfo.y;
      vCCWidth = max(abs(instanceMatrix[0][0]), 0.0001);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform mat4 ccProjectionView;
      uniform float ccViewportHeight;
      uniform vec3 ccBodyFaces[6];
      uniform vec3 ccDim;
      uniform vec3 ccDarkWindow;
      varying vec4 vCCInfo;
      varying vec2 vCCState;
      varying vec2 vCCUv;
      varying vec3 vCCNormal;
      varying vec3 vCCWorld;
      varying float vCCFloorHeight;
      varying float vCCWidth;
      bool ccWindowLit(uint day, uint floorIndex, uint face, uint column) {
        uint h = (day + 1u) * 73856093u ^ (floorIndex + 1u) * 19349663u
          ^ (face + 1u) * 83492791u ^ (column + 1u) * 2654435761u;
        h = (h ^ (h >> 16u)) * 0x45d9f3bu;
        return (h ^ (h >> 16u)) >= 515396076u;
      }
      vec3 ccBodyColor(vec3 n) {
        if (n.x > 0.5) return ccBodyFaces[0];
        if (n.x < -0.5) return ccBodyFaces[1];
        if (n.y > 0.5) return ccBodyFaces[2];
        if (n.y < -0.5) return ccBodyFaces[3];
        if (n.z > 0.5) return ccBodyFaces[4];
        return ccBodyFaces[5];
      }
    `).replace('#include <color_fragment>', `#include <color_fragment>
      vec3 ccBandColor = diffuseColor.rgb;
      float ccFaceLight = vCCNormal.y > 0.5 ? 1.15 : vCCNormal.x > 0.5 ? 0.8 : vCCNormal.z > 0.5 ? 1.0 : 0.68;
      diffuseColor.rgb *= ccFaceLight;
      if (vCCInfo.w > 0.5) {
        vec4 p0 = ccProjectionView * vec4(vCCWorld, 1.0);
        vec4 p1 = ccProjectionView * vec4(vCCWorld + vec3(0.0, vCCFloorHeight, 0.0), 1.0);
        float floorPixels = abs(p1.y / max(abs(p1.w), 0.0001) - p0.y / max(abs(p0.w), 0.0001)) * ccViewportHeight * 0.5;
        float detail = smoothstep(2.0, 3.2, floorPixels);
        if (detail > 0.0) {
          vec3 body = ccBodyColor(vCCNormal) * mix(ccDim, vec3(1.0), vCCState.y);
          vec3 detailedColor = body;
          if (abs(vCCNormal.y) < 0.5) {
            float floorCoord = vCCUv.y * vCCInfo.y;
            float spacing = 0.225 / vCCWidth;
            float column = clamp(floor((vCCUv.x - 0.5) / spacing + 1.5), 0.0, 2.0);
            float center = 0.5 + (column - 1.0) * spacing;
            float radiusX = 0.115 / (2.0 * vCCWidth);
            float aaX = max(fwidth(vCCUv.x) * 0.5, 0.00001);
            float aaY = max(fwidth(floorCoord) * 0.5, 0.00001);
            float windowX = 1.0 - smoothstep(radiusX - aaX, radiusX + aaX, abs(vCCUv.x - center));
            float windowY = 1.0 - smoothstep(0.21875 - aaY, 0.21875 + aaY, abs(fract(floorCoord) - 0.5));
            float windowAmount = windowX * windowY;
            uint face = vCCNormal.z > 0.5 ? 0u : vCCNormal.x > 0.5 ? 1u : vCCNormal.z < -0.5 ? 2u : 3u;
            bool lit = vCCState.x > 0.5 && ccWindowLit(uint(vCCInfo.z), uint(vCCInfo.x + floor(floorCoord)), face, uint(column));
            vec3 windowColor = lit ? ccBandColor / 0.48 : ccDarkWindow;
            detailedColor = mix(body, windowColor, windowAmount);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, detailedColor, detail);
        }
      }
    `);
  };
  return {
    material,
    update: (camera: PerspectiveCamera, height: number) => {
      uniforms.ccProjectionView.value.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      uniforms.ccViewportHeight.value = Math.max(1, height);
    },
  };
}
