import {
  Box3,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
const loaded = new Map<string, Promise<GLTF>>();
export function loadModel(path: string): Promise<GLTF> {
  let promise = loaded.get(path);
  if (!promise) {
    promise = new GLTFLoader().loadAsync(path);
    loaded.set(path, promise);
  }
  return promise;
}
export function bakeModel(
  gltf: GLTF,
  target: number,
  dimension: 'height' | 'length' = 'height',
  rotation = 0,
) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root),
    size = bounds.getSize(new Vector3());
  const scale =
    target /
    Math.max(0.001, dimension === 'height' ? size.y : Math.max(size.x, size.z));
  const groups = new Map<MeshStandardMaterial, BufferGeometry[]>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.translate(0, -bounds.min.y, 0);
    geometry.rotateY(rotation);
    geometry.scale(scale, scale, scale);
    const material = (
      Array.isArray(object.material) ? object.material[0] : object.material
    ) as MeshStandardMaterial;
    const geometries = groups.get(material) ?? [];
    geometries.push(geometry);
    groups.set(material, geometries);
  });
  return [...groups].map(([original, geometries]) => {
    const geometry =
      geometries.length === 1
        ? geometries[0]!
        : mergeGeometries(geometries, false)!;
    geometries.forEach((part) => {
      if (part !== geometry) part.dispose();
    });
    return { geometry, material: original.clone() };
  });
}
