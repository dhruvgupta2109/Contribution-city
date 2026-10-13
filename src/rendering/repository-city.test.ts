import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { generateDemoCity } from '../data/demo.ts';
import { createRepositoryLayout } from './repository-layout.ts';
import { createRepositoryScene } from './repository-scene.ts';
import { activityBuckets } from './repository-material.ts';
import { createTraffic, STOP_DISTANCE, trafficSignal } from './traffic.ts';
describe('repository city', () => {
  it('places one tower per project plus a labelled remainder, retaining actual fetched totals', () => {
    const city = generateDemoCity(),
      layout = createRepositoryLayout(city);
    expect(layout.buildings).toHaveLength(city.repositories.length + 1);
    expect(layout.blocks.some((b) => b.park)).toBe(true);
    for (const b of layout.buildings) {
      expect(b.height).toBeGreaterThanOrEqual(35);
      expect(b.height).toBeLessThanOrEqual(600);
      expect(b.dailyCounts).toHaveLength(365);
      expect(b.dailyCounts.reduce((a, b) => a + b, 0)).toBe(b.commits);
    }
    for (const a of layout.buildings)
      for (const b of layout.buildings)
        if (a !== b)
          expect(
            Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
              Math.abs(a.z - b.z) >= (a.depth + b.depth) / 2,
          ).toBe(true);
  });
  it('retains zero-commit and unscanned projects instead of dropping them', () => {
    const city = generateDemoCity();
    city.repositoryCatalog = [
      ...city.repositories,
      {
        id: 'demo/quiet',
        name: 'quiet',
        url: 'https://github.com/demo/quiet',
        color: '#39d353',
        commitCount: 0,
        authoredCommitCount: 0,
        scanComplete: false,
      },
    ];
    const building = createRepositoryLayout(city).buildings.find(
      (b) => b.id === 'demo/quiet',
    )!;
    expect(building).toBeDefined();
    expect(building.commits).toBe(0);
    expect(building.scanComplete).toBe(false);
    expect(building.height).toBe(35);
  });
  it('allocates cars, signals, park props, and filters/recolors without rebuilding towers', () => {
    const city = generateDemoCity(),
      scene = createRepositoryScene(city);
    expect(scene.counts()).toMatchObject({ buildings: 6, parks: 3 });
    expect(scene.counts().cars).toBeGreaterThan(0);
    expect(scene.counts().trafficLights).toBeGreaterThan(0);
    expect(scene.counts().trees).toBeGreaterThan(0);
    const mesh = scene.buildings;
    scene.update(1, new PerspectiveCamera(), 800, 1 / 60);
    scene.setFilter(city.repositories[0]!.id);
    const dims = mesh.geometry.getAttribute('aDim');
    expect(Array.from(dims.array).filter((v) => v === 1)).toHaveLength(1);
    scene.setColor(city.repositories[0]!.id, '#ff0000');
    scene.setTheme(2);
    expect(scene.buildings).toBe(mesh);
    expect(
      mesh.geometry
        .getAttribute('aCustom')
        .getX(
          scene.layout.buildings.find((b) => b.id === city.repositories[0]!.id)!
            .index,
        ),
    ).toBe(1);
    scene.setFilter(null);
    expect(Array.from(dims.array).every((v) => v === 1)).toBe(true);
    expect(() => scene.dispose()).not.toThrow();
  });
  it('keeps sparse activity visible when aggregating a whole year into facade windows', () => {
    const counts = Array.from({ length: 365 }, () => 0);
    counts[0] = 1;
    counts[364] = 500;
    const buckets = activityBuckets(counts, 12);
    expect(buckets[0]).toBeGreaterThan(0);
    expect(buckets[11]).toBe(4);
    expect(Array.from(buckets).filter((n) => n > 0)).toHaveLength(2);
  });
  it('never gives conflicting intersection directions a green light', () => {
    for (let time = 0; time < 60; time += 0.1)
      expect(
        trafficSignal(time, 'x') === 'green' &&
          trafficSignal(time, 'z') === 'green',
      ).toBe(false);
    expect(trafficSignal(9.5, 'x')).toBe('red');
    expect(trafficSignal(9.5, 'z')).toBe('red');
  });
  it('stops cars before a red light and resumes on green, with equivalent replay at different frame rates', () => {
    const layout = createRepositoryLayout(generateDemoCity());
    const traffic = createTraffic(layout),
      car = traffic.cars.find((c) => c.axis === 'z' && c.direction === 1)!;
    car.z = layout.roadsZ[0]! - 30;
    for (let frame = 0; frame < 240; frame++) traffic.step(1 / 60);
    expect(car.z).toBeCloseTo(layout.roadsZ[0]! - STOP_DISTANCE, 6);
    expect(car.stop).toBe(true);
    for (let frame = 0; frame < 480; frame++) traffic.step(1 / 60);
    expect(car.z).toBeGreaterThan(layout.roadsZ[0]! - STOP_DISTANCE);
    const a = createTraffic(layout),
      b = createTraffic(layout);
    for (let frame = 0; frame < 600; frame++) a.step(1 / 60);
    for (let frame = 0; frame < 1200; frame++) b.step(1 / 120);
    a.cars.forEach((car, index) => {
      expect(car.x).toBeCloseTo(b.cars[index]!.x, 7);
      expect(car.z).toBeCloseTo(b.cars[index]!.z, 7);
    });
  });
});
