import { describe, expect, it } from 'vitest';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import {
  CRUISE_SPEED,
  deadzoneCurve,
  FLY_TUNE,
  FlightSimulation,
  MAX_ALTITUDE,
  MIN_ALTITUDE,
  neutralFlightInput,
} from './flight.ts';
function setup() {
  const camera = new PerspectiveCamera(55, 1.6, 0.1, 10000);
  camera.position.set(100, 160, 300);
  camera.lookAt(0, 70, 0);
  camera.updateMatrixWorld();
  const sim = new FlightSimulation();
  sim.start(camera, 400);
  return { sim, camera };
}
describe('Git City flight adaptation', () => {
  it('retains the tuned deadzone, throttle, easing, and chase-arm defaults', () => {
    expect(FLY_TUNE).toMatchObject({
      boost: 10,
      shiftBoost: 2.5,
      speedEase: 2.2,
      camDist: 74,
      camHeight: 24,
      camYawLag: 6.3,
      camHeightLag: 4.2,
      turnEase: 9.5,
      climbEase: 6.5,
    });
    expect(deadzoneCurve(0.079)).toBe(0);
    expect(deadzoneCurve(1)).toBe(1);
    expect(deadzoneCurve(-1)).toBe(-1);
    expect(deadzoneCurve(0.5)).toBeGreaterThan(0);
    expect(deadzoneCurve(0.5)).toBeLessThan(0.5);
  });
  it('produces the same turn, climb, speed, and chase pose at 30, 60, 120, and 144 Hz', () => {
    const results = [30, 60, 120, 144].map((hz) => {
      const { sim } = setup();
      sim.adjustThrottle(-180);
      for (let frame = 0; frame < hz * 8; frame++)
        sim.update(
          1 / hz,
          { turn: 0.4, climb: 0.3, boost: true, brake: false },
          true,
        );
      return sim;
    });
    for (const sim of results.slice(1)) {
      expect(sim.position.distanceTo(results[0]!.position)).toBeLessThan(1e-7);
      expect(
        sim.cameraPosition.distanceTo(results[0]!.cameraPosition),
      ).toBeLessThan(1e-7);
      expect(sim.yaw).toBeCloseTo(results[0]!.yaw, 10);
      expect(sim.speed).toBeCloseTo(results[0]!.speed, 10);
    }
  });
  it('enters flight without jumping and eases throttle/boost/brake rather than snapping', () => {
    const { sim, camera } = setup();
    expect(sim.cameraPosition.distanceTo(camera.position)).toBe(0);
    sim.setThrottle(400);
    sim.update(1 / 60, neutralFlightInput());
    expect(sim.speed).toBeGreaterThan(CRUISE_SPEED);
    expect(sim.speed).toBeLessThan(400);
    for (let i = 0; i < 600; i++)
      sim.update(1 / 60, neutralFlightInput(), true);
    expect(sim.speed).toBeCloseTo(400, 5);
    const input = { turn: 0, climb: 0, boost: true, brake: false };
    sim.update(1 / 60, input, true);
    expect(sim.speed).toBeGreaterThan(400);
    expect(sim.speed).toBeLessThan(1000);
    input.brake = true;
    const before = sim.speed;
    sim.update(1 / 60, input, true);
    expect(sim.speed).toBeLessThan(before);
    expect(sim.speed).toBeGreaterThan(120);
  });
  it('caps a delayed frame to the reference step and applies the boost lens without lag', () => {
    const { sim } = setup(),
      start = sim.position.clone();
    sim.update(1, { turn: 0, climb: 0, boost: false, brake: false }, true);
    expect(sim.position.distanceTo(start)).toBeLessThan(3);
    sim.setThrottle(550);
    for (let i = 0; i < 60; i++)
      sim.update(
        1 / 60,
        { turn: 0, climb: 0, boost: true, brake: false },
        true,
      );
    expect(sim.fov).toBeCloseTo(
      55 + 10 * MathUtils.smoothstep(sim.speed / 550, 1.15, 2.5),
      8,
    );
    sim.paused = true;
    const fov = sim.fov;
    sim.update(1, neutralFlightInput());
    expect(sim.fov).toBe(fov);
  });
  it('clamps altitude and the exploration boundary without invalid camera values', () => {
    const { sim } = setup();
    sim.setThrottle(550);
    for (let i = 0; i < 2400; i++)
      sim.update(
        1 / 60,
        { turn: 0, climb: 1, boost: true, brake: false },
        true,
      );
    expect(sim.position.y).toBe(MAX_ALTITUDE);
    expect(Math.hypot(sim.position.x, sim.position.z)).toBeLessThanOrEqual(
      3500.000001,
    );
    for (let i = 0; i < 2400; i++)
      sim.update(
        1 / 60,
        { turn: 0, climb: -1, boost: false, brake: true },
        true,
      );
    expect(sim.position.y).toBe(MIN_ALTITUDE);
    expect(sim.cameraPosition.toArray().every(Number.isFinite)).toBe(true);
  });
  it('holds a fixed chase arm at high speed instead of accumulating positional lag', () => {
    const { sim } = setup();
    sim.setThrottle(550);
    for (let i = 0; i < 900; i++)
      sim.update(
        1 / 60,
        { turn: 0.65, climb: 0, boost: true, brake: false },
        true,
      );
    const horizontal = Math.hypot(
      sim.cameraPosition.x - sim.position.x,
      sim.cameraPosition.z - sim.position.z,
    );
    expect(horizontal).toBeGreaterThanOrEqual(74);
    expect(horizontal).toBeLessThanOrEqual(74 * 1.12 + 0.000001);
    expect(Math.abs(sim.bank)).toBeLessThanOrEqual(0.55);
    expect(sim.fov).toBeLessThanOrEqual(65);
  });
  it('pauses all movement and resumes from the inspected camera without a snap', () => {
    const { sim, camera } = setup();
    sim.paused = true;
    const before = sim.position.clone();
    sim.update(1, { turn: 1, climb: 1, boost: true, brake: false });
    expect(sim.position.distanceTo(before)).toBe(0);
    camera.position.add(new Vector3(30, 10, -20));
    camera.lookAt(sim.position);
    camera.updateMatrixWorld();
    sim.resume(camera);
    sim.update(0, neutralFlightInput());
    expect(sim.position.distanceTo(before)).toBe(0);
    sim.update(1 / 240, neutralFlightInput());
    expect(sim.cameraPosition.distanceTo(camera.position)).toBeLessThan(5);
  });
  it('lets wheel throttle settle into a hover and return to cruise', () => {
    const { sim } = setup();
    for (let i = 0; i < 30; i++) sim.adjustThrottle(100);
    expect(sim.throttle).toBe(0);
    for (let i = 0; i < 900; i++)
      sim.update(1 / 60, neutralFlightInput(), true);
    expect(sim.speed).toBeLessThan(0.000001);
    sim.adjustThrottle(-100);
    expect(sim.throttle).toBeGreaterThan(8);
    for (let i = 0; i < 100; i++) sim.adjustThrottle(-100);
    expect(sim.throttle).toBe(550);
  });
});
