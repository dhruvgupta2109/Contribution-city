import type { CityDay } from '../data/types';

export const CELL = 1.25;
export const STREET = CELL * 1.1;
export const BUILDING = .87;
export const FLOOR = .28;
export const SLAB = .095;

export interface Lot { x: number; z: number; week: number; weekday: number; height: number }
export function createLayout(days: CityDay[]) {
  const offset = days.length ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;
  const weeks = Math.ceil((days.length + offset) / 7);
  const width = weeks * CELL + Math.floor((weeks - 1) / 4) * STREET;
  const depth = 7 * CELL + STREET;
  const lots: Lot[] = days.map((day, i) => {
    const week = Math.floor((i + offset) / 7);
    const weekday = (i + offset) % 7;
    return {
      x: (week + .5) * CELL + Math.floor(week / 4) * STREET - width / 2,
      z: (weekday + .5) * CELL + (weekday >= 4 ? STREET : 0) - depth / 2,
      week, weekday, height: day.count ? day.count * FLOOR + SLAB : SLAB,
    };
  });
  const streets = [];
  for (let week = 4; week < weeks; week += 4) streets.push(week * CELL + (week / 4 - .5) * STREET - width / 2);
  return { lots, width, depth, streets, avenue: 4 * CELL + STREET / 2 - depth / 2, weeks };
}
