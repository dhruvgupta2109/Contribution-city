// Adapted from Git City VehicleFlight / FlyTune, Samuel Rizzon.
// SPDX-License-Identifier: AGPL-3.0-only. See NOTICE.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export const FLY_TUNE = Object.freeze({
  boost: 10,
  shiftBoost: 2.5,
  wheelStep: 0.3,
  speedEase: 2.2,
  camDist: 74,
  camHeight: 24,
  camYawLag: 6.3,
  camHeightLag: 4.2,
  turnEase: 9.5,
  climbEase: 6.5,
  fovKick: 10,
});
export const CRUISE_SPEED = 55,
  MIN_ALTITUDE = 25,
  MAX_ALTITUDE = 900,
  BASE_FLIGHT_FOV = 55;
const HOVER_BELOW = 8,
  TURN_RATE = 2,
  CLIMB_RATE = 55,
  MAX_BANK = 0.55,
  MAX_PITCH = 0.7,
  DEADZONE = 0.08,
  STEP = 1 / 240;
export interface FlightInput {
  turn: number;
  climb: number;
  boost: boolean;
  brake: boolean;
}
export const neutralFlightInput = (): FlightInput => ({
  turn: 0,
  climb: 0,
  boost: false,
  brake: false,
});
export function deadzoneCurve(value: number) {
  const abs = Math.min(1, Math.abs(value));
  if (abs < DEADZONE) return 0;
  const adjusted = (abs - DEADZONE) / (1 - DEADZONE);
  return Math.sign(value) * adjusted * adjusted;
}
const ease = (a: number, b: number, speed: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-speed * dt));

