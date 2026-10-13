import { CatmullRomCurve3, Vector3 } from 'three';
import type { MapWorld } from './world-types.ts';
import { trafficSignal } from './traffic.ts';

export interface MapIntersection {
  x: number;
  z: number;
  directions: { x: number; z: number; axis: 'x' | 'z' }[];
}
export interface MapCar {
  x: number;
  z: number;
  yaw: number;
  color: string;
  stop: boolean;
  speed: number;
  progress: number;
  direction: 1 | -1;
  route: number;
  turn: number | null;
}
interface Route {
  points: Vector3[];
  lengths: number[];
  length: number;
  halfWidth: number;
  stops: { along: number; axis: 'x' | 'z' }[];
}
const COLORS = [
  '#c03030',
  '#3050a0',
  '#d0d0d0',
  '#2a2a2a',
  '#c8a446',
  '#3e817b',
];
export function createMapTraffic(world: MapWorld) {
  const nodes = new Map<
    string,
    { x: number; z: number; roads: Set<number>; directions: Vector3[] }
  >();
  world.routes.forEach((route, id) => {
    for (let i = 0; i < route.points.length; i += 2) {
      const x = route.points[i]!,
        z = route.points[i + 1]!,
        key = `${Math.round(x)},${Math.round(z)}`;
      const node = nodes.get(key) ?? {
        x,
        z,
        roads: new Set<number>(),
        directions: [],
      };
      node.roads.add(id);
      for (const other of [i - 2, i + 2])
        if (other >= 0 && other < route.points.length) {
          const delta = new Vector3(
            route.points[other]! - x,
            0,
            route.points[other + 1]! - z,
          ).normalize();
          if (!node.directions.some((d) => d.dot(delta) > 0.95))
            node.directions.push(delta);
        }
      nodes.set(key, node);
    }
  });
  const intersections: MapIntersection[] = [...nodes.values()]
    .filter(
      (node) =>
        node.roads.size > 1 &&
        node.directions.some((a) =>
          node.directions.some((b) => Math.abs(a.dot(b)) < 0.85),
        ),
    )
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
    .slice(0, 40)
    .map((node) => ({
      x: node.x,
      z: node.z,
      directions: node.directions.map((d) => ({
        x: d.x,
        z: d.z,
        axis: Math.abs(d.x) > Math.abs(d.z) ? 'x' : 'z',
      })),
    }));
  const routes: Route[] = world.routes.map((route) => {
    const raw: Vector3[] = [];
    for (let i = 0; i < route.points.length; i += 2)
      raw.push(new Vector3(route.points[i]!, 0, route.points[i + 1]!));
    const curve =
      raw.length > 2 ? new CatmullRomCurve3(raw, false, 'centripetal') : null;
    const points = curve
      ? curve.getSpacedPoints(
          Math.max(2, Math.min(220, Math.round(curve.getLength() / 12))),
        )
      : raw;
    const lengths = [0];
    for (let i = 1; i < points.length; i++)
      lengths.push(lengths[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
    const stops: Route['stops'] = [];
    for (const intersection of intersections) {
      let nearest = Infinity,
        along = 0,
        axis: 'x' | 'z' = 'x';
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!,
          b = points[i]!,
          dx = b.x - a.x,
          dz = b.z - a.z;
        const fraction = Math.max(
          0,
          Math.min(
            1,
            ((intersection.x - a.x) * dx + (intersection.z - a.z) * dz) /
              Math.max(0.001, dx * dx + dz * dz),
          ),
        );
        const distance = Math.hypot(
          a.x + dx * fraction - intersection.x,
          a.z + dz * fraction - intersection.z,
        );
        if (distance < nearest) {
          nearest = distance;
          along = lengths[i - 1]! + Math.hypot(dx, dz) * fraction;
          axis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
        }
      }
      if (nearest < 18) stops.push({ along, axis });
    }
    return {
      points,
      lengths,
      length: lengths.at(-1)!,
      halfWidth: [10, 6, 4, 3][route.class] ?? 4,
      stops,
    };
  });
  const cars: MapCar[] = [];
  routes.forEach((route, index) => {
    if (route.length < 120) return;
    for (const direction of [1, -1] as const)
      cars.push({
        x: 0,
        z: 0,
        yaw: 0,
        color: COLORS[index % COLORS.length]!,
        stop: false,
        speed: 10 + (index % 4) * 2,
        progress: route.length * (direction === 1 ? 0.28 : 0.72),
        direction,
        route: index,
        turn: null,
      });
  });
  let time = 0,
    accumulator = 0;
  const snapshots = new Float64Array(cars.length),
    scratch = new Vector3();
  const place = (car: MapCar) => {
    const route = routes[car.route]!;
    let segment = 1;
    while (
      segment < route.lengths.length - 1 &&
      route.lengths[segment]! < car.progress
    )
      segment++;
    const a = route.points[segment - 1]!,
      b = route.points[segment]!,
      fraction =
        (car.progress - route.lengths[segment - 1]!) /
        Math.max(0.001, route.lengths[segment]! - route.lengths[segment - 1]!);
    scratch.copy(b).sub(a).normalize().multiplyScalar(car.direction);
    const lane = Math.min(4, route.halfWidth * 0.45);
    if (car.turn !== null) {
      const endpoint =
          car.direction === 1 ? route.points.at(-1)! : route.points[0]!,
        angle = car.turn;
      const dx = scratch.x,
        dz = scratch.z;
      car.x =
        endpoint.x + (-dz * Math.cos(angle) + dx * Math.sin(angle)) * lane;
      car.z = endpoint.z + (dx * Math.cos(angle) + dz * Math.sin(angle)) * lane;
      car.yaw = -Math.atan2(
        -dx * Math.sin(angle) + dz * Math.cos(angle),
        dz * Math.sin(angle) + dx * Math.cos(angle),
      );
      return;
    }
    car.x = a.x + (b.x - a.x) * fraction - scratch.z * lane;
    car.z = a.z + (b.z - a.z) * fraction + scratch.x * lane;
    car.yaw = -Math.atan2(scratch.z, scratch.x);
  };
  cars.forEach(place);
  const step = (delta: number) => {
    accumulator += Math.min(0.1, Math.max(0, delta));
    while (accumulator >= 1 / 120 - 1e-10) {
      accumulator -= 1 / 120;
      time += 1 / 120;
      cars.forEach((car, i) => {
        snapshots[i] = car.progress;
      });
      cars.forEach((car, i) => {
        const route = routes[car.route]!,
          position = snapshots[i]!;
        let stop = Infinity,
          leader = Infinity;
        if (car.turn !== null) {
          car.turn += car.speed / 120 / Math.min(4, route.halfWidth * 0.45);
          if (car.turn >= Math.PI) {
            car.turn = null;
            car.direction = car.direction === 1 ? -1 : 1;
          }
          car.stop = false;
          place(car);
          return;
        }
        for (const point of route.stops)
          if (trafficSignal(time, point.axis) !== 'green') {
            const gap =
              (point.along -
                car.direction * (route.halfWidth + 13) -
                position) *
              car.direction;
            if (gap >= -0.1) stop = Math.min(stop, gap);
          }
        cars.forEach((other, j) => {
          if (
            other.route === car.route &&
            other.direction === car.direction &&
            i !== j
          ) {
            const gap = (snapshots[j]! - position) * car.direction;
            if (gap > 0) leader = Math.min(leader, gap);
          }
        });
        const move = Math.min(
          car.speed / 120,
          Math.max(0, stop),
          Math.max(0, leader - 12),
        );
        car.stop = move < 0.01;
        car.progress += move * car.direction;
        if (car.progress > route.length) {
          car.progress = route.length;
          car.turn = 0;
        }
        if (car.progress < 0) {
          car.progress = 0;
          car.turn = 0;
        }
        place(car);
      });
    }
  };
  return { cars, intersections, step, time: () => time };
}
