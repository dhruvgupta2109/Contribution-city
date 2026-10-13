import { describe, expect, it } from 'vitest';
import { parse } from '@shaderfrog/glsl-parser';
import preprocess from '@shaderfrog/glsl-parser/preprocessor/index.js';
import { PerspectiveCamera, ShaderChunk, ShaderLib } from 'three';
import type { WebGLRenderer } from 'three';
import { createBandMaterial } from './band-material.ts';

function expand(source: string): string {
  return source.replace(/#include <(\w+)>/g, (_, name: keyof typeof ShaderChunk) => expand(ShaderChunk[name]));
}

describe('virtual window shader', () => {
  it('parses the expanded vertex and fragment shaders as GLSL ES 3', () => {
    const band = createBandMaterial();
    const shader = { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
    band.material.onBeforeCompile(shader as Parameters<typeof band.material.onBeforeCompile>[0], {} as WebGLRenderer);
    const definitions = '#define USE_INSTANCING\n#define USE_INSTANCING_COLOR\n#define NUM_CLIPPING_PLANES 0\n#define UNION_CLIPPING_PLANES 0\n';
    const vertexPrefix = `${definitions}
      #define attribute in
      #define varying out
      uniform mat4 modelMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform mat4 viewMatrix;
      uniform mat3 normalMatrix;
      in vec3 position;
      in vec3 normal;
      in vec2 uv;
      in mat4 instanceMatrix;
      in vec3 instanceColor;
    `;
    const fragmentPrefix = `${definitions}
      #define varying in
      #define gl_FragColor pc_fragColor
      out vec4 pc_fragColor;
      vec4 linearToOutputTexel(vec4 value) { return value; }
    `;
    expect(() => parse(preprocess(vertexPrefix + expand(shader.vertexShader)), { stage: 'vertex', quiet: true, failOnWarn: true })).not.toThrow();
    expect(() => parse(preprocess(fragmentPrefix + expand(shader.fragmentShader)), { stage: 'fragment', quiet: true, failOnWarn: true })).not.toThrow();
    band.material.dispose();
  });
  it('keeps camera projection and viewport uniforms current', () => {
    const band = createBandMaterial(); const camera = new PerspectiveCamera(42, 1.5, .05, 1000);
    camera.position.set(0, 8, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); band.update(camera, 640);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
    band.material.onBeforeCompile(shader as Parameters<typeof band.material.onBeforeCompile>[0], {} as WebGLRenderer);
    expect(shader.uniforms.ccViewportHeight?.value).toBe(640);
    band.update(camera, 800); expect(shader.uniforms.ccViewportHeight?.value).toBe(800);
    expect(shader.uniforms.ccBodyFaces?.value).toHaveLength(6); band.material.dispose();
  });
});
