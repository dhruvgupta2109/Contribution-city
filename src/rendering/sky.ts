// Palette/sky dome adapted from Git City. SPDX-License-Identifier: AGPL-3.0-only
import {
  BackSide,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { CITY_THEMES } from './themes.ts';

export function createCitySky(index = 0) {
  const material = new MeshBasicMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new SphereGeometry(3800, 32, 32), material);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_renderer, _scene, camera) =>
    mesh.position.copy(camera.position);
  const setTheme = (index: number) => {
    const stops = CITY_THEMES[index]!.sky,
      pixels = new Uint8Array(2 * 512 * 4);
    const rgb = (hex: string) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    for (let y = 0; y < 512; y++) {
      const t = y / 511;
      let stop = 1;
      while (stop < stops.length - 1 && stops[stop]![0] < t) stop++;
      const [a, ca] = stops[stop - 1]!,
        [b, cb] = stops[stop]!,
        mix = (t - a) / (b - a),
        left = rgb(ca),
        right = rgb(cb);
      for (let x = 0; x < 2; x++) {
        const offset = (y * 2 + x) * 4;
        for (let c = 0; c < 3; c++)
          pixels[offset + c] = Math.round(
            left[c]! + (right[c]! - left[c]!) * mix,
          );
        pixels[offset + 3] = 255;
      }
    }
    material.map?.dispose();
    const texture = new DataTexture(
      pixels,
      2,
      512,
      RGBAFormat,
      UnsignedByteType,
    );
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    material.map = texture;
    material.needsUpdate = true;
  };
  setTheme(index);
  return {
    mesh,
    setTheme,
    dispose: () => {
      mesh.geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
  };
}
