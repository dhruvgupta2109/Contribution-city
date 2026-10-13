import { describe, expect, it } from 'vitest';
import { parse } from '@shaderfrog/glsl-parser';
import preprocess from '@shaderfrog/glsl-parser/preprocessor/index.js';
import { Mesh, ShaderChunk, ShaderMaterial } from 'three';
import {
  REPOSITORY_FRAGMENT,
  REPOSITORY_VERTEX,
} from './repository-material.ts';
import { createMapWater } from './map-water.ts';
import { createMapLandmarks } from './map-landmarks.ts';
function expand(source: string): string {
  return source.replace(
    /#include <(\w+)>/g,
    (_, name: keyof typeof ShaderChunk) => expand(ShaderChunk[name]),
  );
}
describe('repository facade shader', () => {
  it('parses the expanded instanced facade shaders as GLSL ES 3', () => {
    const vertex = `#define USE_LOGDEPTHBUF
      #define attribute in
      #define varying out
      in vec3 position; in vec3 normal; in vec2 uv;
      in mat4 instanceMatrix; in vec3 instanceColor;
      uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
      uniform mat4 modelMatrix; uniform mat4 viewMatrix;
    `;
    const fragment = `#define USE_LOGDEPTHBUF
      #define varying in
      #define texture2D texture
      #define gl_FragColor pc_fragColor
      out vec4 pc_fragColor;
      vec4 linearToOutputTexel(vec4 value){return value;}
    `;
    expect(() =>
      parse(preprocess(vertex + expand(REPOSITORY_VERTEX)), {
        stage: 'vertex',
        quiet: true,
        failOnWarn: true,
      }),
    ).not.toThrow();
    expect(() =>
      parse(preprocess(fragment + expand(REPOSITORY_FRAGMENT)), {
        stage: 'fragment',
        quiet: true,
        failOnWarn: true,
      }),
    ).not.toThrow();
  });
  it('parses the reference water and lighthouse beam with fog and logarithmic depth enabled', () => {
    const water = createMapWater({ cx: 0, cz: 0, size: 1000, y: -2 }),
      landmarks = createMapLandmarks(),
      materials: ShaderMaterial[] = [water.mesh.material];
    landmarks.group.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof ShaderMaterial)
        materials.push(object.material);
    });
    expect(materials.length).toBeGreaterThan(1);
    const vertex = `#define USE_LOGDEPTHBUF
      #define USE_FOG
      #define attribute in
      #define varying out
      in vec3 position; in vec3 normal; in vec2 uv;
      uniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 viewMatrix; uniform mat3 normalMatrix;
    `;
    const fragment = `#define USE_LOGDEPTHBUF
      #define USE_FOG
      #define varying in
      #define gl_FragColor pc_fragColor
      out vec4 pc_fragColor;
      uniform vec3 cameraPosition;
    `;
    for (const material of materials) {
      expect(() =>
        parse(preprocess(vertex + expand(material.vertexShader)), {
          stage: 'vertex',
          quiet: true,
          failOnWarn: true,
        }),
      ).not.toThrow();
      expect(() =>
        parse(preprocess(fragment + expand(material.fragmentShader)), {
          stage: 'fragment',
          quiet: true,
          failOnWarn: true,
        }),
      ).not.toThrow();
      material.dispose();
    }
    water.mesh.geometry.dispose();
    landmarks.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        if (!(object.material instanceof ShaderMaterial))
          object.material.dispose();
      }
    });
  });
});
