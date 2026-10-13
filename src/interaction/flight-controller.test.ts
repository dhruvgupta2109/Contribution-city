// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFlightController } from './flight-controller.ts';
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function setup() {
  vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation(() => {});
  const camera = new PerspectiveCamera(55, 1, 6, 16000);
  camera.position.set(-800, 700, -1000);
  camera.lookAt(0, 70, 0);
  const surface = document.createElement('canvas');
  document.body.append(surface);
  surface.hasPointerCapture = vi.fn(() => false);
  const onExit = vi.fn();
  const flight = createFlightController(
    camera,
    surface,
    vi.fn(),
    vi.fn(),
    onExit,
    () => false,
  );
  flight.start(3500);
  return { flight, surface, onExit };
}
describe('flight input lifecycle', () => {
  it('releases held boost even when keyup occurs outside the canvas', () => {
    const { flight, surface } = setup();
    surface.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }),
    );
    for (let i = 0; i < 60; i++) flight.update(1 / 60);
    expect(flight.simulation.speed).toBeGreaterThan(120);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    for (let i = 0; i < 120; i++) flight.update(1 / 60);
    expect(flight.simulation.speed).toBeCloseTo(55, 0);
    flight.dispose();
  });
  it('steers after a HUD button takes focus while leaving input and button keys alone', () => {
    const { flight, surface, onExit } = setup(),
      button = document.createElement('button'),
      slider = document.createElement('input');
    slider.type = 'range';
    document.body.append(button, slider);
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
    );
    const before = flight.simulation.position.y;
    for (let i = 0; i < 60; i++) flight.update(1 / 60);
    expect(flight.simulation.position.y).toBeGreaterThan(before);
    button.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }),
    );
    button.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true }),
    );
    expect(flight.status().paused).toBe(false);
    slider.focus();
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }),
    );
    expect(flight.status().paused).toBe(false);
    surface.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true }),
    );
    expect(flight.status().paused).toBe(true);
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }),
    );
    expect(onExit).toHaveBeenCalledTimes(1);
    button.remove();
    slider.remove();
    flight.dispose();
  });
  it('keeps mouse steering responsive while crossing HUD controls', () => {
    const { flight, surface } = setup(),
      hud = document.createElement('button');
    document.body.append(hud);
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 600,
      right: 1000,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    surface.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        clientX: 900,
        clientY: 300,
        bubbles: true,
      }),
    );
    for (let i = 0; i < 30; i++) flight.update(1 / 60);
    const rightYaw = flight.simulation.yaw;
    hud.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        clientX: 100,
        clientY: 300,
        bubbles: true,
      }),
    );
    for (let i = 0; i < 60; i++) flight.update(1 / 60);
    expect(flight.simulation.yaw).toBeGreaterThan(rightYaw);
    hud.remove();
    flight.dispose();
  });
  it('pauses on blur and clears held input before resuming', () => {
    const { flight, surface } = setup();
    surface.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
    );
    flight.boost(true);
    for (let i = 0; i < 30; i++) flight.update(1 / 60);
    window.dispatchEvent(new Event('blur'));
    expect(flight.status().paused).toBe(true);
    const position = flight.simulation.position.clone();
    flight.update(0.1);
    expect(flight.simulation.position.distanceTo(position)).toBe(0);
    flight.pause(false);
    for (let i = 0; i < 120; i++) flight.update(1 / 60);
    const settledAltitude = flight.simulation.position.y;
    for (let i = 0; i < 60; i++) flight.update(1 / 60);
    expect(flight.simulation.speed).toBeCloseTo(55, 0);
    expect(flight.simulation.position.y - settledAltitude).toBeLessThan(0.001);
    flight.dispose();
  });
});