/** Fixed short steps keep reference tuning consistent on 30/60/120/144 Hz displays. */
export class FlightSimulation {
  readonly position = new Vector3();
  readonly cameraPosition = new Vector3();
  readonly lookTarget = new Vector3();
  yaw = 0;
  bank = 0;
  pitch = 0;
  speed = CRUISE_SPEED;
  throttle = CRUISE_SPEED;
  fov = BASE_FLIGHT_FOV;
  paused = false;
  private yawRate = 0;
  private climbRate = 0;
  private camYaw = 0;
  private camY = 0;
  private accumulator = 0;
  private elapsed = 0;
  private boundary = 3500;
  private readonly forward = new Vector3();
  private readonly transitionFrom = new Vector3();
  private readonly transitionLook = new Vector3();
  private transition = 1;
  start(camera: PerspectiveCamera, cityRadius: number, reducedMotion = false) {
    camera.getWorldDirection(this.forward);
    this.yaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.camYaw = this.yaw;
    this.position
      .copy(camera.position)
      .addScaledVector(
        new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)),
        FLY_TUNE.camDist,
      );
    this.position.y = MathUtils.clamp(
      camera.position.y - FLY_TUNE.camHeight,
      MIN_ALTITUDE,
      MAX_ALTITUDE,
    );
    this.camY = camera.position.y;
    this.cameraPosition.copy(camera.position);
    this.lookTarget.copy(camera.position).addScaledVector(this.forward, 100);
    this.fov = camera.fov;
    this.transitionFrom.copy(camera.position);
    this.transitionLook.copy(this.lookTarget);
    this.transition = reducedMotion ? 1 : 0;
    this.yawRate = 0;
    this.climbRate = 0;
    this.bank = 0;
    this.pitch = 0;
    this.speed = CRUISE_SPEED;
    this.throttle = CRUISE_SPEED;
    this.accumulator = 0;
    this.elapsed = 0;
    this.paused = false;
    this.boundary = Math.max(3500, cityRadius * 1.3);
  }
  adjustThrottle(delta: number) {
    const factor = Math.exp((-delta * FLY_TUNE.wheelStep) / 100);
    this.throttle =
      factor > 1
        ? Math.min(
            CRUISE_SPEED * FLY_TUNE.boost,
            Math.max(HOVER_BELOW, this.throttle) * factor,
          )
        : this.throttle * factor < HOVER_BELOW
          ? 0
          : this.throttle * factor;
  }
  setThrottle(value: number) {
    this.throttle = MathUtils.clamp(value, 0, CRUISE_SPEED * FLY_TUNE.boost);
  }
  returnToCity() {
    this.yaw = Math.atan2(this.position.x, this.position.z);
  }
  resume(camera: PerspectiveCamera, reducedMotion = false) {
    this.paused = false;
    this.accumulator = 0;
    this.camYaw = this.yaw;
    this.camY = camera.position.y;
    this.fov = camera.fov;
    this.transitionFrom.copy(camera.position);
    camera.getWorldDirection(this.forward);
    this.transitionLook
      .copy(camera.position)
      .addScaledVector(this.forward, 100);
    this.transition = reducedMotion ? 1 : 0;
  }
  update(delta: number, input: FlightInput, reducedMotion = false) {
    if (this.paused) return;
    // Match Git City's 50 ms cap so a delayed frame cannot lurch forward.
    this.accumulator += Math.min(0.05, Math.max(0, delta));
    while (this.accumulator >= STEP - 1e-10) {
      this.accumulator -= STEP;
      this.advance(STEP, input, reducedMotion);
    }
  }
  private advance(dt: number, input: FlightInput, reducedMotion: boolean) {
    this.elapsed += dt;
    const turn = MathUtils.clamp(input.turn, -1, 1),
      climb = MathUtils.clamp(input.climb, -1, 1);
    this.yawRate = ease(this.yawRate, turn * TURN_RATE, FLY_TUNE.turnEase, dt);
    this.yaw -= this.yawRate * dt;
    const targetSpeed =
      this.throttle *
      (input.brake ? 0.3 : input.boost ? FLY_TUNE.shiftBoost : 1);
    this.speed = ease(
      this.speed,
      targetSpeed,
      FLY_TUNE.speedEase * (targetSpeed > this.speed ? 1 : 1.6),
      dt,
    );
    this.climbRate = ease(
      this.climbRate,
      climb * CLIMB_RATE * Math.max(0.6, Math.sqrt(this.speed / CRUISE_SPEED)),
      FLY_TUNE.climbEase,
      dt,
    );
    this.position.y += this.climbRate * dt;
    if (this.position.y <= MIN_ALTITUDE || this.position.y >= MAX_ALTITUDE)
      this.climbRate = 0;
    this.position.y = MathUtils.clamp(
      this.position.y,
      MIN_ALTITUDE,
      MAX_ALTITUDE,
    );
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.position.addScaledVector(this.forward, this.speed * dt);
    const dist = Math.hypot(this.position.x, this.position.z),
      soft = this.boundary * 0.85;
    if (dist > soft) {
      const amount =
        this.speed *
        dt *
        Math.min(1, (dist - soft) / (this.boundary - soft)) *
        1.5;
      this.position.x -= (this.position.x / dist) * amount;
      this.position.z -= (this.position.z / dist) * amount;
      const remaining = Math.hypot(this.position.x, this.position.z);
      if (remaining > this.boundary) {
        this.position.x *= this.boundary / remaining;
        this.position.z *= this.boundary / remaining;
      }
    }
    this.bank = ease(this.bank, (-this.yawRate / TURN_RATE) * MAX_BANK, 5, dt);
    this.pitch = ease(this.pitch, climb * MAX_PITCH, 6, dt);
    const k = MathUtils.smoothstep(
      this.speed / Math.max(HOVER_BELOW, this.throttle),
      1.15,
      Math.max(1.2, FLY_TUNE.shiftBoost),
    );
    const dYaw = Math.atan2(
      Math.sin(this.yaw - this.camYaw),
      Math.cos(this.yaw - this.camYaw),
    );
    this.camYaw += dYaw * (1 - Math.exp(-FLY_TUNE.camYawLag * dt));
    this.camY = ease(
      this.camY,
      this.position.y + FLY_TUNE.camHeight,
      FLY_TUNE.camHeightLag,
      dt,
    );
    const arm = FLY_TUNE.camDist * (1 + 0.12 * k);
    this.cameraPosition.set(
      this.position.x + Math.sin(this.camYaw) * arm,
      this.camY,
      this.position.z + Math.cos(this.camYaw) * arm,
    );
    this.lookTarget.copy(this.position).addScaledVector(this.forward, 8);
    this.lookTarget.y += 2;
    this.transition = Math.min(1, this.transition + dt * 2);
    if (this.transition < 1) {
      const amount = 1 - (1 - this.transition) ** 3;
      this.cameraPosition.lerpVectors(
        this.transitionFrom,
        this.cameraPosition,
        amount,
      );
      this.lookTarget.lerpVectors(this.transitionLook, this.lookTarget, amount);
    }
    this.fov = BASE_FLIGHT_FOV + FLY_TUNE.fovKick * k;
    if (!reducedMotion && k > 0.05) {
      this.cameraPosition.x += Math.sin(this.elapsed * 37.1) * 0.35 * k;
      this.cameraPosition.y += Math.sin(this.elapsed * 41.3 + 1.7) * 0.245 * k;
    }
  }
  applyCamera(camera: PerspectiveCamera) {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.lookTarget);
    if (Math.abs(camera.fov - this.fov) > 0.005) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
}
