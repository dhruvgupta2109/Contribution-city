// Git City geometry/palette adaptation. SPDX-License-Identifier: AGPL-3.0-only
// Tree/car/bench/fountain dimensions: Git City, Samuel Rizzon. See NOTICE.
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector3,
} from 'three';
import type { Material, PerspectiveCamera, BufferGeometry } from 'three';
import type { CityData } from '../data/types.ts';
import {
  createRepositoryLayout,
  createMappedRepositoryLayout,
  BLOCK_WIDTH,
  BLOCK_DEPTH,
} from './repository-layout.ts';
import { createRepositoryMaterial } from './repository-material.ts';
import { createTraffic, trafficSignal } from './traffic.ts';
import { CITY_THEMES } from './themes.ts';
import type { MapWorld } from './world-types.ts';
import { createMapEnvironment } from './map-environment.ts';

type Part = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry?: number;
  rx?: number;
  color?: string;
};
export function createRepositoryScene(
  city: CityData,
  themeIndex = 0,
  world: MapWorld | null = null,
) {
  const layout = world
      ? createMappedRepositoryLayout(city, world)
      : createRepositoryLayout(city),
    group = new Group(),
    box = new BoxGeometry(1, 1, 1),
    cylinder = new CylinderGeometry(1, 1.3, 1, 6),
    cone = new ConeGeometry(1, 1, 8),
    baseY = world ? 0 : 1.6;
  let theme = CITY_THEMES[themeIndex]!,
    progress = -1;
  const scratch = new Object3D(),
    color = new Color();
  const resources = new Set<Material>(),
    geometries = new Set<BufferGeometry>([box, cylinder, cone]),
    textures = new Set<CanvasTexture>();
  const solid = (hex: string, glow = false) => {
    const mat = glow
      ? new MeshBasicMaterial({ color: hex, toneMapped: false })
      : new MeshStandardMaterial({ color: hex, roughness: 0.85 });
    resources.add(mat);
    return mat;
  };
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
      scratch.rotation.set(part.rx ?? 0, part.ry ?? 0, 0);
      scratch.scale.set(part.sx, part.sy, part.sz);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
      color.set(part.color ?? '#ffffff');
      mesh.setColorAt(index, color);
    });
    if (!world || material === facade.material) group.add(mesh);
    return mesh;
  };
  const facade = createRepositoryMaterial(layout.buildings, theme);
  const geometry = box.clone();
  geometries.add(geometry);
  const grids = new InstancedBufferAttribute(
      new Float32Array(layout.buildings.length * 4),
      4,
    ),
    dims = new InstancedBufferAttribute(
      new Float32Array(layout.buildings.length),
      1,
    );
  const custom = new InstancedBufferAttribute(
    new Float32Array(layout.buildings.length),
    1,
  );
  layout.buildings.forEach((b, i) => {
    grids.setXYZW(i, b.columns, b.sideColumns, b.floors, i);
    dims.setX(i, 1);
  });
  geometry.setAttribute('aGrid', grids);
  geometry.setAttribute('aDim', dims);
  geometry.setAttribute('aCustom', custom);
  const buildings = batch(
    geometry,
    facade.material,
    layout.buildings.map((b) => ({
      x: b.x,
      y: b.height / 2 + baseY,
      z: b.z,
      sx: b.width,
      sy: b.height,
      sz: b.depth,
    })),
    true,
  );
  buildings.visible = layout.buildings.length > 0;
  const groundMat = solid(theme.ground),
    sidewalkMat = solid(theme.sidewalk),
    roadMat = solid('#101518'),
    markMat = solid(theme.road, true);
  const ground = new Mesh(box, groundMat);
  ground.scale.set(9000, 0.5, 9000);
  ground.position.y = -0.6;
  if (!world) group.add(ground);
  batch(box, roadMat, [
    {
      x: 0,
      y: -0.05,
      z: 0,
      sx: layout.width + 80,
      sy: 0.3,
      sz: layout.depth + 80,
    },
  ]);
  batch(
    box,
    sidewalkMat,
    layout.blocks.map((b) => ({
      x: b.x,
      y: 0.8,
      z: b.z,
      sx: BLOCK_WIDTH + 8,
      sy: 1.6,
      sz: BLOCK_DEPTH + 8,
    })),
  );
  const markings: Part[] = [];
  for (const x of layout.roadsX)
    for (let z = -layout.depth / 2 - 40; z < layout.depth / 2 + 40; z += 12)
      markings.push({ x, y: 0.14, z, sx: 1, sy: 0.06, sz: 6 });
  for (const z of layout.roadsZ)
    for (let x = -layout.width / 2 - 40; x < layout.width / 2 + 40; x += 12)
      markings.push({ x, y: 0.14, z, sx: 6, sy: 0.06, sz: 1 });
  batch(box, markMat, markings);
  const crosswalks: Part[] = [];
  for (const x of layout.roadsX)
    for (const z of layout.roadsZ)
      for (let s = -7; s <= 7; s += 3) {
        for (const sign of [-1, 1])
          crosswalks.push(
            { x: x + s, y: 0.16, z: z + sign * 15, sx: 1.5, sy: 0.06, sz: 4 },
            { x: x + sign * 15, y: 0.16, z: z + s, sx: 4, sy: 0.06, sz: 1.5 },
          );
      }
  batch(box, solid('#adb5a8'), crosswalks);
  const trunks: Part[] = [],
    canopies: Part[] = [],
    seats: Part[] = [],
    backs: Part[] = [],
    legs: Part[] = [],
    lampPoles: Part[] = [],
    lampHeads: Part[] = [];
  const grass: Part[] = [],
    paths: Part[] = [],
    fountains: Part[] = [],
    water: Part[] = [];
  const addTree = (x: number, z: number, variant: number) => {
    const trunkH = 8 + variant * 1.5,
      canopyH = 10 + variant * 2,
      canopyR = 6 + variant * 0.8;
    trunks.push({ x, y: 1.6 + trunkH / 2, z, sx: 1, sy: trunkH, sz: 1 });
    canopies.push({
      x,
      y: 1.6 + trunkH + canopyH / 2 - 1,
      z,
      sx: canopyR,
      sy: canopyH,
      sz: canopyR,
      color: ['#2d5a1e', '#1e6b2e', '#3a7a2a'][variant % 3],
    });
  };
  for (const block of layout.blocks) {
    for (const dx of [-BLOCK_WIDTH / 2 + 6, BLOCK_WIDTH / 2 - 6])
      for (const dz of [-BLOCK_DEPTH / 2 + 6, BLOCK_DEPTH / 2 - 6]) {
        lampPoles.push({
          x: block.x + dx,
          y: 10.6,
          z: block.z + dz,
          sx: 0.35,
          sy: 18,
          sz: 0.35,
        });
        lampHeads.push({
          x: block.x + dx,
          y: 20.1,
          z: block.z + dz,
          sx: 1.5,
          sy: 0.8,
          sz: 1.5,
        });
      }
    if (!block.park) continue;
    grass.push({
      x: block.x,
      y: 1.65,
      z: block.z,
      sx: BLOCK_WIDTH - 8,
      sy: 0.2,
      sz: BLOCK_DEPTH - 8,
    });
    paths.push(
      { x: block.x, y: 1.8, z: block.z, sx: BLOCK_WIDTH - 8, sy: 0.15, sz: 5 },
      { x: block.x, y: 1.8, z: block.z, sx: 5, sy: 0.15, sz: BLOCK_DEPTH - 8 },
    );
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2,
        x = block.x + Math.cos(angle) * (BLOCK_WIDTH / 2 - 17),
        z = block.z + Math.sin(angle) * (BLOCK_DEPTH / 2 - 17);
      addTree(x, z, i % 3);
    }
    for (const dx of [-22, 22])
      for (const dz of [-20, 20]) {
        seats.push({
          x: block.x + dx,
          y: 2.5,
          z: block.z + dz,
          sx: 5,
          sy: 0.3,
          sz: 1.5,
        });
        backs.push({
          x: block.x + dx,
          y: 3.3,
          z: block.z + dz - 0.65,
          sx: 5,
          sy: 1.3,
          sz: 0.2,
        });
        for (const lx of [-2, 2])
          legs.push({
            x: block.x + dx + lx,
            y: 2.05,
            z: block.z + dz,
            sx: 0.3,
            sy: 0.9,
            sz: 1.2,
          });
      }
    fountains.push(
      { x: block.x, y: 2.8, z: block.z, sx: 8, sy: 2.4, sz: 8 },
      { x: block.x, y: 5, z: block.z, sx: 5, sy: 2, sz: 5 },
      { x: block.x, y: 7.2, z: block.z, sx: 2.5, sy: 2, sz: 2.5 },
    );
    water.push({ x: block.x, y: 8.8, z: block.z, sx: 1.8, sy: 1.2, sz: 1.8 });
  }
  batch(box, solid('#213f26'), grass);
  batch(box, solid('#798374'), paths);
  batch(cylinder, solid('#5a3a1e'), trunks);
  batch(cone, solid('#ffffff'), canopies);
  batch(box, solid('#6b4226'), seats);
  batch(box, solid('#6b4226'), backs);
  batch(box, solid('#3a3a3a'), legs);
  batch(cylinder, solid('#4a4a4a'), lampPoles);
  batch(box, solid('#f0d870', true), lampHeads);
  batch(cylinder, solid('#808080'), fountains);
  batch(cylinder, solid('#4090d0', true), water);
  const traffic = createTraffic(layout),
    carMat = solid('#ffffff'),
    darkMat = solid('#172028');
  const carBodies = batch(
    box,
    carMat,
    traffic.cars.map((c) => ({
      x: c.x,
      y: 1.5,
      z: c.z,
      sx: 8,
      sy: 2.5,
      sz: 3.5,
      color: c.color,
    })),
    true,
  );
  const carCabins = batch(
    box,
    darkMat,
    traffic.cars.map((c) => ({
      x: c.x,
      y: 3.1,
      z: c.z,
      sx: 5,
      sy: 2,
      sz: 3.2,
    })),
    true,
  );
  const carWheels = batch(
    cylinder,
    solid('#101013'),
    Array.from({ length: traffic.cars.length * 4 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      sx: 0.8,
      sy: 0.4,
      sz: 0.8,
    })),
    true,
  );
  const carLights = batch(
    box,
    solid('#ffffff', true),
    Array.from({ length: traffic.cars.length * 4 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      sx: 0.2,
      sy: 0.5,
      sz: 0.6,
    })),
    true,
  );
  const signalRecords: {
      x: number;
      z: number;
      axis: 'x' | 'z';
      yaw: number;
    }[] = [],
    signalPoles: Part[] = [],
    signalHousing: Part[] = [];
  for (const x of layout.roadsX)
    for (const z of layout.roadsZ)
      for (const axis of ['x', 'z'] as const)
        for (const sign of [-1, 1]) {
          const px = x + (axis === 'x' ? sign * 13 : sign * 11),
            pz = z + (axis === 'z' ? sign * 13 : -sign * 11),
            yaw =
              axis === 'x' ? (sign * Math.PI) / 2 : sign === 1 ? 0 : Math.PI;
          signalRecords.push({ x: px, z: pz, axis, yaw });
          signalPoles.push({ x: px, y: 3.2, z: pz, sx: 0.3, sy: 6.4, sz: 0.3 });
          signalHousing.push({
            x: px,
            y: 7.5,
            z: pz,
            sx: 1.8,
            sy: 4.6,
            sz: 1.4,
            ry: yaw,
          });
        }
  batch(cylinder, solid('#494e4b'), signalPoles);
  batch(box, solid('#161b18'), signalHousing);
  const signalLights = batch(
    box,
    solid('#ffffff', true),
    Array.from({ length: signalRecords.length * 3 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      sx: 0.65,
      sy: 0.65,
      sz: 0.1,
    })),
    true,
  );
  const outline = new LineSegments(
    new EdgesGeometry(box),
    new LineBasicMaterial({
      color: theme.accent,
      transparent: true,
      opacity: 0.9,
    }),
  );
  geometries.add(outline.geometry);
  resources.add(outline.material);
  outline.visible = false;
  group.add(outline);
  const labels: (Sprite | null)[] = [],
    labelView = new Vector3();
  if (typeof document !== 'undefined')
    for (const b of layout.buildings) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 64;
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        /* Facades do not depend on label graphics. */
      }
      if (!ctx) {
        labels.push(null);
        continue;
      }
      ctx.fillStyle = '#edf1db';
      ctx.font = '26px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, 256, 42, 500);
      const texture = new CanvasTexture(canvas);
      textures.add(texture);
      const material = new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        fog: true,
      });
      resources.add(material);
      const sprite = new Sprite(material);
      sprite.position.set(b.x, b.height + 12, b.z);
      sprite.scale.set(60, 7.5, 1);
      group.add(sprite);
      labels.push(sprite);
    }
  const updateTraffic = () => {
    traffic.cars.forEach((c, i) => {
      const place = (
        mesh: InstancedMesh,
        index: number,
        lx: number,
        y: number,
        lz: number,
        sx: number,
        sy: number,
        sz: number,
        rx = 0,
      ) => {
        scratch.position.set(
          c.x + Math.cos(c.yaw) * lx + Math.sin(c.yaw) * lz,
          y,
          c.z - Math.sin(c.yaw) * lx + Math.cos(c.yaw) * lz,
        );
        scratch.rotation.set(rx, c.yaw, 0);
        scratch.scale.set(sx, sy, sz);
        scratch.updateMatrix();
        mesh.setMatrixAt(index, scratch.matrix);
      };
      place(carBodies, i, 0, 1.5, 0, 8, 2.5, 3.5);
      place(carCabins, i, -0.5, 3.5, 0, 5, 2, 3.2);
      for (let wheel = 0; wheel < 4; wheel++)
        place(
          carWheels,
          i * 4 + wheel,
          wheel < 2 ? 2.5 : -2.5,
          0.8,
          wheel % 2 ? 1.8 : -1.8,
          0.8,
          0.4,
          0.8,
          Math.PI / 2,
        );
      for (let lamp = 0; lamp < 4; lamp++) {
        place(
          carLights,
          i * 4 + lamp,
          lamp < 2 ? 4.05 : -4.05,
          1.8,
          lamp % 2 ? 1.05 : -1.05,
          0.2,
          0.5,
          0.6,
        );
        color
          .set(lamp < 2 ? '#f7edc5' : '#ed3030')
          .multiplyScalar(lamp < 2 ? 2 : c.stop ? 2 : 0.6);
        carLights.setColorAt(i * 4 + lamp, color);
      }
    });
    for (const mesh of [carBodies, carCabins, carWheels, carLights])
      mesh.instanceMatrix.needsUpdate = true;
    if (carLights.instanceColor) carLights.instanceColor.needsUpdate = true;
    signalRecords.forEach((s, index) => {
      const active = trafficSignal(traffic.time(), s.axis);
      ['red', 'amber', 'green'].forEach((signal, slot) => {
        scratch.position.set(
          s.x + Math.sin(s.yaw) * 0.76,
          8.9 - slot * 1.4,
          s.z + Math.cos(s.yaw) * 0.76,
        );
        scratch.rotation.set(0, s.yaw, 0);
        scratch.scale.set(0.65, 0.65, 0.15);
        scratch.updateMatrix();
        signalLights.setMatrixAt(index * 3 + slot, scratch.matrix);
        color
          .set(['#ff3434', '#ffbd38', '#39ec74'][slot]!)
          .multiplyScalar(signal === active ? 2.5 : 0.065);
        signalLights.setColorAt(index * 3 + slot, color);
      });
    });
    signalLights.instanceMatrix.needsUpdate = true;
    if (signalLights.instanceColor)
      signalLights.instanceColor.needsUpdate = true;
  };
  const highlight = (index: number | null) => {
    const b = index === null ? null : layout.buildings[index];
    outline.visible = !!b;
    if (b) {
      outline.position.set(b.x, b.height / 2 + baseY, b.z);
      outline.scale.set(b.width + 0.8, b.height + 0.8, b.depth + 0.8);
    }
  };
  updateTraffic();
  const environment = world
    ? createMapEnvironment(world, themeIndex, layout.buildings)
    : null;
  if (environment) group.add(environment.group);
  return {
    group,
    buildings,
    layout: { ...layout, width: layout.width + 80, depth: layout.depth + 80 },
    flightRadius: world?.radius,
    update: (
      rise: number,
      camera: PerspectiveCamera,
      heightPixels: number,
      dt = 0,
      reduced = false,
    ) => {
      if (!reduced) {
        traffic.step(dt);
        updateTraffic();
      }
      environment?.update(dt, camera, reduced);
      if (Math.abs(progress - rise) > 0.00001) {
        progress = rise;
        layout.buildings.forEach((b, i) => {
          const t = Math.max(
              0,
              Math.min(
                1,
                (rise - (i / Math.max(1, layout.buildings.length)) * 0.18) /
                  0.82,
              ),
            ),
            height = Math.max(0.05, b.height * (1 - (1 - t) ** 3));
          scratch.position.set(b.x, height / 2 + baseY, b.z);
          scratch.rotation.set(0, 0, 0);
          scratch.scale.set(b.width, height, b.depth);
          scratch.updateMatrix();
          buildings.setMatrixAt(i, scratch.matrix);
          if (labels[i]) labels[i]!.position.y = height + 12;
        });
        buildings.instanceMatrix.needsUpdate = true;
        buildings.boundingSphere = null;
        buildings.boundingBox = null;
      }
      const visible: { label: Sprite; depth: number }[] = [];
      for (const label of labels) {
        if (!label) continue;
        label.visible = false;
        labelView.copy(label.position).applyMatrix4(camera.matrixWorldInverse);
        const depth = -labelView.z;
        if (
          depth <= 0 ||
          (7.5 * heightPixels) /
            (2 * Math.tan((camera.fov * Math.PI) / 360) * depth) <
            16
        )
          continue;
        labelView.copy(label.position).project(camera);
        if (Math.abs(labelView.x) <= 1.1 && Math.abs(labelView.y) <= 1.1)
          visible.push({ label, depth });
      }
      visible
        .sort((a, b) => a.depth - b.depth)
        .slice(0, 24)
        .forEach((entry) => {
          entry.label.visible = true;
        });
    },
    highlight,
    setFilter: (id: string | null) => {
      layout.buildings.forEach((b, i) =>
        dims.setX(i, !id || id === b.id ? 1 : 0.15),
      );
      dims.needsUpdate = true;
    },
    setColor: (id: string, hex: string) => {
      const b = layout.buildings.find((b) => b.id === id);
      if (b) {
        buildings.setColorAt(b.index, new Color(hex));
        custom.setX(b.index, 1);
        custom.needsUpdate = true;
        if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
      }
    },
    setTheme: (index: number) => {
      theme = CITY_THEMES[index]!;
      facade.setTheme(theme);
      (groundMat as MeshStandardMaterial).color.set(theme.ground);
      (sidewalkMat as MeshStandardMaterial).color.set(theme.sidewalk);
      (markMat as MeshBasicMaterial).color.set(theme.road);
      outline.material.color.set(theme.accent);
      environment?.setTheme(index);
    },
    counts: () => ({
      buildings: layout.buildings.length,
      cars: traffic.cars.length,
      trafficLights: signalRecords.length,
      parks: layout.blocks.filter((b) => b.park).length,
      trees: trunks.length,
      visibleLabels: labels.filter((label) => label?.visible).length,
      ...environment?.counts(),
    }),
    dispose: () => {
      facade.dispose();
      environment?.dispose();
      geometries.forEach((g) => g.dispose());
      resources.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      group.clear();
    },
  };
}
export type RepositoryScene = ReturnType<typeof createRepositoryScene>;
