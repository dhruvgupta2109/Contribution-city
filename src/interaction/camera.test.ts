// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { clampZoom, createCameraController, smoothValue } from './camera.ts';

afterEach(() => vi.restoreAllMocks());
function setup(reducedMotion = true) {
  const surface = document.createElement('canvas');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 1000,
    height: 600,
    left: 0,
    right: 1000,
    top: 0,
    bottom: 600,
    toJSON: () => ({}),
  });
  const camera = new PerspectiveCamera(42, 1000 / 600, 0.05, 1000);
  const controller = createCameraController(
    camera,
    surface,
    () => reducedMotion,
  );
  controller.fit(80, 12, 20);
  return { camera, controller, surface };
}
function groundAt(camera: PerspectiveCamera, x: number, y: number) {
  const ray = new Raycaster();
  ray.setFromCamera(
    new Vector2((x / 1000) * 2 - 1, -(y / 600) * 2 + 1),
    camera,
  );
  return ray.ray.intersectPlane(
    new Plane(new Vector3(0, 1, 0), 0),
    new Vector3(),
  )!;
}

describe('smooth camera motion', () => {
  it('uses the reference home pose, left-pan/right-orbit mappings and map distance limits', () => {
    const { camera, controller, surface } = setup();
    const home = new Vector3(-800, 700, -1000),
      target = new Vector3(0, 70, 0);
    controller.setHome(home, target);
    expect(camera.position.distanceTo(home)).toBeLessThan(1e-8);
    expect(camera.near).toBe(6);
    expect(camera.far).toBe(16000);
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    surface.hasPointerCapture = vi.fn(() => true);
    const direction = camera.getWorldDirection(new Vector3()),
      before = camera.position.clone();
    surface.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        button: 0,
        clientX: 500,
        clientY: 300,
      }),
    );
    surface.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        buttons: 1,
        clientX: 540,
        clientY: 300,
      }),
    );
    surface.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    controller.update(1 / 60, 0);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0);
    expect(
      camera.getWorldDirection(new Vector3()).distanceTo(direction),
    ).toBeLessThan(1e-8);
    surface.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        button: 2,
        clientX: 500,
        clientY: 300,
      }),
    );
    surface.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 2,
        buttons: 2,
        clientX: 600,
        clientY: 300,
      }),
    );
    surface.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));
    controller.update(1 / 60, 0);
    expect(
      camera.getWorldDirection(new Vector3()).distanceTo(direction),
    ).toBeGreaterThan(0.1);
    controller.zoom(1e8);
    for (let i = 0; i < 180; i++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(home.distanceTo(target) / 40);
    controller.zoom(1e-8);
    for (let i = 0; i < 180; i++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(home.distanceTo(target) / 36000);
    controller.dispose();
  });
  it('yields input and camera updates during flight, then adopts the chase pose without a jump', () => {
    const { surface, camera, controller } = setup(false);
    const position = camera.position.clone();
    controller.setEnabled(false);
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    controller.update(1 / 60, 10000);
    expect(camera.position.distanceTo(position)).toBe(0);
    expect(controller.zoomLevel()).toBeCloseTo(1);
    camera.position.set(20, 30, 74);
    const plane = new Vector3(20, 6, 0);
    camera.lookAt(plane);
    const chase = camera.position.clone();
    controller.adopt(plane);
    expect(camera.position.distanceTo(chase)).toBeLessThan(1e-8);
    controller.setEnabled(true);
    controller.dispose();
  });
  it('keeps a raised facade point under the cursor throughout close-up zoom', () => {
    const surface = document.createElement('canvas');
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      left: 0,
      right: 1000,
      top: 0,
      bottom: 600,
      toJSON: () => ({}),
    });
    const camera = new PerspectiveCamera(55, 1000 / 600, 0.1, 10000);
    let anchor = new Vector3();
    const controller = createCameraController(
      camera,
      surface,
      () => true,
      () => anchor.clone(),
    );
    controller.fit(600, 400, 300);
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(0.3, 0.2), camera);
    anchor = ray.ray.intersectPlane(
      new Plane(new Vector3(0, 1, 0), -150),
      new Vector3(),
    )!;
    expect(anchor).not.toBeNull();
    controller.zoom(16, { x: 650, y: 240 });
    for (let frame = 0; frame < 180; frame++) {
      controller.update(1 / 60, 0);
      const projected = anchor.clone().project(camera);
      expect(projected.x).toBeCloseTo(0.3, 6);
      expect(projected.y).toBeCloseTo(0.2, 6);
    }
    expect(controller.zoomLevel()).toBeCloseTo(16, 6);
    controller.dispose();
  });
  it('eases a repository visit while keeping zoom within the orbit limits', () => {
    const { camera, controller } = setup(false);
    controller.setAutoRotate(false);
    const before = camera.position.clone(),
      target = new Vector3(20, 8, 4);
    controller.focus(target, 20);
    expect(camera.position.distanceTo(before)).toBe(0);
    for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, 0);
    expect(
      camera
        .getWorldDirection(new Vector3())
        .distanceTo(target.clone().sub(camera.position).normalize()),
    ).toBeLessThan(0.00001);
    expect(controller.zoomLevel()).toBeLessThanOrEqual(16);
    expect(controller.zoomLevel()).toBeGreaterThanOrEqual(0.4);
    controller.dispose();
  });
  it('has equivalent smoothing at different refresh rates', () => {
    let sixty = 0;
    let oneTwenty = 0;
    for (let i = 0; i < 60; i++) sixty = smoothValue(sixty, 1, 1 / 60);
    for (let i = 0; i < 120; i++)
      oneTwenty = smoothValue(oneTwenty, 1, 1 / 120);
    expect(sixty).toBeCloseTo(oneTwenty, 10);
  });
  it.each([0.68, 1.77])(
    'frames the full city bounds at aspect ratio %s',
    (aspect) => {
      const { controller, camera } = setup();
      camera.aspect = aspect;
      controller.fit(80, 12, 20);
      for (const x of [-40, 40])
        for (const z of [-6, 6])
          for (const y of [0, 20]) {
            const projected = new Vector3(x, y, z).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(1);
            expect(Math.abs(projected.y)).toBeLessThan(1);
          }
      controller.dispose();
    },
  );
  it.each([0.68, 1.77])(
    'eases an adaptive refit at aspect ratio %s without snapping the camera',
    (aspect) => {
      const { controller, camera } = setup(false);
      controller.setAutoRotate(false);
      camera.aspect = aspect < 1 ? 1.77 : 0.68;
      controller.fit(80, 12, 20);
      const before = camera.position.clone();
      camera.aspect = aspect;
      controller.fit(80, 12, 20, true);
      expect(camera.position.distanceTo(before)).toBeLessThan(0.00001);
      controller.update(1 / 60, 0);
      expect(camera.position.distanceTo(before)).toBeGreaterThan(0);
      for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, 0);
      for (const x of [-40, 40])
        for (const z of [-6, 6])
          for (const y of [0, 20]) {
            const projected = new Vector3(x, y, z).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(1);
            expect(Math.abs(projected.y)).toBeLessThan(1);
          }
      expect(controller.zoomLevel()).toBeCloseTo(1, 6);
      controller.dispose();
    },
  );
  it.each([0.4, 16])(
    'allows right-drag pan over the sky at zoom %s',
    (zoom) => {
      const { surface, camera, controller } = setup();
      surface.setPointerCapture = vi.fn();
      surface.releasePointerCapture = vi.fn();
      surface.hasPointerCapture = vi.fn(() => true);
      for (let i = 0; i < 10; i++)
        surface.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown' }),
        );
      controller.zoom(zoom);
      for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, 0);
      expect(groundAt(camera, 500, 0)).toBeNull();
      const before = camera.position.clone();
      surface.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 1,
          button: 2,
          clientX: 500,
          clientY: 0,
        }),
      );
      surface.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          buttons: 2,
          clientX: 540,
          clientY: 20,
        }),
      );
      expect(camera.position.distanceTo(before)).toBeGreaterThan(0);
      expect(camera.position.y).toBeCloseTo(before.y, 6);
      surface.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      controller.dispose();
    },
  );
  it('preserves zoom, orientation, and pan through incremental viewport resizes', () => {
    const { surface, camera, controller } = setup(false);
    controller.setAutoRotate(false);
    controller.zoom(4);
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    surface.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }),
    );
    for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, 0);
    const direction = camera.getWorldDirection(new Vector3());
    const centre = groundAt(camera, 500, 300);
    for (const aspect of [1.6, 1.5, 1.4, 1.3]) {
      const before = camera.position.clone();
      camera.aspect = aspect;
      controller.fit(80, 12, 20, true);
      expect(camera.position.distanceTo(before)).toBeLessThan(0.00001);
      for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, 0);
      expect(controller.zoomLevel()).toBeCloseTo(4, 6);
      expect(
        camera.getWorldDirection(new Vector3()).distanceTo(direction),
      ).toBeLessThan(0.00001);
      expect(groundAt(camera, 500, 300).distanceTo(centre)).toBeLessThan(
        0.00001,
      );
    }
    controller.reset();
    for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(1, 6);
    controller.dispose();
  });
  it('clamps zoom to 0.4–16 and eases instead of jumping', () => {
    expect(clampZoom(0.01)).toBe(0.4);
    expect(clampZoom(100)).toBe(16);
    const { controller } = setup();
    controller.zoom(2);
    expect(controller.zoomLevel()).toBeCloseTo(1);
    controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeGreaterThan(1);
    expect(controller.zoomLevel()).toBeLessThan(2);
    for (let i = 0; i < 120; i++) controller.update(1 / 60, i * 16.67);
    expect(controller.zoomLevel()).toBeCloseTo(2, 6);
    controller.zoom(100);
    for (let i = 0; i < 180; i++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(16, 6);
    controller.zoom(0.0001);
    for (let i = 0; i < 180; i++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(0.4, 6);
    controller.dispose();
  });
  it('maintains the ground point below the cursor throughout eased zoom', () => {
    const { camera, controller } = setup();
    const anchor = groundAt(camera, 650, 370);
    controller.zoom(4, { x: 650, y: 370 });
    for (let frame = 0; frame < 90; frame++) {
      controller.update(1 / 60, frame * 16.67);
      expect(groundAt(camera, 650, 370).distanceTo(anchor)).toBeLessThan(
        0.00001,
      );
    }
    controller.dispose();
  });
  it('supports keyboard zoom and reset', () => {
    const { surface, controller } = setup();
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    for (let frame = 0; frame < 100; frame++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(1.2, 6);
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    for (let frame = 0; frame < 100; frame++) controller.update(1 / 60, 0);
    expect(controller.zoomLevel()).toBeCloseTo(1, 6);
    controller.dispose();
  });
  it('combines two-finger pinch and pan while keeping the chosen ground point stable', () => {
    const { surface, camera, controller } = setup();
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    surface.hasPointerCapture = vi.fn(() => true);
    surface.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 400,
        clientY: 350,
        button: 0,
      }),
    );
    surface.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 600,
        clientY: 350,
        button: 0,
      }),
    );
    const anchor = groundAt(camera, 500, 350);
    surface.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 350,
        clientY: 370,
      }),
    );
    for (let frame = 0; frame < 30; frame++) controller.update(1 / 60, 0);
    expect(groundAt(camera, 475, 360).distanceTo(anchor)).toBeLessThan(0.00001);
    surface.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 620,
        clientY: 380,
      }),
    );
    for (let frame = 0; frame < 30; frame++) controller.update(1 / 60, 0);
    expect(groundAt(camera, 485, 375).distanceTo(anchor)).toBeLessThan(0.00001);
    expect(controller.zoomLevel()).toBeGreaterThan(1);
    surface.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    surface.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));
    expect(controller.isInteracting()).toBe(false);
    controller.dispose();
  });
  it('delays automatic rotation and respects hover pause and reduced motion', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { camera, controller } = setup(false);
    const initial = camera.position.clone();
    controller.update(1 / 60, 2999);
    expect(camera.position.distanceTo(initial)).toBeLessThan(0.00001);
    controller.update(1 / 60, 3001);
    expect(camera.position.distanceTo(initial)).toBeGreaterThan(0);
    controller.pause(true);
    for (let frame = 0; frame < 100; frame++) controller.update(1 / 60, 5000);
    const paused = camera.position.clone();
    controller.update(1 / 60, 6000);
    expect(camera.position.distanceTo(paused)).toBeLessThan(0.00001);
    controller.dispose();
    const reduced = setup(true);
    const still = reduced.camera.position.clone();
    reduced.controller.update(1 / 60, 10000);
    expect(reduced.camera.position.distanceTo(still)).toBeLessThan(0.00001);
    reduced.controller.dispose();
  });
});
