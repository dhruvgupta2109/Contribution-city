import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 16;
const MIN_TILT = 0.18;
const MAX_TILT = Math.PI / 2 - 0.16;
const ROTATION_DELAY_MS = 3000;

export interface CameraController {
  update: (dt: number, now: number) => void;
  fit: (width: number, depth: number, height: number, animate?: boolean) => void;
  zoom: (factor: number, point?: { x: number; y: number }) => void;
  reset: () => void;
  pause: (paused: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  dispose: () => void;
  zoomLevel: () => number;
  isInteracting: () => boolean;
}

/** Frame-rate independent smoothing; angles use radians, zoom uses log distance. */
export function smoothValue(current: number, target: number, dt: number, speed = 14): number {
  return MathUtils.lerp(current, target, 1 - Math.exp(-speed * Math.min(dt, 0.1)));
}

export function clampZoom(zoom: number): number {
  return MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

export function createCameraController(
  camera: PerspectiveCamera,
  surface: HTMLElement,
  reducedMotion: () => boolean,
): CameraController {
  let baseDistance = 80;
  let homeY = 1;
  let homeTheta = 0.18;
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
  let zoomAnchor: { point: Vector3; x: number; y: number } | null = null;

  const groundAt = (x: number, y: number): Vector3 | null => {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(ground, new Vector3());
  };

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

  const interact = () => { lastInteraction = performance.now(); };
  const zoom = (factor: number, point?: { x: number; y: number }) => {
    interact();
    explored = true;
    const newZoom = clampZoom(baseDistance / Math.exp(targetLogDistance) * factor);
    targetLogDistance = Math.log(baseDistance / newZoom);
    if (point) {
      const anchor = groundAt(point.x, point.y);
      zoomAnchor = anchor ? { point: anchor, ...point } : null;
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
      const units = 2 * Math.exp(logDistance) * Math.tan(MathUtils.degToRad(camera.fov / 2)) / Math.max(1, rect.height);
      const delta = new Vector3(Math.cos(theta), 0, -Math.sin(theta)).multiplyScalar(-(toX - fromX) * units);
      delta.addScaledVector(new Vector3(Math.sin(theta), 0, Math.cos(theta)), -(toY - fromY) * units / Math.max(0.2, Math.cos(phi)));
      targetPivot.add(delta); pivot.add(delta); pose();
    }
    zoomAnchor = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) return;
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    zoomAnchor = null;
    interact();
  };

  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    interact();
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.values()];
    if (before.length >= 2 && after.length >= 2) {
      const a = before[0]!; const b = before[1]!;
      const c = after[0]!; const d = after[1]!;
      const oldCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const newCenter = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      pan(oldCenter.x, oldCenter.y, newCenter.x, newCenter.y);
      const oldDistance = Math.hypot(a.x - b.x, a.y - b.y);
      const newDistance = Math.hypot(c.x - d.x, c.y - d.y);
      if (oldDistance > 4 && newDistance > 4) zoom(newDistance / oldDistance, newCenter);
    } else if (event.shiftKey || (event.buttons & 2) !== 0) {
      pan(previous.x, previous.y, event.clientX, event.clientY);
    } else {
      explored = true;
      targetTheta -= (event.clientX - previous.x) * 0.006;
      targetPhi = MathUtils.clamp(targetPhi - (event.clientY - previous.y) * 0.005, MIN_TILT, MAX_TILT);
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    interact();
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // Normalize line/page-mode mice while allowing fine trackpad increments.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1;
    const delta = MathUtils.clamp(event.deltaY * scale, -240, 240);
    zoom(Math.exp(-delta * 0.0017), { x: event.clientX, y: event.clientY });
  };
  const onDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    zoom(2.2, { x: event.clientX, y: event.clientY });
  };
  const reset = () => {
    interact();
    explored = false;
    targetTheta = homeTheta + Math.round((theta - homeTheta) / (Math.PI * 2)) * Math.PI * 2;
    targetPhi = 0.86;
    targetLogDistance = Math.log(baseDistance);
    targetPivot.set(0, homeY, 0);
    zoomAnchor = null;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', '0', 'Home'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    interact();
    zoomAnchor = null;
    if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-' || event.key === '_') zoom(1 / 1.2);
    else if (event.key === '0' || event.key === 'Home') reset();
    else if (event.shiftKey) {
      explored = true;
      const amount = Math.exp(targetLogDistance) * 0.025;
      const right = new Vector3(Math.cos(theta), 0, -Math.sin(theta));
      const forward = new Vector3(Math.sin(theta), 0, Math.cos(theta));
      if (event.key === 'ArrowLeft') targetPivot.addScaledVector(right, -amount);
      if (event.key === 'ArrowRight') targetPivot.addScaledVector(right, amount);
      if (event.key === 'ArrowUp') targetPivot.addScaledVector(forward, -amount);
      if (event.key === 'ArrowDown') targetPivot.addScaledVector(forward, amount);
    } else {
      explored = true;
      if (event.key === 'ArrowLeft') targetTheta -= 0.13;
      if (event.key === 'ArrowRight') targetTheta += 0.13;
      if (event.key === 'ArrowUp') targetPhi = Math.max(MIN_TILT, targetPhi - 0.08);
      if (event.key === 'ArrowDown') targetPhi = Math.min(MAX_TILT, targetPhi + 0.08);
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
      if (autoRotate && !paused && !pointers.size && !reducedMotion() && now - lastInteraction > ROTATION_DELAY_MS) {
        targetTheta += dt * 0.028;
      }
      theta = smoothValue(theta, targetTheta, dt);
      phi = smoothValue(phi, targetPhi, dt);
      logDistance = smoothValue(logDistance, targetLogDistance, dt, 12);
      if (zoomAnchor && Math.abs(logDistance - targetLogDistance) < 0.0001) logDistance = targetLogDistance;
      pivot.lerp(targetPivot, 1 - Math.exp(-14 * Math.min(dt, 0.1)));
      pose();
      if (zoomAnchor) {
        const current = groundAt(zoomAnchor.x, zoomAnchor.y);
        if (current) {
          const delta = zoomAnchor.point.clone().sub(current);
          pivot.add(delta);
          targetPivot.add(delta);
          pose();
        }
        if (Math.abs(logDistance - targetLogDistance) < 0.0001) zoomAnchor = null;
      }
    },
    fit: (width, depth, height, animate = false) => {
      const preserveView = animate && explored;
      const previousZoom = baseDistance / Math.exp(targetLogDistance);
      const halfFov = MathUtils.degToRad(camera.fov / 2);
      homeTheta = camera.aspect < 1 ? 0.9 : 0.18;
      homeY = Math.min(height * 0.22, height > 60 ? height * 0.4 : 5);
      let requiredDistance = 16;
      for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) for (const y of [0, height]) {
        const horizontal = x * Math.cos(homeTheta) - z * Math.sin(homeTheta);
        const groundDepth = x * Math.sin(homeTheta) + z * Math.cos(homeTheta);
        const vertical = (y - homeY) * Math.sin(0.86) - groundDepth * Math.cos(0.86);
        const towardCamera = groundDepth * Math.sin(0.86) + (y - homeY) * Math.cos(0.86);
        requiredDistance = Math.max(requiredDistance, towardCamera + Math.max(Math.abs(horizontal) / (Math.tan(halfFov) * camera.aspect), Math.abs(vertical) / Math.tan(halfFov)));
      }
      baseDistance = requiredDistance * 1.1;
      if (!preserveView) {
        targetPivot.set(0, homeY, 0);
        targetTheta = homeTheta + Math.round((theta - homeTheta) / (Math.PI * 2)) * Math.PI * 2;
        targetPhi = 0.86;
        explored = false;
      }
      targetLogDistance = Math.log(baseDistance / (preserveView ? previousZoom : 1));
      if (!animate || reducedMotion()) {
        pivot.copy(targetPivot); theta = targetTheta; phi = targetPhi; logDistance = targetLogDistance;
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
    pause: (value) => { if (paused && !value) interact(); paused = value; },
    setAutoRotate: (value) => { autoRotate = value; interact(); },
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
  };
}
