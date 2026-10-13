import {
  BoxGeometry, Color, EdgesGeometry, Group, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera,
  PlaneGeometry, ShaderMaterial, Vector3,
} from 'three';
import { OTHER_ACTIVITY_COLOR } from '../data/demo.ts';
import type { CityData, DaySegment } from '../data/types.ts';
import {
  BUILDING_WIDTH, CELL_SIZE, FLOOR_HEIGHT, SLAB_HEIGHT,
  createCityLayout, weekdayZ, weekX,
} from './layout.ts';
import type { CityLayout } from './layout.ts';
import { createBandMaterial } from './band-material.ts';

export const OTHER_ID = '__other__';
const MAX_WINDOWS = 180_000;

export function segmentId(segment: DaySegment): string {
  return segment.kind === 'other' ? OTHER_ID : segment.repoId;
}

/** Stable integer hash; about 12% of windows stay dark across rebuilds. */
export function isWindowLit(day: number, floor: number, face: number, column: number): boolean {
  let hash = Math.imul(day + 1, 73856093) ^ Math.imul(floor + 1, 19349663)
    ^ Math.imul(face + 1, 83492791) ^ Math.imul(column + 1, 2654435761);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296 >= 0.12;
}

interface WindowInstance { building: number; floor: number; id: string; lit: boolean; face: number; column: number }
interface BandInstance { building: number; id: string; bottom: number; count: number }

export interface CityScene {
  group: Group;
  layout: CityLayout;
  buildings: InstancedMesh;
  update: (progress: number, camera: PerspectiveCamera, viewportHeight: number) => void;
  setFilter: (id: string | null) => void;
  setColor: (id: string, color: string) => void;
  highlight: (index: number | null) => void;
  dispose: () => void;
  counts: () => { buildings: number; windows: number; bands: number; detailedBuildings: number; virtualWindowBuildings: number };
}

