// Git City flight-input adaptation. SPDX-License-Identifier: AGPL-3.0-only. See NOTICE.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PointLight,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PerspectiveCamera } from 'three';
import {
  deadzoneCurve,
  FlightSimulation,
  neutralFlightInput,
} from './flight.ts';

export interface FlightStatus {
  active: boolean;
  paused: boolean;
  speed: number;
  altitude: number;
  throttle: number;
}
export function createFlightController(
  camera: PerspectiveCamera,
  surface: HTMLElement,
  onStatus: (status: FlightStatus) => void,
  onPause: (paused: boolean) => void,
  onExit: () => void,
  reducedMotion: () => boolean,
) {
  const simulation = new FlightSimulation(),
    craft = new Group();
  craft.visible = false;
  const fallbackGeo = new BufferGeometry();
  fallbackGeo.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        0, 0, -5, -5, 0, 3, 0, 0.8, 1, 0, 0, -5, 0, 0.8, 1, 5, 0, 3, -5, 0, 3,
        0, 0.8, 1, 0, 0, 4, 5, 0, 3, 0, 0, 4, 0, 0.8, 1,
      ]),
      3,
    ),
  );
  fallbackGeo.computeVertexNormals();
  const fallbackMat = new MeshBasicMaterial({
    color: '#ecebdc',
    side: DoubleSide,
  });
  const fallback = new Mesh(fallbackGeo, fallbackMat);
  craft.add(fallback);
  const warm = new PointLight('#f0c870', 15, 60),
    white = new PointLight('#ffffff', 5, 30);
  warm.position.set(0, -2, 0);
  white.position.set(0, 3, -4);
  craft.add(warm, white);
  const trailPoints = 48,
    trailPositions = new Float32Array(trailPoints * 3),
    trailColors = new Float32Array(trailPoints * 4),
    trailGeometry = new BufferGeometry();
  trailGeometry.setAttribute(
    'position',
    new BufferAttribute(trailPositions, 3),
  );
  trailGeometry.setAttribute('color', new BufferAttribute(trailColors, 4));
  const trailMaterial = new LineBasicMaterial({
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    trail = new Line(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  trail.visible = false;
  const resetTrail = () => {
    for (let i = 0; i < trailPoints; i++) {
      trailPositions[i * 3] = simulation.position.x;
      trailPositions[i * 3 + 1] = simulation.position.y;
      trailPositions[i * 3 + 2] = simulation.position.z;
      trailColors[i * 4] = trailColors[i * 4 + 1] = trailColors[i * 4 + 2] = 1;
      trailColors[i * 4 + 3] = 0;
    }
  };
  let disposed = false,
    active = false,
    boost = false,
    brake = false,
    hudTime = 0,
    joystick: { id: number; x: number; y: number } | null = null;
  const mouse = { x: 0, y: 0 },
    keys = new Set<string>();
  const loader = new GLTFLoader();
  loader.load(
    '/models/paper-plane.glb',
    (gltf) => {
      if (disposed) {
        gltf.scene.traverse((item) => {
          if (item instanceof Mesh) {
            item.geometry.dispose();
            const mats = Array.isArray(item.material)
              ? item.material
              : [item.material];
            mats.forEach((mat) => mat.dispose());
          }
        });
        return;
      }
      fallback.visible = false;
      const model = gltf.scene;
      model.scale.setScalar(3);
      model.rotation.y = Math.PI / 2;
      craft.add(model);
    },
    undefined,
    () => {
      /* The lightweight procedural plane remains usable offline. */
    },
  );
  const status = (): FlightStatus => ({
    active,
    paused: simulation.paused,
    speed: simulation.speed,
    altitude: simulation.position.y,
    throttle: simulation.throttle,
  });
  const clearInput = () => {
    const id = joystick?.id;
    joystick = null;
    keys.clear();
    mouse.x = 0;
    mouse.y = 0;
    boost = false;
    brake = false;
    if (id !== undefined && surface.hasPointerCapture(id))
      surface.releasePointerCapture(id);
  };
  const pause = (paused: boolean) => {
    if (!active || simulation.paused === paused) return;
    clearInput();
    if (paused) simulation.paused = true;
    else simulation.resume(camera, reducedMotion());
    onPause(paused);
    onStatus(status());
  };
  const onMove = (event: PointerEvent) => {
    if (!active || simulation.paused) return;
    if (event.pointerType === 'touch') {
      if (!joystick || event.pointerId !== joystick.id) return;
      let dx = event.clientX - joystick.x,
        dy = event.clientY - joystick.y;
      const length = Math.hypot(dx, dy);
      if (length > 60) {
        joystick.x = event.clientX - (dx / length) * 60;
        joystick.y = event.clientY - (dy / length) * 60;
        dx = event.clientX - joystick.x;
        dy = event.clientY - joystick.y;
      }
      mouse.x = dx / 60;
      mouse.y = -dy / 60;
    } else {
      const rect = surface.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      mouse.y = -(
        ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 -
        1
      );
    }
  };
  const down = (event: PointerEvent) => {
    if (
      active &&
      !simulation.paused &&
      event.pointerType === 'touch' &&
      !joystick
    ) {
      joystick = { id: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
    }
  };
  const up = (event: PointerEvent) => {
    if (joystick?.id === event.pointerId) {
      joystick = null;
      mouse.x = 0;
      mouse.y = 0;
      if (surface.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId);
    }
  };
  const wheel = (event: WheelEvent) => {
    if (!active || simulation.paused) return;
    event.preventDefault();
    const scale =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? surface.clientHeight
          : 1;
    simulation.adjustThrottle(
      Math.max(-500, Math.min(500, event.deltaY * scale)),
    );
    onStatus(status());
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!active) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      event.code !== 'Escape' &&
      target?.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (event.code === 'Space' && target?.closest('button, a, [role="button"]'))
      return;
    const accepted = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyQ',
      'KeyR',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'ShiftLeft',
      'ShiftRight',
      'AltLeft',
      'AltRight',
      'Space',
      'KeyP',
      'Escape',
    ];
    if (!accepted.includes(event.code)) return;
    event.preventDefault();
    if (event.code === 'Escape') {
      if (event.repeat) return;
      if (simulation.paused) onExit();
      else pause(true);
      return;
    }
    if (event.code === 'Space' || event.code === 'KeyP') {
      if (!event.repeat) pause(!simulation.paused);
      return;
    }
    if (event.code === 'KeyR') {
      if (!simulation.paused) simulation.returnToCity();
      return;
    }
    if (simulation.paused) pause(false);
    keys.add(event.code);
  };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const blur = () => {
    clearInput();
    if (active) pause(true);
  };
  // Git City steers from window-wide mouse movement. Keep updating as the
  // pointer crosses HUD controls instead of freezing or snapping to centre.
  window.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerdown', down);
  surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', up);
  surface.addEventListener('lostpointercapture', up);
  surface.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  return {
    craft,
    trail,
    simulation,
    status,
    start: (radius: number) => {
      clearInput();
      active = true;
      simulation.start(camera, radius, reducedMotion());
      craft.position.copy(simulation.position);
      craft.visible = true;
      resetTrail();
      trail.visible = !reducedMotion();
      surface.focus({ preventScroll: true });
      onStatus(status());
    },
    stop: () => {
      clearInput();
      active = false;
      craft.visible = false;
      trail.visible = false;
      onStatus(status());
    },
    pause,
    boost: (value: boolean) => {
      boost = value;
    },
    brake: (value: boolean) => {
      brake = value;
    },
    throttle: (value: number) => {
      simulation.setThrottle(value);
      onStatus(status());
    },
    update: (dt: number) => {
      if (!active || simulation.paused) return;
      const input = neutralFlightInput();
      input.turn =
        keys.has('KeyA') || keys.has('ArrowLeft')
          ? -1
          : keys.has('KeyD') || keys.has('ArrowRight')
            ? 1
            : deadzoneCurve(mouse.x);
      input.climb =
        keys.has('KeyW') || keys.has('ArrowUp')
          ? 1
          : keys.has('KeyS') || keys.has('ArrowDown')
            ? -1
            : deadzoneCurve(mouse.y);
      input.boost = boost || keys.has('ShiftLeft') || keys.has('ShiftRight');
      input.brake =
        brake ||
        keys.has('AltLeft') ||
        keys.has('AltRight') ||
        keys.has('KeyQ');
      simulation.update(dt, input, reducedMotion());
      simulation.applyCamera(camera);
      craft.position.copy(simulation.position);
      craft.rotation.set(
        simulation.pitch,
        simulation.yaw,
        simulation.bank,
        'YXZ',
      );
      trail.visible = !reducedMotion();
      trailPositions.copyWithin(3, 0, (trailPoints - 1) * 3);
      trailPositions[0] = simulation.position.x + Math.sin(simulation.yaw) * 5;
      trailPositions[1] = simulation.position.y;
      trailPositions[2] = simulation.position.z + Math.cos(simulation.yaw) * 5;
      const intensity = Math.max(
        0,
        Math.min(1, (simulation.speed / 55 - 0.7) * 1.5),
      );
      for (let i = 0; i < trailPoints; i++)
        trailColors[i * 4 + 3] = (1 - i / trailPoints) * intensity * 0.5;
      trailGeometry.getAttribute('position').needsUpdate = true;
      trailGeometry.getAttribute('color').needsUpdate = true;
      hudTime += dt;
      if (hudTime > 0.15) {
        hudTime = 0;
        onStatus(status());
      }
    },
    dispose: () => {
      disposed = true;
      clearInput();
      window.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointerup', up);
      surface.removeEventListener('pointercancel', up);
      surface.removeEventListener('lostpointercapture', up);
      surface.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      const materials = new Set<MeshBasicMaterial>(),
        geometries = new Set<BufferGeometry>();
      craft.traverse((item) => {
        if (item instanceof Mesh) {
          geometries.add(item.geometry);
          for (const mat of Array.isArray(item.material)
            ? item.material
            : [item.material])
            materials.add(mat as MeshBasicMaterial);
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      trailGeometry.dispose();
      trailMaterial.dispose();
      craft.clear();
    },
  };
}
