import { describe, expect, it } from 'vitest';
import { generateDemoCity } from '../data/demo.ts';
import { parseDateKey } from '../data/dates.ts';
import { BUILDING_WIDTH, FLOOR_HEIGHT, SLAB_HEIGHT, STREET_WIDTH, CELL_SIZE, createCityLayout, buildingHeight, weekX, weekdayZ } from './layout.ts';
import { createCityScene, isWindowLit } from './city-scene.ts';
import { Color, Matrix4, PerspectiveCamera, Vector3 } from 'three';

describe('calendar geometry', () => {
  it('places exactly one building for each date with UTC weekday alignment', () => {
    const city = generateDemoCity(); const layout = createCityLayout(city);
    expect(layout.buildings).toHaveLength(365);
    expect(layout.buildings[0]!.weekday).toBe(2);
    for (const building of layout.buildings) {
      expect(building.weekday).toBe(parseDateKey(building.day.date).getUTCDay());
      expect(building.height).toBe(SLAB_HEIGHT + building.day.contributionCount * FLOOR_HEIGHT);
    }
    expect(new Set(layout.buildings.map((building) => `${building.x},${building.z}`)).size).toBe(365);
  });
  it('leaves four-week streets and an avenue between Wednesday and Thursday', () => {
    expect(weekX(4) - weekX(3)).toBeCloseTo(CELL_SIZE + STREET_WIDTH);
    expect(weekX(3) - weekX(2)).toBeCloseTo(CELL_SIZE);
    expect(weekdayZ(4) - weekdayZ(3)).toBeCloseTo(CELL_SIZE + STREET_WIDTH);
    expect(weekdayZ(3) - weekdayZ(2)).toBeCloseTo(CELL_SIZE);
    expect(STREET_WIDTH / CELL_SIZE).toBeCloseTo(1.1);
  });
  it('keeps exact linear heights, including extreme contributions and quiet slabs', () => {
    expect(buildingHeight(0)).toBe(SLAB_HEIGHT);
    expect(buildingHeight(20) - SLAB_HEIGHT).toBeCloseTo(2 * (buildingHeight(10) - SLAB_HEIGHT));
    expect(buildingHeight(100_000)).toBe(SLAB_HEIGHT + 100_000 * FLOOR_HEIGHT);
  });
});

describe('instanced city', () => {
  it('allocates 365 buildings and twelve windows per ordinary contribution floor', () => {
    const city = generateDemoCity(); const scene = createCityScene(city);
    expect(scene.counts().buildings).toBe(365);
    expect(scene.counts().windows).toBe(city.metadata.totalContributions * 12);
    const camera = new PerspectiveCamera(42, 1.6, .05, 1000); camera.position.set(0, 28, 50); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    scene.update(1, camera, 800);
    const matrix = new Matrix4(); const position = new Vector3(); const scale = new Vector3();
    for (const building of scene.layout.buildings) {
      scene.buildings.getMatrixAt(building.index, matrix); position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
      expect(position.x).toBeCloseTo(building.x, 4); expect(position.z).toBeCloseTo(building.z, 4);
      expect(scale.x).toBeCloseTo(BUILDING_WIDTH); expect(scale.y).toBeCloseTo(building.height, 4);
    }
    scene.dispose();
  });
  it('switches detail with distance without changing building heights and restores it', () => {
    const scene = createCityScene(generateDemoCity());
    const camera = new PerspectiveCamera(42, 1.6, .05, 10000);
    camera.position.set(0, 500, 1000); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); scene.update(1, camera, 600);
    expect(scene.counts().detailedBuildings).toBe(0);
    const far = scene.buildings.instanceMatrix.array.slice();
    camera.position.set(0, 4, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); scene.update(1, camera, 600);
    expect(scene.counts().detailedBuildings).toBeGreaterThan(0);
    expect(scene.buildings.instanceMatrix.array).toEqual(far);
    scene.dispose();
  });
  it('dims buildings lacking the selected repo and restores colors when cleared', () => {
    const city = generateDemoCity(); const scene = createCityScene(city); const repo = city.repositories[0]!;
    scene.setFilter(repo.id); const color = new Color();
    for (const building of scene.layout.buildings) {
      const hasRepo = building.day.segments.some((segment) => segment.kind === 'repository' && segment.repoId === repo.id);
      scene.buildings.getColorAt(building.index, color);
      expect(color.getHexString()).toBe(hasRepo ? 'ffffff' : '464d67');
    }
    scene.setColor(repo.id, '#f00000'); scene.setFilter(null);
    scene.buildings.getColorAt(0, color); expect(color.getHexString()).toBe('ffffff'); scene.dispose();
  });
  it('bounds window allocations for extreme activity while preserving the exact height', () => {
    const city = generateDemoCity(); city.days[0] = { ...city.days[0]!, contributionCount: 100_000, segments: [{ kind: 'other', count: 100_000 }] };
    const scene = createCityScene(city); expect(scene.layout.buildings[0]!.height).toBe(buildingHeight(100_000));
    expect(scene.counts().windows).toBeLessThanOrEqual(180_000); expect(scene.counts().bands).toBeGreaterThan(0);
    expect(scene.counts().virtualWindowBuildings).toBeGreaterThan(0);
    const virtualBand = scene.group.children.find((object) => 'geometry' in object && object.geometry && typeof object.geometry === 'object' && 'getAttribute' in object.geometry && typeof object.geometry.getAttribute === 'function' && object.geometry.getAttribute('ccBandInfo'));
    expect(virtualBand).toBeDefined(); scene.dispose();
  });
  it('keeps dark windows deterministic and close to twelve percent', () => {
    let lit = 0;
    for (let floor = 0; floor < 1000; floor++) for (let face = 0; face < 4; face++) for (let column = 0; column < 3; column++) {
      expect(isWindowLit(42, floor, face, column)).toBe(isWindowLit(42, floor, face, column));
      if (isWindowLit(42, floor, face, column)) lit++;
    }
    expect(1 - lit / 12000).toBeGreaterThan(.10); expect(1 - lit / 12000).toBeLessThan(.14);
  });
});
