import { ROAD_WIDTH } from './repository-layout.ts';
import type { RepositoryLayout } from './repository-layout.ts';
export const STOP_DISTANCE = ROAD_WIDTH / 2 + 13;

export type Signal = 'red' | 'amber' | 'green';
export function trafficSignal(time: number, axis: 'x' | 'z'): Signal {
  const phase = ((time % 20) + 20) % 20;
  if (axis === 'x') return phase < 7 ? 'green' : phase < 9 ? 'amber' : 'red';
  return phase >= 10 && phase < 17
    ? 'green'
    : phase >= 17 && phase < 19
      ? 'amber'
      : 'red';
}
export interface TrafficCar {
  x: number;
  z: number;
  yaw: number;
  axis: 'x' | 'z';
  direction: 1 | -1;
  speed: number;
  color: string;
  road: number;
  stop: boolean;
}
const COLORS = [
  '#c03030',
  '#3050a0',
  '#d0d0d0',
  '#2a2a2a',
  '#c8a446',
  '#3e817b',
];
export function createTraffic(layout: RepositoryLayout) {
  const cars: TrafficCar[] = [];
  for (const axis of ['x', 'z'] as const) {
    const roads = axis === 'x' ? layout.roadsZ : layout.roadsX;
    roads.forEach((road, index) => {
      for (const direction of [1, -1] as const) {
        const span = axis === 'x' ? layout.width : layout.depth;
        for (let i = 0; i < 2; i++) {
          const along =
            -span / 2 +
            span *
              ((index * 0.17 + i * 0.46 + (direction === 1 ? 0.12 : 0.32)) % 1);
          cars.push({
            x: axis === 'x' ? along : road - direction * ROAD_WIDTH * 0.19,
            z: axis === 'z' ? along : road + direction * ROAD_WIDTH * 0.19,
            yaw:
              axis === 'x'
                ? direction === 1
                  ? 0
                  : Math.PI
                : direction === 1
                  ? -Math.PI / 2
                  : Math.PI / 2,
            axis,
            direction,
            speed: 10 + ((index + i) % 4) * 2,
            road,
            color:
              COLORS[(index + i + (direction === 1 ? 0 : 3)) % COLORS.length]!,
            stop: false,
          });
        }
      }
    });
  }
  let accumulator = 0,
    elapsed = 0;
  const snapshot = new Float64Array(cars.length);
  const step = (dt: number) => {
    accumulator += Math.min(0.1, Math.max(0, dt));
    while (accumulator >= 1 / 120 - 1e-10) {
      accumulator -= 1 / 120;
      elapsed += 1 / 120;
      cars.forEach((car, index) => {
        snapshot[index] = car.axis === 'x' ? car.x : car.z;
      });
      cars.forEach((car, index) => {
        const position = snapshot[index]!,
          span = car.axis === 'x' ? layout.width : layout.depth;
        const crosses = car.axis === 'x' ? layout.roadsX : layout.roadsZ;
        let next = Infinity;
        for (const cross of crosses) {
          const distance =
            (cross - car.direction * STOP_DISTANCE - position) * car.direction;
          if (distance >= -0.1) next = Math.min(next, distance);
        }
        const leader = cars.reduce(
          (gap, other, j) =>
            other !== car &&
            other.axis === car.axis &&
            other.road === car.road &&
            other.direction === car.direction
              ? Math.min(
                  gap,
                  (snapshot[j]! - position) * car.direction > 0
                    ? (snapshot[j]! - position) * car.direction
                    : Infinity,
                )
              : gap,
          Infinity,
        );
        const remaining =
          trafficSignal(elapsed, car.axis) === 'green' ? Infinity : next;
        const allowed = Math.min(
          car.speed / 120,
          Math.max(0, remaining),
          Math.max(0, leader - 12),
        );
        car.stop = allowed < 0.01;
        let along = position + allowed * car.direction;
        const edge = span / 2 + STOP_DISTANCE + 12;
        if (along > edge) along = -edge;
        if (along < -edge) along = edge;
        if (car.axis === 'x') car.x = along;
        else car.z = along;
      });
    }
  };
  return { cars, step, time: () => elapsed };
}
