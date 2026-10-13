// Main map renderer adapted from Git City SFMapLayers. SPDX-License-Identifier: AGPL-3.0-only
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Sphere,
  Vector3,
} from 'three';
import type { Material, PerspectiveCamera } from 'three';
import type { MapWorld } from './world-types.ts';
import { upNormals } from './map-geometry.ts';
import { patchGround } from './map-ground-material.ts';
import { createMapWater } from './map-water.ts';
import { createGoldenGateBridge } from './map-golden-bridge.ts';
import { createBayBridge } from './map-bay-bridge.ts';
import { createMapLandmarks } from './map-landmarks.ts';
import { createMapTraffic } from './map-traffic.ts';
import { trafficSignal } from './traffic.ts';
import { bakeModel, loadModel } from './model-assets.ts';
import { CITY_THEMES } from './themes.ts';
import { createUrbanBackfill } from './urban-backfill.ts';
import type { OccupiedLot } from './urban-backfill.ts';
import { createAmbientMaterial } from './ambient-material.ts';

const TREE_NAMES = [
  'tree_default',
  'tree_oak',
  'tree_fat',
  'tree_detailed',
  'tree_pineTallA',
  'tree_palmTall',
];
type Part = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw?: number;
  color?: string;
};
export function createMapEnvironment(
  world: MapWorld,
  themeIndex: number,
  occupied: readonly OccupiedLot[] = [],
) {
  const group = new Group(),
    box = new BoxGeometry(1, 1, 1),
    cylinder = new CylinderGeometry(1, 1, 1, 8),
    scratch = new Object3D(),
    color = new Color(),
    view = new Vector3(),
    forward = new Vector3();
  let alive = true,
    theme = themeIndex,
    elapsed = 0,
    lastTreeCull = -1;
  const ownedGeometries = new Set<BufferGeometry>([box, cylinder]),
    ownedMaterials = new Set<Material>();
  const solid = (hex: string, emissive = 0) => {
    const mat = new MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: emissive,
      roughness: 0.85,
    });
    ownedMaterials.add(mat);
    return mat;
  };
  const glow = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  ownedMaterials.add(glow);
  const geometry = (positions: Float32Array) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute(
      'normal',
      new BufferAttribute(upNormals(positions), 3),
    );
    const [minx, minz, maxx, maxz] = world.bounds;
    geometry.boundingSphere = new Sphere(
      new Vector3((minx + maxx) / 2, 0, (minz + maxz) / 2),
      Math.hypot(maxx - minx, maxz - minz) / 2 + 10,
    );
    ownedGeometries.add(geometry);
    return geometry;
  };
  const landMat = new MeshStandardMaterial({
    color: '#4a5468',
    emissive: '#2b3550',
    emissiveIntensity: 0.22,
    roughness: 0.97,
    side: DoubleSide,
  });
  landMat.onBeforeCompile = patchGround;
  landMat.customProgramCacheKey = () => 'gc-ground';
  ownedMaterials.add(landMat);
  const parkMat = new MeshStandardMaterial({
    color: '#33513a',
    emissive: '#16301d',
    emissiveIntensity: 0.36,
    roughness: 1,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  ownedMaterials.add(parkMat);
  const sidewalk = new Mesh(
    geometry(world.arrays.sidewalk),
    new MeshStandardMaterial({
      color: '#525866',
      roughness: 0.95,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  sidewalk.position.y = -0.28;
  sidewalk.renderOrder = 1;
  ownedMaterials.add(sidewalk.material);
  const asphalt = new Mesh(
    geometry(world.arrays.asphalt),
    new MeshStandardMaterial({
      color: '#32373f',
      roughness: 0.92,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  asphalt.position.y = -0.24;
  asphalt.renderOrder = 2;
  ownedMaterials.add(asphalt.material);
  const parkMesh = new Mesh(geometry(world.arrays.parks), parkMat);
  parkMesh.position.y = -0.16;
  parkMesh.renderOrder = 3;
  group.add(
    new Mesh(geometry(world.arrays.land), landMat),
    sidewalk,
    asphalt,
    parkMesh,
  );
  const [minx, minz, maxx, maxz] = world.bounds,
    w = maxx - minx,
    h = maxz - minz;
  const water = createMapWater({
    cx: (minx + maxx) / 2,
    cz: (minz + maxz) / 2,
    size: Math.max(w, h) * 2.5,
    y: -2,
  });
  group.add(water.mesh);
  const landmarks = createMapLandmarks();
  group.add(
    landmarks.group,
    createGoldenGateBridge({ a: world.goldenGate[0], b: world.goldenGate[1] }),
    createBayBridge(),
  );
  const batch = (
    geometry: BufferGeometry,
    material: Material,
    parts: Part[],
    dynamic = false,
  ) => {
    const mesh = new InstancedMesh(geometry, material, parts.length);
    mesh.frustumCulled = false;
    if (dynamic) mesh.instanceMatrix.setUsage(35048);
    parts.forEach((part, index) => {
      scratch.position.set(part.x, part.y, part.z);
      scratch.rotation.set(0, part.yaw ?? 0, 0);
      scratch.scale.set(part.sx, part.sy, part.sz);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
      mesh.setColorAt(index, color.set(part.color ?? '#ffffff'));
    });
    group.add(mesh);
    return mesh;
  };
  const poles: Part[] = [],
    heads: Part[] = [],
    benches: Part[] = [],
    backs: Part[] = [],
    legs: Part[] = [],
    basins: Part[] = [],
    tiers: Part[] = [],
    upper: Part[] = [],
    waters: Part[] = [];
  for (const park of world.parks.slice(0, 12)) {
    for (const sign of [-1, 1]) {
      const x = park.x + sign * Math.min(park.radius * 0.4, 18),
        z = park.z;
      benches.push({ x, y: 0.9, z, sx: 5, sy: 0.3, sz: 1.5 });
      backs.push({ x, y: 1.7, z: z - 0.65, sx: 5, sy: 1.3, sz: 0.2 });
      for (const dx of [-2, 2])
        legs.push({ x: x + dx, y: 0.45, z, sx: 0.3, sy: 0.9, sz: 1.2 });
      poles.push({ x: x + 8, y: 9, z: z + 8, sx: 0.35, sy: 18, sz: 0.35 });
      heads.push({
        x: x + 8,
        y: 18.5,
        z: z + 8,
        sx: 1.5,
        sy: 0.8,
        sz: 1.5,
        color: '#f0d870',
      });
    }
    if (park.radius >= 22) {
      basins.push({ x: park.x, y: 1.2, z: park.z, sx: 8, sy: 2.4, sz: 8 });
      tiers.push({ x: park.x, y: 3.4, z: park.z, sx: 5, sy: 2, sz: 5 });
      upper.push({ x: park.x, y: 5.6, z: park.z, sx: 2.5, sy: 2, sz: 2.5 });
      waters.push({
        x: park.x,
        y: 7.2,
        z: park.z,
        sx: 1.8,
        sy: 1.2,
        sz: 1.8,
        color: '#4090d0',
      });
    }
  }
  batch(box, solid('#6b4226', 0.3), benches);
  batch(box, solid('#6b4226', 0.3), backs);
  batch(box, solid('#3a3a3a', 0.3), legs);
  batch(cylinder, solid('#4a4a4a', 0.3), poles);
  batch(box, glow, heads);
  const fountainGeometry = new CylinderGeometry(1, 1.0625, 1, 16);
  ownedGeometries.add(fountainGeometry);
  batch(fountainGeometry, solid('#707070', 0.25), basins);
  batch(fountainGeometry, solid('#808080', 0.25), tiers);
  batch(fountainGeometry, solid('#909090', 0.25), upper);
  batch(fountainGeometry, glow, waters);
  const ambience = createUrbanBackfill(world, occupied),
    ambientGeometry = box.clone(),
    ambientPattern = new InstancedBufferAttribute(
      new Float32Array(ambience.length * 4),
      4,
    ),
    ambientMaterial = createAmbientMaterial(CITY_THEMES[theme]!);
  ambience.forEach((building, i) => {
    ambientPattern.setXYZW(
      i,
      Math.max(2, Math.floor(building.width / 3)),
      Math.max(2, Math.floor(building.depth / 3)),
      Math.max(3, Math.floor(building.height / 3.5)),
      building.seed % 10000,
    );
  });
  ambientGeometry.setAttribute('aPattern', ambientPattern);
  ownedGeometries.add(ambientGeometry);
  ownedMaterials.add(ambientMaterial.material);
  const ambientWalls = batch(
    ambientGeometry,
    ambientMaterial.material,
    ambience.map((b) => ({
      x: b.x,
      y: b.height / 2,
      z: b.z,
      sx: b.width,
      sy: b.height,
      sz: b.depth,
    })),
  );
  const ambientRoofs = batch(
    box,
    solid('#ffffff'),
    ambience.map((b) => ({
      x: b.x,
      y: b.height + 0.2,
      z: b.z,
      sx: b.width + 0.5,
      sy: 0.4,
      sz: b.depth + 0.5,
    })),
  );
  const colorAmbience = (index: number) => {
    const base = new Color(CITY_THEMES[index]!.sidewalk);
    ambientMaterial.setTheme(CITY_THEMES[index]!);
    ambience.forEach((b, i) => {
      const shade = 0.52 + (b.seed % 5) * 0.065;
      ambientWalls.setColorAt(i, color.copy(base).multiplyScalar(shade));
      ambientRoofs.setColorAt(i, color.copy(base).multiplyScalar(shade * 0.8));
    });
    if (ambientWalls.instanceColor)
      ambientWalls.instanceColor.needsUpdate = true;
    if (ambientRoofs.instanceColor)
      ambientRoofs.instanceColor.needsUpdate = true;
  };
  colorAmbience(theme);
  const treePools: { meshes: InstancedMesh[]; records: Part[] }[] = [];
  TREE_NAMES.forEach((name, variant) => {
    void loadModel(`/models/trees/${name}.glb`)
      .then((gltf) => {
        if (!alive) return;
        const parts = bakeModel(gltf, 11),
          records: Part[] = [];
        for (
          let i = variant;
          i < world.trees.length / 3;
          i += TREE_NAMES.length
        ) {
          const x = world.trees[i * 3]!,
            z = world.trees[i * 3 + 1]!,
            scale = 0.7 + world.trees[i * 3 + 2]! * 0.6;
          records.push({
            x,
            y: 0,
            z,
            sx: scale,
            sy: scale,
            sz: scale,
            yaw: (x * 13.7 + z * 7.1) % 6.283,
          });
        }
        const meshes = parts.map((part) => {
          ownedGeometries.add(part.geometry);
          ownedMaterials.add(part.material);
          const mesh = batch(part.geometry, part.material, records, true);
          mesh.count = 0;
          return mesh;
        });
        treePools.push({ meshes, records });
        lastTreeCull = -1;
      })
      .catch(() => {
        /* Geometry and data remain available if a model cannot load. */
      });
  });
  const traffic = createMapTraffic(world),
    fallbackBody = batch(
      box,
      solid('#ffffff'),
      traffic.cars.map((car) => ({
        x: car.x,
        y: 1.5,
        z: car.z,
        sx: 8,
        sy: 2.5,
        sz: 3.5,
        color: car.color,
      })),
      true,
    );
  const fallbackCabin = batch(
    box,
    solid('#172028'),
    traffic.cars.map((car) => ({
      x: car.x,
      y: 3.5,
      z: car.z,
      sx: 5,
      sy: 2,
      sz: 3.2,
    })),
    true,
  );
  const wheelMesh = batch(
    cylinder,
    solid('#101013'),
    Array.from({ length: traffic.cars.length * 4 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    })),
    true,
  );
  const carLights = batch(
    box,
    glow,
    Array.from({ length: traffic.cars.length * 4 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    })),
    true,
  );
  const carModels: InstancedMesh[] = [];
  const wheelModels: InstancedMesh[] = [];
  void loadModel('/models/cars/sedan.glb')
    .then((gltf) => {
      if (!alive) return;
      for (const part of bakeModel(gltf, 8, 'length', -Math.PI / 2)) {
        ownedGeometries.add(part.geometry);
        ownedMaterials.add(part.material);
        carModels.push(
          batch(
            part.geometry,
            part.material,
            traffic.cars.map((car) => ({
              x: car.x,
              y: 0.5,
              z: car.z,
              sx: 1,
              sy: 1,
              sz: 1,
              color: car.color,
            })),
            true,
          ),
        );
      }
      fallbackBody.visible = false;
      fallbackCabin.visible = false;
    })
    .catch(() => {});
  void loadModel('/models/cars/wheel.glb')
    .then((gltf) => {
      if (!alive) return;
      for (const part of bakeModel(gltf, 1.6, 'height', -Math.PI / 2)) {
        ownedGeometries.add(part.geometry);
        ownedMaterials.add(part.material);
        wheelModels.push(
          batch(
            part.geometry,
            part.material,
            Array.from({ length: traffic.cars.length * 4 }, () => ({
              x: 0,
              y: 0,
              z: 0,
              sx: 1,
              sy: 1,
              sz: 1,
            })),
            true,
          ),
        );
      }
      wheelMesh.visible = false;
    })
    .catch(() => {});
  const signals: { x: number; z: number; yaw: number; axis: 'x' | 'z' }[] = [],
    signalPoles: Part[] = [],
    housing: Part[] = [],
    crossings: Part[] = [];
  for (const intersection of traffic.intersections)
    for (const direction of intersection.directions) {
      const x = intersection.x + direction.x * 12 - direction.z * 8,
        z = intersection.z + direction.z * 12 + direction.x * 8,
        yaw = Math.atan2(direction.x, direction.z);
      signals.push({ x, z, yaw, axis: direction.axis });
      signalPoles.push({ x, y: 3.2, z, sx: 0.3, sy: 6.4, sz: 0.3 });
      housing.push({ x, y: 7.5, z, sx: 1.8, sy: 4.6, sz: 1.4, yaw });
      for (let stripe = -6; stripe <= 6; stripe += 3)
        crossings.push({
          x: intersection.x + direction.x * 16 - direction.z * stripe,
          y: -0.05,
          z: intersection.z + direction.z * 16 + direction.x * stripe,
          sx: 1.5,
          sy: 0.04,
          sz: 4,
          yaw: Math.atan2(direction.x, direction.z),
        });
    }
  batch(cylinder, solid('#494e4b'), signalPoles);
  batch(box, solid('#161b18'), housing);
  batch(box, solid('#bcc4c2'), crossings);
  const bulbs = batch(
    box,
    glow,
    Array.from({ length: signals.length * 3 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    })),
    true,
  );
  const updateCars = () => {
    traffic.cars.forEach((car, index) => {
      const put = (
        mesh: InstancedMesh,
        id: number,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        rx = 0,
      ) => {
        scratch.position.set(
          car.x + Math.cos(car.yaw) * x + Math.sin(car.yaw) * z,
          y,
          car.z - Math.sin(car.yaw) * x + Math.cos(car.yaw) * z,
        );
        scratch.rotation.set(rx, car.yaw, 0);
        scratch.scale.set(sx, sy, sz);
        scratch.updateMatrix();
        mesh.setMatrixAt(id, scratch.matrix);
      };
      for (const mesh of carModels) put(mesh, index, 0, 0.5, 0, 1, 1, 1);
      put(fallbackBody, index, 0, 1.5, 0, 8, 2.5, 3.5);
      put(fallbackCabin, index, -0.5, 3.5, 0, 5, 2, 3.2);
      for (let i = 0; i < 4; i++) {
        put(
          wheelMesh,
          index * 4 + i,
          i < 2 ? 2.5 : -2.5,
          0.65,
          i % 2 ? 2.05 : -2.05,
          0.8,
          0.4,
          0.8,
          Math.PI / 2,
        );
        for (const mesh of wheelModels)
          put(
            mesh,
            index * 4 + i,
            i < 2 ? 2.5 : -2.5,
            -0.15,
            i % 2 ? 2.05 : -2.05,
            1,
            1,
            1,
          );
        put(
          carLights,
          index * 4 + i,
          i < 2 ? 4.05 : -4.05,
          1.8,
          i % 2 ? 1.05 : -1.05,
          0.2,
          0.5,
          0.6,
        );
        carLights.setColorAt(
          index * 4 + i,
          color
            .set(i < 2 ? '#f7edc5' : '#ed3030')
            .multiplyScalar(i < 2 ? 2 : car.stop ? 2 : 0.6),
        );
      }
    });
    for (const mesh of [
      fallbackBody,
      fallbackCabin,
      wheelMesh,
      carLights,
      ...carModels,
      ...wheelModels,
    ])
      mesh.instanceMatrix.needsUpdate = true;
    if (carLights.instanceColor) carLights.instanceColor.needsUpdate = true;
    signals.forEach((signal, index) => {
      const active = trafficSignal(traffic.time(), signal.axis);
      ['red', 'amber', 'green'].forEach((state, i) => {
        scratch.position.set(
          signal.x + Math.sin(signal.yaw) * 0.76,
          8.9 - i * 1.4,
          signal.z + Math.cos(signal.yaw) * 0.76,
        );
        scratch.rotation.set(0, signal.yaw, 0);
        scratch.scale.set(0.65, 0.65, 0.15);
        scratch.updateMatrix();
        bulbs.setMatrixAt(index * 3 + i, scratch.matrix);
        bulbs.setColorAt(
          index * 3 + i,
          color
            .set(['#ff3434', '#ffbd38', '#39ec74'][i]!)
            .multiplyScalar(state === active ? 2.5 : 0.065),
        );
      });
    });
    bulbs.instanceMatrix.needsUpdate = true;
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  };
  updateCars();
  return {
    group,
    update: (dt: number, camera: PerspectiveCamera, reduced: boolean) => {
      elapsed += dt;
      const night = theme === 2 ? 0.35 : 1;
      landMat.emissiveIntensity = 0.06 + night * 0.16;
      parkMat.emissiveIntensity = 0.1 + night * 0.26;
      water.update(reduced ? 0 : dt, night, CITY_THEMES[theme]!.fog);
      landmarks.update(reduced ? 0 : dt, night);
      if (!reduced) {
        traffic.step(dt);
        updateCars();
      }
      if (lastTreeCull < 0 || elapsed - lastTreeCull >= 0.1) {
        lastTreeCull = elapsed;
        camera.getWorldDirection(forward);
        const half =
            Math.atan(
              Math.tan((camera.fov * Math.PI) / 360) *
                Math.hypot(1, camera.aspect),
            ) + 0.35,
          minCos = Math.cos(Math.min(Math.PI, half));
        for (const pool of treePools) {
          let visible = 0;
          for (const record of pool.records) {
            view.set(
              record.x - camera.position.x,
              5 - camera.position.y,
              record.z - camera.position.z,
            );
            const distance = view.length();
            if (
              distance > 3900 ||
              (distance > 400 && view.dot(forward) < minCos * distance)
            )
              continue;
            scratch.position.set(record.x, record.y, record.z);
            scratch.rotation.set(0, record.yaw ?? 0, 0);
            scratch.scale.set(record.sx, record.sy, record.sz);
            scratch.updateMatrix();
            for (const mesh of pool.meshes)
              mesh.setMatrixAt(visible, scratch.matrix);
            visible++;
          }
          for (const mesh of pool.meshes) {
            mesh.count = visible;
            mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    },
    setTheme: (index: number) => {
      theme = index;
      colorAmbience(index);
    },
    counts: () => ({
      cars: traffic.cars.length,
      trafficLights: signals.length,
      parks: world.parkCount,
      ambientBuildings: ambience.length,
      trees: world.trees.length / 3,
      visibleTrees: treePools.reduce(
        (sum, pool) => sum + (pool.meshes[0]?.count ?? 0),
        0,
      ),
    }),
    dispose: () => {
      alive = false;
      group.traverse((object) => {
        if (object instanceof Mesh) {
          ownedGeometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            ownedMaterials.add(material);
        }
      });
      ownedGeometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
