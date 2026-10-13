// Reference map processing, adapted from Git City. SPDX-License-Identifier: AGPL-3.0-only
import {
  buildLandArray,
  buildParkArray,
  buildRoadArrays,
} from './map-geometry.ts';
import { indexMapFootprints } from './map-index.ts';
import { sampleTrees } from './map-trees.ts';
import type { MapAsset, MapWorld } from './world-types.ts';

export function buildMapWorld(bay: MapAsset, sf: MapAsset): MapWorld {
  const map = { ...bay, footprints: sf.footprints },
    index = indexMapFootprints(map);
  const candidates = index.candidates.slice(0, 25_000),
    lots = new Float32Array(candidates.length * 2);
  candidates.forEach((candidate, i) => {
    lots[i * 2] = index.F[candidate * 3]!;
    lots[i * 2 + 1] = index.F[candidate * 3 + 1]!;
  });
  const roads = buildRoadArrays(map.roads, 0);
  const routes = map.roads
    .filter(
      (road) =>
        road.c <= 2 &&
        road.p.length >= 4 &&
        road.p.some(
          (value, i) => i % 2 === 0 && Math.hypot(value, road.p[i + 1]!) < 1800,
        ) &&
        road.p.reduce(
          (length, value, i) =>
            i % 2 === 0 && i >= 2
              ? length +
                Math.hypot(
                  value - road.p[i - 2]!,
                  road.p[i + 1]! - road.p[i - 1]!,
                )
              : length,
          0,
        ) >= 120,
    )
    .sort(
      (a, b) =>
        Math.min(
          ...a.p
            .filter((_, i) => i % 2 === 0)
            .map((x, i) => Math.hypot(x, a.p[i * 2 + 1]!)),
        ) -
        Math.min(
          ...b.p
            .filter((_, i) => i % 2 === 0)
            .map((x, i) => Math.hypot(x, b.p[i * 2 + 1]!)),
        ),
    )
    .slice(0, 48)
    .map((road) => ({ points: Float32Array.from(road.p), class: road.c }));
  const parks = map.parks
    .map((park) => {
      const xs = park.p.filter((_, i) => i % 2 === 0),
        zs = park.p.filter((_, i) => i % 2 === 1),
        x = (Math.min(...xs) + Math.max(...xs)) / 2,
        z = (Math.min(...zs) + Math.max(...zs)) / 2;
      return {
        x,
        z,
        radius:
          Math.min(
            Math.max(...xs) - Math.min(...xs),
            Math.max(...zs) - Math.min(...zs),
          ) / 2,
      };
    })
    .filter((park) => park.radius > 12 && Math.hypot(park.x, park.z) < 3000)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const [minx, minz, maxx, maxz] = map.meta.bounds;
  return {
    bounds: map.meta.bounds,
    goldenGate: map.meta.goldenGate,
    attribution: map.meta.attribution,
    arrays: {
      ...roads,
      parks: buildParkArray(map.parks, 0),
      land: buildLandArray(map.landMask, map.meta.bounds, -0.5),
    },
    lots,
    trees: sampleTrees(map),
    routes,
    parks,
    parkCount: map.parks.length,
    radius: Math.max(Math.hypot(minx, minz), Math.hypot(maxx, maxz)),
  };
}
