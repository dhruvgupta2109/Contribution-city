import type { MapWorld } from './world-types.ts';

export interface OccupiedLot {
  x: number;
  z: number;
  width: number;
  depth: number;
}
export interface AmbientBuilding extends OccupiedLot {
  height: number;
  seed: number;
}

/** Quiet, decorative city fabric on the reference's road/park-cleared lots. */
export function createUrbanBackfill(
  world: Pick<MapWorld, 'lots'>,
  repositories: readonly OccupiedLot[],
  limit = 6500,
): AmbientBuilding[] {
  // The reference's distant skyline needs thousands of footprints. Index
  // occupied circles by cell so scenery generation stays close to linear.
  const cellSize = 48,
    occupied = new Map<string, { x: number; z: number; r: number }[]>();
  const cells = (x: number, z: number, r: number, visit: (key: string) => void) => {
    for (let cx = Math.floor((x - r) / cellSize); cx <= Math.floor((x + r) / cellSize); cx++)
      for (let cz = Math.floor((z - r) / cellSize); cz <= Math.floor((z + r) / cellSize); cz++)
        visit(`${cx},${cz}`);
  };
  const add = (x: number, z: number, r: number) => {
    const lot = { x, z, r };
    cells(x, z, r, (key) => {
      const bucket = occupied.get(key) ?? [];
      bucket.push(lot);
      occupied.set(key, bucket);
    });
  };
  for (const building of repositories)
    add(building.x, building.z, Math.hypot(building.width, building.depth) / 2 + 5);
  const result: AmbientBuilding[] = [];
  for (let i = 0; i < world.lots.length / 2 && result.length < limit; i++) {
    const x = world.lots[i * 2]!,
      z = world.lots[i * 2 + 1]!,
      distance = Math.hypot(x, z);
    if (distance > 3000) break;
    const seed =
      (Math.imul(Math.round(x), 73856093) ^
        Math.imul(Math.round(z), 19349663)) >>>
      0;
    const width = 7 + (seed & 7),
      depth = 7 + ((seed >>> 3) & 7),
      height = 12 + ((seed >>> 6) % 42) + (distance < 1000 ? 12 : 0);
    const radius = Math.hypot(width, depth) / 2 + 3;
    let overlap = false;
    cells(x, z, radius, (key) => {
      if (overlap) return;
      for (const other of occupied.get(key) ?? [])
        if ((x - other.x) ** 2 + (z - other.z) ** 2 < (radius + other.r) ** 2) {
          overlap = true;
          break;
        }
    });
    if (overlap) continue;
    add(x, z, radius);
    result.push({ x, z, width, depth, height, seed });
  }
  return result;
}