export function createSky(): Mesh {
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=vec4(position.xy,0.999,1.0);}`,
    fragmentShader: `precision highp float;
      varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 low=vec3(0.22,0.19,0.28), high=vec3(0.028,0.046,0.105);
        vec3 sky=mix(low,high,smoothstep(0.0,0.93,vUv.y));
        vec2 grid=vUv*vec2(73.,43.);vec2 cell=floor(grid);
        vec2 offset=vec2(hash(cell),hash(cell+91.));
        float star=(1.-smoothstep(0.025,0.055,length(fract(grid)-offset)));
        star*=step(0.975,hash(cell+27.))*smoothstep(0.35,0.85,vUv.y);
        gl_FragColor=vec4(sky+star*vec3(0.65,0.70,0.85),1.);
      }`,
  });
  const sky = new Mesh(new PlaneGeometry(2, 2), material);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  return sky;
}

export function createCityScene(city: CityData): CityScene {
  const layout = createCityLayout(city);
  const group = new Group();
  const colors = new Map(city.repositories.map((repo) => [repo.id, repo.color]));
  colors.set(OTHER_ID, OTHER_ACTIVITY_COLOR);
  const box = new BoxGeometry(1, 1, 1);
  const scratch = new Object3D();
  const scratchColor = new Color();
  const bodyMaterials = ['#1c2856', '#273464', '#3a4773', '#131d3f', '#1f2b5e', '#192448']
    .map((color) => new MeshBasicMaterial({ color }));
  const buildings = new InstancedMesh(box, bodyMaterials, layout.buildings.length);
  buildings.instanceMatrix.setUsage(35048); // DynamicDrawUsage
  buildings.frustumCulled = false;
  group.add(buildings);

  const asphalt = new Mesh(box, new MeshBasicMaterial({ color: '#101622' }));
  asphalt.position.y = -0.13;
  asphalt.scale.set(layout.width, 0.2, layout.depth);
  group.add(asphalt);

  const lotTransforms: [number, number, number, number][] = [];
  for (let start = 0; start < layout.weeks; start += 4) {
    const end = Math.min(layout.weeks - 1, start + 3);
    const width = weekX(end) - weekX(start) + CELL_SIZE;
    const x = (weekX(start) + weekX(end)) / 2 - layout.centerX;
    lotTransforms.push([x, (weekdayZ(0) + weekdayZ(3)) / 2 - layout.centerZ, width, CELL_SIZE * 4]);
    lotTransforms.push([x, (weekdayZ(4) + weekdayZ(6)) / 2 - layout.centerZ, width, CELL_SIZE * 3]);
  }
  const lots = new InstancedMesh(box, new MeshBasicMaterial({ color: '#263044' }), lotTransforms.length);
  lotTransforms.forEach(([x, z, width, depth], index) => {
    scratch.position.set(x, -0.005, z);
    scratch.scale.set(width, 0.045, depth);
    scratch.updateMatrix();
    lots.setMatrixAt(index, scratch.matrix);
  });
  group.add(lots);

  const dashes: [number, number, number, number][] = [];
  const avenueZ = (weekdayZ(3) + weekdayZ(4)) / 2 - layout.centerZ;
  for (let x = -layout.width / 2 + 0.4; x < layout.width / 2; x += 0.85) dashes.push([x, avenueZ, 0.42, 0.038]);
  for (let week = 4; week < layout.weeks; week += 4) {
    const x = (weekX(week - 1) + weekX(week)) / 2 - layout.centerX;
    for (let z = -layout.depth / 2 + 0.3; z < layout.depth / 2; z += 0.85) dashes.push([x, z, 0.038, 0.42]);
  }
  const markings = new InstancedMesh(box, new MeshBasicMaterial({ color: '#a38a53' }), dashes.length);
  scratch.rotation.set(0, 0, 0);
  dashes.forEach(([x, z, width, depth], index) => {
    scratch.position.set(x, -0.02, z);
    scratch.scale.set(width, 0.012, depth);
    scratch.updateMatrix();
    markings.setMatrixAt(index, scratch.matrix);
  });
  group.add(markings);

  const windowRecords: WindowInstance[] = [];
  const bandRecords: BandInstance[] = [];
  const detailEligible = new Set<number>();
  for (const building of layout.buildings) {
    const count = building.day.contributionCount;
    const canDetail = windowRecords.length + count * 12 <= MAX_WINDOWS;
    if (canDetail && count > 0) detailEligible.add(building.index);
    let floor = 0;
    for (const segment of building.day.segments) {
      const id = segmentId(segment);
      bandRecords.push({ building: building.index, id, bottom: floor, count: segment.count });
      if (canDetail) {
        for (let offset = 0; offset < segment.count; offset += 1) {
          for (let face = 0; face < 4; face += 1) {
            for (let column = 0; column < 3; column += 1) {
              windowRecords.push({ building: building.index, floor: floor + offset, id, face, column,
                lit: isWindowLit(building.index, floor + offset, face, column) });
            }
          }
        }
      }
      floor += segment.count;
    }
  }

  const windowMesh = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), windowRecords.length);
  const bandGeometry = box.clone();
  const bandInfo = new InstancedBufferAttribute(new Float32Array(bandRecords.length * 4), 4);
  const bandState = new InstancedBufferAttribute(new Float32Array(bandRecords.length * 2), 2);
  bandState.setUsage(35048);
  bandRecords.forEach((band, index) => bandInfo.setXYZW(index, band.bottom, band.count, band.building, detailEligible.has(band.building) ? 0 : 1));
  bandGeometry.setAttribute('ccBandInfo', bandInfo);
  bandGeometry.setAttribute('ccBandState', bandState);
  const bandMaterial = createBandMaterial();
  const bands = new InstancedMesh(bandGeometry, bandMaterial.material, bandRecords.length);
  const roofs = new InstancedMesh(box, new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), layout.buildings.length);
  for (const mesh of [windowMesh, bands, roofs]) {
    mesh.instanceMatrix.setUsage(35048);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  const outline = new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }));
  outline.visible = false;
  outline.renderOrder = 5;
  group.add(outline);

  let filter: string | null = null;
  let highlightIndex: number | null = null;
  let progress = -1;
  let dirty = true;
  const detailed = new Set<number>();
  const changedLod = new Set<number>();
  const heights = new Float64Array(layout.buildings.length);
  const world = new Vector3();
  const view = new Vector3();

  const recolor = () => {
    for (const building of layout.buildings) {
      const contains = !filter || building.day.segments.some((segment) => segmentId(segment) === filter);
      scratchColor.set(contains ? '#ffffff' : '#464d67');
      buildings.setColorAt(building.index, scratchColor);
      const top = building.day.segments.at(-1);
      const id = top ? segmentId(top) : null;
      scratchColor.set(id && (!filter || id === filter) ? colors.get(id)! : '#35405e');
      roofs.setColorAt(building.index, scratchColor);
    }
    windowRecords.forEach((window, index) => {
      const lit = window.lit && (!filter || filter === window.id);
      scratchColor.set(lit ? colors.get(window.id)! : '#10192f');
      windowMesh.setColorAt(index, scratchColor);
    });
    bandRecords.forEach((band, index) => {
      const selected = !filter || filter === band.id;
      const contains = !filter || layout.buildings[band.building]!.day.segments.some((segment) => segmentId(segment) === filter);
      bandState.setXY(index, selected ? 1 : 0, contains ? 1 : 0);
      scratchColor.set(colors.get(band.id)!);
      scratchColor.multiplyScalar(!filter || filter === band.id ? 0.48 : 0.095);
      bands.setColorAt(index, scratchColor);
    });
    bandState.needsUpdate = true;
    for (const mesh of [buildings, windowMesh, bands, roofs]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  recolor();

  const update = (rise: number, camera: PerspectiveCamera, viewportHeight: number) => {
    bandMaterial.update(camera, viewportHeight);
    let lodChanged = false;
    changedLod.clear();
    for (const building of layout.buildings) {
      world.set(building.x, building.height / 2, building.z);
      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      const floorPixels = FLOOR_HEIGHT * viewportHeight / (2 * Math.tan(camera.fov * Math.PI / 360) * Math.max(0.01, -view.z));
      const hadDetail = detailed.has(building.index);
      // Hysteresis avoids flicker near the threshold while easing the camera.
      const shouldDetail = detailEligible.has(building.index) && floorPixels > (hadDetail ? 2.0 : 2.7);
      if (hadDetail !== shouldDetail) {
        lodChanged = true;
        changedLod.add(building.index);
        if (shouldDetail) detailed.add(building.index); else detailed.delete(building.index);
      }
    }
    if (!dirty && Math.abs(progress - rise) < 0.00001 && !lodChanged) return;
    const rebuildAll = dirty || Math.abs(progress - rise) >= 0.00001;
    progress = rise;
    dirty = false;
    scratch.rotation.set(0, 0, 0);
    for (const building of layout.buildings) {
      if (!rebuildAll) continue;
      const stagger = building.index / Math.max(1, layout.buildings.length - 1) * 0.18;
      const t = Math.max(0, Math.min(1, (rise - stagger) / (1 - stagger)));
      const eased = 1 - (1 - t) ** 3;
      const height = SLAB_HEIGHT + (building.height - SLAB_HEIGHT) * eased;
      heights[building.index] = height;
      scratch.position.set(building.x, height / 2 + 0.018, building.z);
      scratch.scale.set(BUILDING_WIDTH, height, BUILDING_WIDTH);
      scratch.updateMatrix();
      buildings.setMatrixAt(building.index, scratch.matrix);
      scratch.position.y = height + 0.026;
      scratch.scale.set(building.day.contributionCount > 0 ? 0.2 : 0, 0.025, building.day.contributionCount > 0 ? 0.2 : 0);
      scratch.updateMatrix();
      roofs.setMatrixAt(building.index, scratch.matrix);
    }
    bandRecords.forEach((band, index) => {
      if (!rebuildAll && !changedLod.has(band.building)) return;
      const building = layout.buildings[band.building]!;
      const factor = (heights[band.building]! - SLAB_HEIGHT) / Math.max(FLOOR_HEIGHT, building.height - SLAB_HEIGHT);
      scratch.position.set(building.x, SLAB_HEIGHT + 0.018 + (band.bottom + band.count / 2) * FLOOR_HEIGHT * factor, building.z);
      const visible = !detailed.has(band.building) || !detailEligible.has(band.building);
      scratch.scale.set(visible ? BUILDING_WIDTH + 0.008 : 0, band.count * FLOOR_HEIGHT * factor, visible ? BUILDING_WIDTH + 0.008 : 0);
      scratch.updateMatrix();
      bands.setMatrixAt(index, scratch.matrix);
    });
    windowRecords.forEach((window, index) => {
      if (!rebuildAll && !changedLod.has(window.building)) return;
      const building = layout.buildings[window.building]!;
      const factor = (heights[window.building]! - SLAB_HEIGHT) / Math.max(FLOOR_HEIGHT, building.height - SLAB_HEIGHT);
      const coordinate = (window.column - 1) * 0.225;
      const edge = BUILDING_WIDTH / 2 + 0.006;
      scratch.rotation.set(0, window.face * Math.PI / 2, 0);
      scratch.position.set(
        building.x + (window.face === 1 ? edge : window.face === 3 ? -edge : coordinate * (window.face === 2 ? -1 : 1)),
        SLAB_HEIGHT + 0.018 + (window.floor + 0.5) * FLOOR_HEIGHT * factor,
        building.z + (window.face === 0 ? edge : window.face === 2 ? -edge : coordinate * (window.face === 1 ? -1 : 1)),
      );
      const visible = detailed.has(window.building);
      scratch.scale.set(visible ? 0.115 : 0, visible ? 0.105 * factor : 0, 1);
      scratch.updateMatrix();
      windowMesh.setMatrixAt(index, scratch.matrix);
    });
    for (const mesh of [windowMesh, bands]) mesh.instanceMatrix.needsUpdate = true;
    if (rebuildAll) {
      buildings.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true;
      buildings.boundingSphere = null; buildings.boundingBox = null;
    }
    if (highlightIndex !== null) {
      const building = layout.buildings[highlightIndex]!;
      outline.position.set(building.x, heights[highlightIndex]! / 2 + 0.018, building.z);
      outline.scale.set(BUILDING_WIDTH + 0.025, heights[highlightIndex]! + 0.02, BUILDING_WIDTH + 0.025);
    }
  };

  return {
    group, layout, buildings, update,
    setFilter: (id) => { filter = id; recolor(); },
    setColor: (id, color) => { colors.set(id, color); recolor(); },
    highlight: (index) => {
      if (highlightIndex === index) return;
      highlightIndex = index; outline.visible = index !== null;
      if (index !== null) {
        const building = layout.buildings[index]!;
        outline.position.set(building.x, heights[index]! / 2 + 0.018, building.z);
        outline.scale.set(BUILDING_WIDTH + 0.025, heights[index]! + 0.02, BUILDING_WIDTH + 0.025);
      }
    },
    dispose: () => {
      const geometries = new Set<BoxGeometry | PlaneGeometry | EdgesGeometry>();
      const materials = new Set<MeshBasicMaterial | LineBasicMaterial>();
      group.traverse((object) => {
        if (object instanceof Mesh || object instanceof LineSegments) {
          geometries.add(object.geometry as BoxGeometry);
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => materials.add(material as MeshBasicMaterial));
          if (object instanceof InstancedMesh) object.dispose();
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.clear();
    },
    counts: () => ({ buildings: layout.buildings.length, windows: windowRecords.length, bands: bandRecords.length, detailedBuildings: detailed.size,
      virtualWindowBuildings: layout.buildings.filter((building) => building.day.contributionCount > 0 && !detailEligible.has(building.index)).length }),
  };
}
