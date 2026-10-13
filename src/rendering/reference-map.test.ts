import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDemoCity } from '../data/demo.ts';
import { buildMapWorld } from './world-build.ts';
import type { MapAsset, MapWorld } from './world-types.ts';
import { createMappedRepositoryLayout } from './repository-layout.ts';
import { createMapTraffic } from './map-traffic.ts';
import { createUrbanBackfill } from './urban-backfill.ts';

let world: MapWorld;
beforeAll(() => {
  const read = (name: string) =>
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(`../../public/maps/${name}.json.gz`, import.meta.url),
        ),
      ).toString(),
    ) as MapAsset;
  world = buildMapWorld(read('bay'), read('sf'));
});
describe('actual Git City map', () => {
  it('prepares finite map geometry, model locations, and connected ambient traffic', () => {
    expect(world.lots.length / 2).toBe(25_000);
    expect(world.parkCount).toBe(1017);
    expect(world.trees.length / 3).toBe(11001);
    for (const array of Object.values(world.arrays)) {
      expect(array.length % 9).toBe(0);
      expect(array.every(Number.isFinite)).toBe(true);
    }
    const traffic = createMapTraffic(world);
    expect(traffic.cars.length).toBeGreaterThan(80);
    expect(traffic.intersections.length).toBeGreaterThan(3);
    for (let frame = 0; frame < 600; frame++) traffic.step(1 / 60);
    expect(
      traffic.cars.every((car) => Number.isFinite(car.x + car.z + car.yaw)),
    ).toBe(true);
  });
  it('fits the complete 500-project catalog without overlaps and preserves commit data', () => {
    const city = generateDemoCity(),
      template = city.repositories[0]!;
    city.repositoryCatalog = Array.from({ length: 500 }, (_, i) => ({
      ...template,
      id: `test/repo-${i}`,
      name: `repo-${i}`,
    }));
    const layout = createMappedRepositoryLayout(city, world);
    expect(layout.buildings).toHaveLength(501);
    for (const a of layout.buildings) {
      expect(Math.hypot(a.x, a.z)).toBeGreaterThan(340);
      expect(a.height).toBeGreaterThanOrEqual(10);
      expect(a.height).toBeLessThanOrEqual(360);
      expect(a.dailyCounts.reduce((sum, n) => sum + n, 0)).toBe(a.commits);
      for (const b of layout.buildings)
        if (a !== b) {
          expect(
            Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
              Math.abs(a.z - b.z) >= (a.depth + b.depth) / 2,
          ).toBe(true);
        }
    }
  });
  it('fills unused map footprints with neutral scenery while leaving repository lots clear', () => {
    const layout = createMappedRepositoryLayout(generateDemoCity(), world),
      blocks = createUrbanBackfill(world, layout.buildings);
    expect(blocks.length).toBeGreaterThan(5500);
    expect(blocks.length).toBeLessThanOrEqual(6500);
    expect(createUrbanBackfill(world, layout.buildings)).toEqual(blocks);
    for (const block of blocks) {
      expect(block.height).toBeLessThanOrEqual(65);
      for (const repo of layout.buildings)
        expect(
          Math.abs(block.x - repo.x) >= (block.width + repo.width) / 2 ||
            Math.abs(block.z - repo.z) >= (block.depth + repo.depth) / 2,
        ).toBe(true);
    }
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]!,
          b = blocks[j]!;
        expect(
          Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
            Math.abs(a.z - b.z) >= (a.depth + b.depth) / 2,
        ).toBe(true);
      }
  });
});
describe('map traffic signals', () => {
  const crossing = () =>
    ({
      routes: [
        { class: 1, points: Float32Array.from([-200, 0, 0, 0, 200, 0]) },
        { class: 1, points: Float32Array.from([0, -200, 0, 0, 0, 200]) },
      ],
    }) as MapWorld;
  it('stops on red before a crossing, then resumes on green', () => {
    const traffic = createMapTraffic(crossing()),
      car = traffic.cars.find((c) => c.route === 1 && c.direction === 1)!;
    car.progress = 178;
    for (let i = 0; i < 300; i++) traffic.step(1 / 60);
    expect(car.progress).toBeCloseTo(181, 6);
    expect(car.stop).toBe(true);
    for (let i = 0; i < 420; i++) traffic.step(1 / 60);
    expect(car.progress).toBeGreaterThan(181);
  });
  it('replays identically and turns at endpoints without teleporting between lanes', () => {
    const a = createMapTraffic(crossing()),
      b = createMapTraffic(crossing());
    a.cars[0]!.progress = b.cars[0]!.progress = 398;
    a.step(1 / 120);
    b.step(1 / 120);
    for (let i = 0; i < 1200; i++) {
      const car = a.cars[0]!,
        x = car.x,
        z = car.z;
      a.step(1 / 120);
      expect(Math.hypot(car.x - x, car.z - z)).toBeLessThan(0.14);
    }
    for (let i = 0; i < 600; i++) b.step(1 / 60);
    a.cars.forEach((car, index) => {
      expect(car.x).toBeCloseTo(b.cars[index]!.x, 7);
      expect(car.z).toBeCloseTo(b.cars[index]!.z, 7);
    });
  });
});
