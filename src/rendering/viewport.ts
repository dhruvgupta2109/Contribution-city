import { PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from 'three';
import type { CityData, ContributionDay } from '../data/types.ts';
import { createCameraController } from '../interaction/camera.ts';
import { createCityScene, createSky } from './city-scene.ts';
import type { CityScene } from './city-scene.ts';

export type GraphicsState = 'ready' | 'unavailable' | 'lost';
export interface ViewportCallbacks {
  onPick?: (day: ContributionDay | null, point: { x: number; y: number }, pinned?: boolean) => void;
  onZoom?: (zoom: number) => void;
}
export interface Viewport {
  render: () => void;
  load: (city: CityData) => void;
  filter: (id: string | null) => void;
  recolor: (id: string, color: string) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  clearSelection: () => void;
  autoRotate: (enabled: boolean) => void;
  exportPng: () => Promise<Blob>;
  diagnostics: () => Record<string, number>;
  dispose: () => void;
}

const unavailableViewport = (): Viewport => ({
  render: () => {}, load: () => {}, filter: () => {}, recolor: () => {},
  zoom: () => {}, reset: () => {}, clearSelection: () => {}, autoRotate: () => {},
  exportPng: () => Promise.reject(new Error('PNG export requires a working WebGL view.')),
  diagnostics: () => ({}), dispose: () => {},
});

export function createViewport(
  host: HTMLElement,
  onStateChange: (state: GraphicsState) => void,
  callbacks: ViewportCallbacks = {},
): Viewport {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Interactive contribution city. Drag to rotate, scroll to zoom. Use arrow keys to rotate, Shift and arrows to pan, plus and minus to zoom, and zero to reset.');
  canvas.tabIndex = 0;
  let renderer: WebGLRenderer;
  try {
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!context) { onStateChange('unavailable'); return unavailableViewport(); }
    renderer = new WebGLRenderer({ canvas, context, antialias: true });
  } catch {
    onStateChange('unavailable');
    return unavailableViewport();
  }

  host.prepend(canvas);
  const scene = new Scene();
  const sky = createSky();
  scene.add(sky);
  const camera = new PerspectiveCamera(42, 1, 0.05, 1000);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controls = createCameraController(camera, canvas, () => motionPreference.matches);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let city: CityData | null = null;
  let cityScene: CityScene | null = null;
  let contextLost = false;
  let disposed = false;
  let frameId = 0;
  let previousTime = performance.now();
  let riseStarted = previousTime;
  let picked: number | null = null;
  let pinnedPoint: { x: number; y: number } | null = null;
  let hoverPoint: { x: number; y: number } | null = null;
  let pointerDown: { x: number; y: number } | null = null;
  const pressedPointers = new Set<number>();
  let multiplePointers = false;
  let pickDirty = false;
  let lastPickTime = 0;
  let averageFrameMs = 0;
  let lastZoom = -1;

  const pick = (point: { x: number; y: number }, pin = false) => {
    if (!cityScene || !city) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((point.x - rect.left) / rect.width * 2 - 1, -(point.y - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const result = raycaster.intersectObject(cityScene.buildings, false)[0];
    const index = result?.instanceId ?? null;
    if (pin && pinnedPoint && index === picked) { hoverPoint = null; clearPick(); return; }
    pinnedPoint = pin && index !== null ? point : null;
    if (picked !== index) { picked = index; cityScene.highlight(index); }
    controls.pause(index !== null);
    callbacks.onPick?.(index === null ? null : city.days[index]!, point, pinnedPoint !== null);
  };
  const clearPick = () => {
    picked = null;
    pinnedPoint = null;
    cityScene?.highlight(null);
    controls.pause(false);
    callbacks.onPick?.(null, { x: 0, y: 0 });
  };
  const render = () => {
    if (disposed || contextLost) return;
    try { renderer.render(scene, camera); }
    catch { contextLost = true; onStateChange('unavailable'); }
  };
  const animate = (now: number) => {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    const elapsedMs = Math.max(0, now - previousTime);
    const dt = Math.min(0.1, elapsedMs / 1000);
    previousTime = now;
    if (contextLost || document.hidden) return;
    averageFrameMs = averageFrameMs ? averageFrameMs * 0.96 + elapsedMs * 0.04 : elapsedMs;
    controls.update(dt, now);
    cityScene?.update(motionPreference.matches ? 1 : Math.min(1, (now - riseStarted) / 1200), camera, host.clientHeight);
    if (!pinnedPoint && hoverPoint && !controls.isInteracting() && (pickDirty || now - lastPickTime > 90)) {
      pick(hoverPoint); pickDirty = false; lastPickTime = now;
    }
    const zoom = controls.zoomLevel();
    if (Math.abs(zoom - lastZoom) > 0.01) { callbacks.onZoom?.(zoom); lastZoom = zoom; }
    render();
  };
  let framedWidth = 0;
  let framedHeight = 0;
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (cityScene && (framedWidth !== width || framedHeight !== height)) {
      const { width: w, depth, maxHeight } = cityScene.layout;
      controls.fit(w, depth, maxHeight, true);
      framedWidth = width; framedHeight = height;
    }
    pickDirty = true; render();
    if (pinnedPoint && picked !== null && city) callbacks.onPick?.(city.days[picked]!, pinnedPoint, true);
  };
  const onContextLost = (event: Event) => { event.preventDefault(); contextLost = true; onStateChange('lost'); };
  const onContextRestored = () => { contextLost = false; resize(); onStateChange('ready'); };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || controls.isInteracting()) {
      hoverPoint = null;
      if (controls.isInteracting()) clearPick();
      return;
    }
    hoverPoint = { x: event.clientX, y: event.clientY }; pickDirty = true;
  };
  const onDown = (event: PointerEvent) => {
    if (pressedPointers.size === 0) multiplePointers = false;
    pressedPointers.add(event.pointerId);
    if (pressedPointers.size > 1) multiplePointers = true;
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const onUp = (event: PointerEvent) => {
    pressedPointers.delete(event.pointerId);
    if (!multiplePointers && !pressedPointers.size && pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 6) pick({ x: event.clientX, y: event.clientY }, true);
    pointerDown = null;
  };
  const onCancel = (event: PointerEvent) => { pressedPointers.delete(event.pointerId); pointerDown = null; };
  const onVisibility = () => { previousTime = performance.now(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { hoverPoint = null; clearPick(); } };
  const onLeave = (event: PointerEvent) => { if (event.pointerType === 'mouse') { hoverPoint = null; if (!pinnedPoint) clearPick(); } };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerleave', onLeave);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize(); frameId = requestAnimationFrame(animate); onStateChange('ready');

  return {
    render,
    load: (data) => {
      clearPick();
      if (cityScene) { scene.remove(cityScene.group); cityScene.dispose(); }
      city = data; cityScene = createCityScene(data); scene.add(cityScene.group);
      controls.fit(cityScene.layout.width, cityScene.layout.depth, cityScene.layout.maxHeight);
      framedWidth = Math.max(1, host.clientWidth); framedHeight = Math.max(1, host.clientHeight);
      riseStarted = performance.now();
      cityScene.update(motionPreference.matches ? 1 : 0, camera, host.clientHeight); render();
    },
    filter: (id) => cityScene?.setFilter(id),
    recolor: (id, color) => cityScene?.setColor(id, color),
    zoom: (factor) => controls.zoom(factor), reset: controls.reset, autoRotate: controls.setAutoRotate,
    clearSelection: () => { hoverPoint = null; clearPick(); canvas.focus({ preventScroll: true }); },
    exportPng: () => new Promise((resolve, reject) => {
      if (contextLost || disposed) { reject(new Error('The graphics view is unavailable.')); return; }
      render();
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not export this view.')), 'image/png');
    }),
    diagnostics: () => ({ ...cityScene?.counts(), drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, frameMs: averageFrameMs,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    dispose: () => {
      disposed = true; cancelAnimationFrame(frameId); observer.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerleave', onLeave);
      controls.dispose(); cityScene?.dispose(); sky.geometry.dispose();
      (sky.material as { dispose: () => void }).dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
