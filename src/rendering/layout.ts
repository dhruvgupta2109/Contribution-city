import { parseDateKey } from '../data/dates.ts';
import type { CityData, ContributionDay } from '../data/types.ts';

export const CELL_SIZE = 1.18;
export const STREET_WIDTH = CELL_SIZE * 1.1;
export const BUILDING_WIDTH = 0.84;
export const SLAB_HEIGHT = 0.12;
export const FLOOR_HEIGHT = 0.24;

export interface BuildingPlacement {
  day: ContributionDay;
  index: number;
  week: number;
  weekday: number;
  x: number;
  z: number;
  height: number;
}

export interface CityLayout {
  buildings: BuildingPlacement[];
  weeks: number;
  width: number;
  depth: number;
  maxHeight: number;
  centerX: number;
  centerZ: number;
}

export function buildingHeight(count: number): number {
  return SLAB_HEIGHT + count * FLOOR_HEIGHT;
}

export function weekX(week: number): number {
  return week * CELL_SIZE + Math.floor(week / 4) * STREET_WIDTH;
}

export function weekdayZ(weekday: number): number {
  return weekday * CELL_SIZE + (weekday >= 4 ? STREET_WIDTH : 0);
}

export function createCityLayout(city: CityData): CityLayout {
  const offset = parseDateKey(city.metadata.startDate).getUTCDay();
  const weeks = Math.ceil((city.days.length + offset) / 7);
  const centerX = weekX(weeks - 1) / 2;
  const centerZ = weekdayZ(6) / 2;
  const buildings = city.days.map((day, index) => {
    const week = Math.floor((index + offset) / 7);
    const weekday = (index + offset) % 7;
    return {
      day, index, week, weekday,
      x: weekX(week) - centerX,
      z: weekdayZ(weekday) - centerZ,
      height: buildingHeight(day.contributionCount),
    };
  });
  return {
    buildings, weeks, centerX, centerZ,
    width: weekX(weeks - 1) + CELL_SIZE + 2 * STREET_WIDTH,
    depth: weekdayZ(6) + CELL_SIZE + 2 * STREET_WIDTH,
    maxHeight: Math.max(SLAB_HEIGHT, ...buildings.map((building) => building.height)),
  };
}
