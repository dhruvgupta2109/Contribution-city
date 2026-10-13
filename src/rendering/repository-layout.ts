// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
// Reference: src/lib/city-layout-core.ts and src/lib/github.ts. See NOTICE.
import type { CityData, Repository } from '../data/types.ts';
import type { MapWorld } from './world-types.ts';

export const BLOCK_WIDTH = 153;
export const BLOCK_DEPTH = 129;
export const ROAD_WIDTH = 20;
export const BLOCK_STEP_X = BLOCK_WIDTH + ROAD_WIDTH;
export const BLOCK_STEP_Z = BLOCK_DEPTH + ROAD_WIDTH;
export interface RepoBuilding {
  index: number;
  id: string;
  repo: Repository | null;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  columns: number;
  sideColumns: number;
  commits: number;
  dailyCounts: number[];
  scanComplete: boolean;
}
export interface CityBlock {
  x: number;
  z: number;
  park: boolean;
}
export interface RepositoryLayout {
  buildings: RepoBuilding[];
  blocks: CityBlock[];
  roadsX: number[];
  roadsZ: number[];
  width: number;
  depth: number;
  maxHeight: number;
  centerX: number;
  centerZ: number;
}
function hash(value: string) {
  let h = 0;
  for (const c of value) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
function random(seed: number) {
  return (((seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function repositoryHeight(
  commits: number,
  stars: number,
  size: number,
  maxCommits: number,
  maxStars: number,
) {
  const c = Math.pow(
    Math.min(commits / Math.max(1, Math.min(maxCommits, 20_000)), 3),
    0.55,
  );
  const s = Math.pow(
    Math.min(stars / Math.max(1, Math.min(maxStars, 200_000)), 3),
    0.45,
  );
  const footprint = Math.sqrt(Math.min(size / 100_000, 1));
  return Math.min(600, 35 + (c * 0.55 + s * 0.35 + footprint * 0.1) * 565);
}

/** Main Git City map variant: 10–360 u heights, 4 u square-window spacing. */
export function createMappedRepositoryLayout(
  city: CityData,
  world: MapWorld,
): RepositoryLayout {
  const layout = createRepositoryLayout(city),
    placed: { x: number; z: number; r: number }[] = [];
  let cursor = 0;
  for (const building of layout.buildings) {
    const radius = Math.max(building.width, building.depth) / 2 + 7;
    let found = false;
    for (; cursor < world.lots.length / 2; cursor++) {
      const x = world.lots[cursor * 2]!,
        z = world.lots[cursor * 2 + 1]!;
      if (
        placed.some(
          (other) =>
            (other.x - x) ** 2 + (other.z - z) ** 2 < (other.r + radius) ** 2,
        )
      )
        continue;
      building.x = x;
      building.z = z;
      placed.push({ x, z, r: radius });
      cursor++;
      found = true;
      break;
    }
    if (!found)
      throw new Error('The reference map has no free repository lots.');
    const composite = (building.height - 35) / 565;
    building.height = Math.max(
      10,
      Math.min(360, 10 + Math.pow(Math.max(0, composite), 1.3) * 340),
    );
    building.floors = Math.max(2, Math.floor(building.height / 4));
    building.columns = Math.max(2, Math.floor(building.width / 4));
    building.sideColumns = Math.max(2, Math.floor(building.depth / 4));
  }
  const extentX = Math.max(
      600,
      ...layout.buildings.map((b) => Math.abs(b.x) + b.width / 2 + 80),
    ),
    extentZ = Math.max(
      600,
      ...layout.buildings.map((b) => Math.abs(b.z) + b.depth / 2 + 80),
    );
  return {
    ...layout,
    width: extentX * 2,
    depth: extentZ * 2,
    centerX: 0,
    centerZ: 0,
    blocks: [],
    roadsX: [],
    roadsZ: [],
    maxHeight: Math.max(10, ...layout.buildings.map((b) => b.height)),
  };
}

/** Repo towers occupy the reference's 4×4 lots; the origin is a public park. */
export function createRepositoryLayout(city: CityData): RepositoryLayout {
  const repos = [...(city.repositoryCatalog ?? city.repositories)].sort(
    (a, b) =>
      (b.authoredCommitCount ?? b.commitCount) -
        (a.authoredCommitCount ?? a.commitCount) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const maxCommits = Math.max(
    1,
    ...repos.map((repo) => repo.authoredCommitCount ?? repo.commitCount),
    city.metadata.otherActivityCount,
  );
  const maxStars = Math.max(1, ...repos.map((repo) => repo.stars ?? 0));
  const buildingBlocks = Math.max(
    1,
    Math.ceil(
      (repos.length + (city.metadata.otherActivityCount > 0 ? 1 : 0)) / 16,
    ),
  );
  const cells: [number, number][] = [],
    parkCells: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
  for (let radius = 1; cells.length < buildingBlocks; radius++) {
    for (let z = -radius; z <= radius; z++)
      for (let x = -radius; x <= radius; x++) {
        if (
          Math.max(Math.abs(x), Math.abs(z)) === radius &&
          !parkCells.some(([px, pz]) => px === x && pz === z)
        )
          cells.push([x, z]);
      }
  }
  const occupied = cells.slice(0, buildingBlocks);
  const rawBlocks = [
    ...parkCells.map(([x, z]) => ({
      x: x * BLOCK_STEP_X,
      z: z * BLOCK_STEP_Z,
      park: true,
    })),
    ...occupied.map(([x, z]) => ({
      x: x * BLOCK_STEP_X,
      z: z * BLOCK_STEP_Z,
      park: false,
    })),
  ];
  const minX =
    Math.min(...rawBlocks.map((b) => b.x)) - BLOCK_WIDTH / 2 - ROAD_WIDTH;
  const maxX =
    Math.max(...rawBlocks.map((b) => b.x)) + BLOCK_WIDTH / 2 + ROAD_WIDTH;
  const minZ =
    Math.min(...rawBlocks.map((b) => b.z)) - BLOCK_DEPTH / 2 - ROAD_WIDTH;
  const maxZ =
    Math.max(...rawBlocks.map((b) => b.z)) + BLOCK_DEPTH / 2 + ROAD_WIDTH;
  const centerX = (minX + maxX) / 2,
    centerZ = (minZ + maxZ) / 2;
  const blocks = rawBlocks.map((b) => ({
    ...b,
    x: b.x - centerX,
    z: b.z - centerZ,
  }));
  const entries: (Repository | null)[] = [...repos];
  if (city.metadata.otherActivityCount > 0) entries.push(null);
  const buildings = entries.map((repo, index): RepoBuilding => {
    const id = repo?.id ?? '__other__',
      seed = hash(id);
    const block = blocks[Math.floor(index / 16) + parkCells.length]!;
    const width = Math.round(
      14 +
        Math.sqrt(Math.min((repo?.size ?? 2000) / 100_000, 1)) * 12 +
        random(seed) * 8,
    );
    const depth = Math.round(12 + random(seed + 99) * 16);
    const commits = repo
      ? (repo.authoredCommitCount ?? repo.commitCount)
      : city.metadata.otherActivityCount;
    const height = repositoryHeight(
      commits,
      repo?.stars ?? 0,
      repo?.size ?? 0,
      maxCommits,
      maxStars,
    );
    const dailyCounts = city.days.map(
      (day) =>
        repo?.dailyCommits?.[day.date] ??
        day.segments.reduce(
          (sum, s) =>
            sum +
            (repo
              ? s.kind === 'repository' && s.repoId === repo.id
                ? s.count
                : 0
              : s.kind === 'other'
                ? s.count
                : 0),
          0,
        ),
    );
    return {
      index,
      id,
      repo,
      name: repo?.name ?? 'Other activity',
      x: block.x + ((index % 4) - 1.5) * 38,
      z: block.z + (Math.floor((index % 16) / 4) - 1.5) * 32,
      width,
      depth,
      height,
      floors: Math.max(3, Math.floor(height / 6)),
      columns: Math.max(3, Math.floor(width / 5)),
      sideColumns: Math.max(3, Math.floor(depth / 5)),
      commits,
      dailyCounts,
      scanComplete: repo?.scanComplete ?? true,
    };
  });
  const roadsX = [
    ...new Set(
      blocks.flatMap((b) => [b.x - BLOCK_STEP_X / 2, b.x + BLOCK_STEP_X / 2]),
    ),
  ].sort((a, b) => a - b);
  const roadsZ = [
    ...new Set(
      blocks.flatMap((b) => [b.z - BLOCK_STEP_Z / 2, b.z + BLOCK_STEP_Z / 2]),
    ),
  ].sort((a, b) => a - b);
  return {
    buildings,
    blocks,
    roadsX,
    roadsZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    maxHeight: Math.max(35, ...buildings.map((b) => b.height)),
    centerX,
    centerZ,
  };
}
