import {
  MathUtils,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 16;
const MIN_TILT = 0.18;
const MAX_TILT = Math.PI / 2 - 0.16;
const ROTATION_DELAY_MS = 3000;

export interface CameraController {
  update: (dt: number, now: number) => void;
  fit: (
    width: number,
    depth: number,
    height: number,
    animate?: boolean,
  ) => void;
  zoom: (factor: number, point?: { x: number; y: number }) => void;
  reset: () => void;
  pause: (paused: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  dispose: () => void;
  zoomLevel: () => number;
  isInteracting: () => boolean;
  setEnabled: (enabled: boolean) => void;
  adopt: (target: Vector3) => void;
  focus: (target: Vector3, distance: number) => void;
  setHome: (position: Vector3, target: Vector3, animate?: boolean) => void;
}

/** Frame-rate independent smoothing; angles use radians, zoom uses log distance. */
export function smoothValue(
  current: number,
  target: number,
  dt: number,
  speed = 14,
): number {
  return MathUtils.lerp(
    current,
    target,
    1 - Math.exp(-speed * Math.min(dt, 0.1)),
  );
}

export function clampZoom(zoom: number): number {
  return MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

export function createCameraController(
  camera: PerspectiveCamera,
  surface: HTMLElement,
  reducedMotion: () => boolean,
  anchorAt?: (point: { x: number; y: number }) => Vector3 | null,
  onMapInteraction?: () => void,
): CameraController {
  let baseDistance = 80;
  let homeY = 1;
  let homeTheta = 0.18;
  let homePhi = 0.86,
    minZoom = MIN_ZOOM,
    maxZoom = MAX_ZOOM,
    mapNavigation = false;
  let theta = 0.18;
  let phi = 0.86;
  let targetTheta = theta;
  let targetPhi = phi;
  let logDistance = Math.log(baseDistance);
  let targetLogDistance = logDistance;
  const pivot = new Vector3(0, homeY, 0);
  const targetPivot = pivot.clone();
  const raycaster = new Raycaster();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const pointer = new Vector2();
  const pointers = new Map<number, { x: number; y: number }>();
  let lastInteraction = performance.now();
  let autoRotate = true;
  let paused = false;
  let explored = false;
  let enabled = true;
  let zoomAnchor: {
    point: Vector3;
    x: number;
    y: number;
    rayDistance: number | null;
    startDistance: number;
  } | null = null;

  const rayAt = (x: number, y: number): boolean => {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return true;
  };
  const groundAt = (x: number, y: number) =>
    rayAt(x, y) ? raycaster.ray.intersectPlane(ground, new Vector3()) : null;

  const pose = () => {
    const distance = Math.exp(logDistance);
    camera.position.set(
      pivot.x + distance * Math.sin(phi) * Math.sin(theta),
      pivot.y + distance * Math.cos(phi),
      pivot.z + distance * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(pivot);
    camera.updateMatrixWorld();
  };
  pose();

  const interact = (manual = false) => {
    lastInteraction = performance.now();
    if (manual && mapNavigation && autoRotate) {
      autoRotate = false;
      onMapInteraction?.();
    }
  };
  const zoom = (factor: number, point?: { x: number; y: number }) => {
    interact(true);
    explored = true;
    const newZoom = MathUtils.clamp(
      (baseDistance / Math.exp(targetLogDistance)) * factor,
      minZoom,
      maxZoom,
    );
    targetLogDistance = Math.log(baseDistance / newZoom);
    if (point) {
      const hit = anchorAt?.(point),
        anchor = hit ?? groundAt(point.x, point.y);
      zoomAnchor = anchor
        ? {
            point: anchor,
            ...point,
            rayDistance: hit ? camera.position.distanceTo(hit) : null,
            startDistance: Math.exp(logDistance),
          }
        : null;
    } else {
      zoomAnchor = null;
    }
  };

  const pan = (fromX: number, fromY: number, toX: number, toY: number) => {
    explored = true;
    const from = groundAt(fromX, fromY);
    const to = groundAt(toX, toY);
    if (from && to) {
      const delta = from.sub(to);
      targetPivot.add(delta);
      // Follow direct contact exactly; release and keyboard movements are smoothed.
      pivot.add(delta);
      pose();
    } else {
      // Near the horizon a sky pixel has no ground intersection; pan still works.
      const rect = surface.getBoundingClientRect();
      const units =
        (2 *
          Math.exp(logDistance) *
          Math.tan(MathUtils.degToRad(camera.fov / 2))) /
        Math.max(1, rect.height);
      const delta = new Vector3(
        Math.cos(theta),
        0,
        -Math.sin(theta),
      ).multiplyScalar(-(toX - fromX) * units);
      delta.addScaledVector(
        new Vector3(Math.sin(theta), 0, Math.cos(theta)),
        (-(toY - fromY) * units) / Math.max(0.2, Math.cos(phi)),
      );
      targetPivot.add(delta);
      pivot.add(delta);
      pose();
    }
    zoomAnchor = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!enabled) return;
    if (
      event.button !== 0 &&
      event.button !== 2 &&
      !(mapNavigation && event.button === 1)
    )
      return;
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    zoomAnchor = null;
    interact(true);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!enabled) return;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    interact(true);
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.values()];
    if (before.length >= 2 && after.length >= 2) {
      const a = before[0]!;
      const b = before[1]!;
      const c = after[0]!;
      const d = after[1]!;
      const oldCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const newCenter = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      if (mapNavigation) {
        explored = true;
        targetTheta -= (newCenter.x - oldCenter.x) * 0.006;
        targetPhi = MathUtils.clamp(
          targetPhi - (newCenter.y - oldCenter.y) * 0.005,
          MIN_TILT,
          MAX_TILT,
        );
      } else pan(oldCenter.x, oldCenter.y, newCenter.x, newCenter.y);
      const oldDistance = Math.hypot(a.x - b.x, a.y - b.y);
      const newDistance = Math.hypot(c.x - d.x, c.y - d.y);
      if (oldDistance > 4 && newDistance > 4)
        zoom(newDistance / oldDistance, newCenter);
    } else if (mapNavigation && (event.buttons & 4) !== 0) {
      zoom(Math.exp(-(event.clientY - previous.y) * 0.005), {
        x: event.clientX,
        y: event.clientY,
      });
    } else if (
      event.shiftKey ||
      (event.buttons & 2) !== 0 ||
      (mapNavigation && event.ctrlKey)
    ) {
      if (mapNavigation) {
        explored = true;
        targetTheta -= (event.clientX - previous.x) * 0.006;
        targetPhi = MathUtils.clamp(
          targetPhi - (event.clientY - previous.y) * 0.005,
          MIN_TILT,
          MAX_TILT,
        );
      } else pan(previous.x, previous.y, event.clientX, event.clientY);
    } else {
      if (mapNavigation)
        pan(previous.x, previous.y, event.clientX, event.clientY);
      else {
        explored = true;
        targetTheta -= (event.clientX - previous.x) * 0.006;
        targetPhi = MathUtils.clamp(
          targetPhi - (event.clientY - previous.y) * 0.005,
          MIN_TILT,
          MAX_TILT,
        );
      }
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (surface.hasPointerCapture(event.pointerId))
      surface.releasePointerCapture(event.pointerId);
    interact();
  };
  const onWheel = (event: WheelEvent) => {
    if (!enabled) return;
    event.preventDefault();
    // Normalize line/page-mode mice while allowing fine trackpad increments.
    const scale =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? surface.clientHeight
          : 1;
    const delta = MathUtils.clamp(event.deltaY * scale, -240, 240);
    zoom(Math.exp(-delta * 0.0017), { x: event.clientX, y: event.clientY });
  };
  const onDoubleClick = (event: MouseEvent) => {
    if (!enabled) return;
    event.preventDefault();
    zoom(2.2, { x: event.clientX, y: event.clientY });
  };
  const reset = () => {
    interact(true);
    explored = false;
    targetTheta =
      homeTheta + Math.round((theta - homeTheta) / (Math.PI * 2)) * Math.PI * 2;
    targetPhi = homePhi;
    targetLogDistance = Math.log(baseDistance);
    targetPivot.set(0, homeY, 0);
    zoomAnchor = null;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!enabled) return;
    const keys = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      '+',
      '=',
      '-',
      '_',
      '0',
      'Home',
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    interact(true);
    zoomAnchor = null;
    if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-' || event.key === '_') zoom(1 / 1.2);
    else if (event.key === '0' || event.key === 'Home') reset();
    else if (mapNavigation ? !event.shiftKey : event.shiftKey) {
      explored = true;
      const amount = mapNavigation
        ? (40 *
            2 *
            Math.exp(targetLogDistance) *
            Math.tan((camera.fov * Math.PI) / 360)) /
          Math.max(1, surface.getBoundingClientRect().height)
        : Math.exp(targetLogDistance) * 0.025;
      const right = new Vector3(Math.cos(theta), 0, -Math.sin(theta));
      const forward = new Vector3(Math.sin(theta), 0, Math.cos(theta));
      if (event.key === 'ArrowLeft')
        targetPivot.addScaledVector(right, -amount);
      if (event.key === 'ArrowRight')
        targetPivot.addScaledVector(right, amount);
      if (event.key === 'ArrowUp')
        targetPivot.addScaledVector(forward, -amount);
      if (event.key === 'ArrowDown')
        targetPivot.addScaledVector(forward, amount);
    } else {
      explored = true;
      if (event.key === 'ArrowLeft') targetTheta -= 0.13;
      if (event.key === 'ArrowRight') targetTheta += 0.13;
      if (event.key === 'ArrowUp')
        targetPhi = Math.max(MIN_TILT, targetPhi - 0.08);
      if (event.key === 'ArrowDown')
        targetPhi = Math.min(MAX_TILT, targetPhi + 0.08);
    }
  };
  const preventContextMenu = (event: Event) => event.preventDefault();
  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointercancel', onPointerUp);
  surface.addEventListener('lostpointercapture', onPointerUp);
  surface.addEventListener('wheel', onWheel, { passive: false });
  surface.addEventListener('dblclick', onDoubleClick);
  surface.addEventListener('keydown', onKeyDown);
  surface.addEventListener('contextmenu', preventContextMenu);

  return {
    update: (dt, now) => {
      if (!enabled) return;
      if (
        autoRotate &&
        !paused &&
        !pointers.size &&
        !reducedMotion() &&
        now - lastInteraction > ROTATION_DELAY_MS
      ) {
        targetTheta += dt * 0.028;
      }
      theta = smoothValue(theta, targetTheta, dt);
      phi = smoothValue(phi, targetPhi, dt);
      logDistance = smoothValue(logDistance, targetLogDistance, dt, 12);
      if (zoomAnchor && Math.abs(logDistance - targetLogDistance) < 0.0001)
        logDistance = targetLogDistance;
      pivot.lerp(targetPivot, 1 - Math.exp(-14 * Math.min(dt, 0.1)));
      pose();
      if (zoomAnchor) {
        const current =
          zoomAnchor.rayDistance !== null
            ? rayAt(zoomAnchor.x, zoomAnchor.y)
              ? raycaster.ray.at(
                  (zoomAnchor.rayDistance * Math.exp(logDistance)) /
                    zoomAnchor.startDistance,
                  new Vector3(),
                )
              : null
            : groundAt(zoomAnchor.x, zoomAnchor.y);
        if (current) {
          const delta = zoomAnchor.point.clone().sub(current);
          pivot.add(delta);
          targetPivot.add(delta);
          pose();
        }
        if (Math.abs(logDistance - targetLogDistance) < 0.0001) {
          targetPivot.copy(pivot);
          zoomAnchor = null;
        }
      }
    },
    fit: (width, depth, height, animate = false) => {
      mapNavigation = false;
      minZoom = MIN_ZOOM;
      maxZoom = MAX_ZOOM;
      homePhi = 0.86;
      const preserveView = animate && explored;
      const previousZoom = baseDistance / Math.exp(targetLogDistance);
      const halfFov = MathUtils.degToRad(camera.fov / 2);
      homeTheta = camera.aspect < 1 ? 0.9 : 0.18;
      homeY = Math.min(height * 0.22, height > 60 ? height * 0.4 : 5);
      let requiredDistance = 16;
      for (const x of [-width / 2, width / 2])
        for (const z of [-depth / 2, depth / 2])
          for (const y of [0, height]) {
            const horizontal =
              x * Math.cos(homeTheta) - z * Math.sin(homeTheta);
            const groundDepth =
              x * Math.sin(homeTheta) + z * Math.cos(homeTheta);
            const vertical =
              (y - homeY) * Math.sin(0.86) - groundDepth * Math.cos(0.86);
            const towardCamera =
              groundDepth * Math.sin(0.86) + (y - homeY) * Math.cos(0.86);
            requiredDistance = Math.max(
              requiredDistance,
              towardCamera +
                Math.max(
                  Math.abs(horizontal) / (Math.tan(halfFov) * camera.aspect),
                  Math.abs(vertical) / Math.tan(halfFov),
                ),
            );
          }
      baseDistance = requiredDistance * 1.1;
      if (!preserveView) {
        targetPivot.set(0, homeY, 0);
        targetTheta =
          homeTheta +
          Math.round((theta - homeTheta) / (Math.PI * 2)) * Math.PI * 2;
        targetPhi = 0.86;
        explored = false;
      }
      targetLogDistance = Math.log(
        baseDistance / (preserveView ? previousZoom : 1),
      );
      if (!animate || reducedMotion()) {
        pivot.copy(targetPivot);
        theta = targetTheta;
        phi = targetPhi;
        logDistance = targetLogDistance;
      }
      camera.far = Math.max(1000, baseDistance * 10, Math.exp(logDistance) * 3);
      camera.near = Math.max(0.015, Math.min(0.1, baseDistance / 5000));
      camera.updateProjectionMatrix();
      zoomAnchor = null;
      interact();
      pose();
    },
    zoom,
    reset,
    pause: (value) => {
      if (paused && !value) interact();
      paused = value;
    },
    setAutoRotate: (value) => {
      autoRotate = value;
      interact();
    },
    dispose: () => {
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerUp);
      surface.removeEventListener('pointercancel', onPointerUp);
      surface.removeEventListener('lostpointercapture', onPointerUp);
      surface.removeEventListener('wheel', onWheel);
      surface.removeEventListener('dblclick', onDoubleClick);
      surface.removeEventListener('keydown', onKeyDown);
      surface.removeEventListener('contextmenu', preventContextMenu);
    },
    zoomLevel: () => baseDistance / Math.exp(logDistance),
    isInteracting: () => pointers.size > 0,
    setEnabled: (value) => {
      enabled = value;
      const captured = [...pointers.keys()];
      pointers.clear();
      for (const id of captured)
        if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
      zoomAnchor = null;
      interact();
    },
    adopt: (target) => {
      pivot.copy(target);
      targetPivot.copy(target);
      const offset = camera.position.clone().sub(target),
        distance = Math.max(0.1, offset.length());
      theta = targetTheta = Math.atan2(offset.x, offset.z);
      phi = targetPhi = MathUtils.clamp(
        Math.acos(MathUtils.clamp(offset.y / distance, -1, 1)),
        MIN_TILT,
        MAX_TILT,
      );
      logDistance = targetLogDistance = Math.log(distance);
      explored = true;
      zoomAnchor = null;
      interact();
      pose();
    },
    focus: (target, distance) => {
      interact(true);
      explored = true;
      zoomAnchor = null;
      targetPivot.copy(target);
      targetPhi = 0.95;
      targetLogDistance = Math.log(
        MathUtils.clamp(
          distance,
          baseDistance / maxZoom,
          baseDistance / minZoom,
        ),
      );
    },
    setHome: (position, target, animate = false) => {
      const offset = position.clone().sub(target);
      baseDistance = offset.length();
      homeY = target.y;
      homeTheta = Math.atan2(offset.x, offset.z);
      homePhi = Math.acos(offset.y / baseDistance);
      mapNavigation = true;
      minZoom = baseDistance / 36000;
      maxZoom = baseDistance / 40;
      if (!animate || !explored) {
        targetPivot.copy(target);
        targetTheta = homeTheta;
        targetPhi = homePhi;
        targetLogDistance = Math.log(baseDistance);
        explored = false;
      }
      if (!animate || reducedMotion()) {
        pivot.copy(targetPivot);
        theta = targetTheta;
        phi = targetPhi;
        logDistance = targetLogDistance;
      }
      camera.near = 6;
      camera.far = 16000;
      camera.updateProjectionMatrix();
      zoomAnchor = null;
      interact();
      pose();
    },
  };
}
