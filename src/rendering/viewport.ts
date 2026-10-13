import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { CityData, ContributionDay } from '../data/types.ts';
import { createCameraController } from '../interaction/camera.ts';
import { createCityScene } from './city-scene.ts';
import type { CityScene } from './city-scene.ts';
import { createRepositoryScene } from './repository-scene.ts';
import type { RepositoryScene } from './repository-scene.ts';
import type { RepoBuilding } from './repository-layout.ts';
import { createCitySky } from './sky.ts';
import { CITY_THEMES } from './themes.ts';
import { createFlightController } from '../interaction/flight-controller.ts';
import type { FlightStatus } from '../interaction/flight-controller.ts';
import { loadMapWorld } from './world-loader.ts';
import type { MapWorld } from './world-types.ts';

export type CityView = 'repositories' | 'calendar';

export type GraphicsState = 'ready' | 'loading' | 'unavailable' | 'lost';
export interface ViewportCallbacks {
  onPick?: (
    day: ContributionDay | null,
    point: { x: number; y: number },
    pinned?: boolean,
  ) => void;
  onZoom?: (zoom: number) => void;
  onRepositoryPick?: (
    building: RepoBuilding | null,
    point: { x: number; y: number },
    pinned?: boolean,
  ) => void;
  onFlightStatus?: (status: FlightStatus) => void;
  onOrbitChange?: (enabled: boolean) => void;
  onNotice?: (message: string) => void;
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
  setView: (view: CityView) => void;
  setTheme: (index: number) => void;
  fly: (enabled: boolean) => void;
  pauseFlight: () => void;
  boost: (enabled: boolean) => void;
  brake: (enabled: boolean) => void;
  throttle: (speed: number) => void;
  focusRepository: (id: string) => void;
  exportPng: () => Promise<Blob>;
  diagnostics: () => Record<string, number>;
  dispose: () => void;
}

const unavailableViewport = (): Viewport => ({
  render: () => {},
  load: () => {},
  filter: () => {},
  recolor: () => {},
  zoom: () => {},
  reset: () => {},
  clearSelection: () => {},
  autoRotate: () => {},
  setView: () => {},
  setTheme: () => {},
  fly: () => {},
  pauseFlight: () => {},
  boost: () => {},
  brake: () => {},
  throttle: () => {},
  focusRepository: () => {},
  exportPng: () =>
    Promise.reject(new Error('PNG export requires a working WebGL view.')),
  diagnostics: () => ({}),
  dispose: () => {},
});

export function createViewport(
  host: HTMLElement,
  onStateChange: (state: GraphicsState) => void,
  callbacks: ViewportCallbacks = {},
): Viewport {
  const canvas = document.createElement('canvas');
  canvas.setAttribute(
    'aria-label',
    'Interactive contribution city. Drag to rotate, scroll to zoom. Use arrow keys to rotate, Shift and arrows to pan, plus and minus to zoom, and zero to reset.',
  );
  canvas.tabIndex = 0;
  let renderer: WebGLRenderer;
  try {
    const context = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
    });
    if (!context) {
      onStateChange('unavailable');
      return unavailableViewport();
    }
    renderer = new WebGLRenderer({
      canvas,
      context,
      antialias: true,
      logarithmicDepthBuffer: true,
    });
  } catch {
    onStateChange('unavailable');
    return unavailableViewport();
  }

  host.prepend(canvas);
  const scene = new Scene();
  const sky = createCitySky();
  scene.add(sky.mesh);
  const ambient = new AmbientLight('#40a060', 1.65),
    sun = new DirectionalLight('#70d090', 2.625),
    fill = new DirectionalLight('#20a080', 1.05),
    hemi = new HemisphereLight('#50b068', '#183020', 1.75);
  sun.position.set(300, 100, -250);
  fill.position.set(-200, 60, 200);
  scene.add(ambient, sun, fill, hemi);
  scene.fog = new Fog(CITY_THEMES[0]!.fog, 400, 3500);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.info.autoReset = false;
  const camera = new PerspectiveCamera(55, 1, 0.1, 10000);
  const composer = new EffectComposer(renderer),
    bloom = new UnrealBloomPass(new Vector2(1, 1), 1.5, 0.45, 0.5);
  const renderPass = new RenderPass(scene, camera),
    outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(outputPass);
  const motionPreference = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  const controls = createCameraController(
    camera,
    canvas,
    () => motionPreference.matches,
    (point) => {
      if (view !== 'repositories' || !cityScene) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((point.x - rect.left) / rect.width) * 2 - 1,
        (-(point.y - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return (
        raycaster
          .intersectObject(cityScene.buildings, false)[0]
          ?.point.clone() ?? null
      );
    },
    () => {
      orbitAutoRotate = false;
      callbacks.onOrbitChange?.(false);
    },
  );
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let city: CityData | null = null;
  let cityScene: CityScene | RepositoryScene | null = null;
  let view: CityView = 'repositories',
    themeIndex = 0,
    orbitAutoRotate = true;
  let world: MapWorld | null = null,
    mapFailed = false;
  const mapRequest = new AbortController();
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
  const exitFlight = () => {
    if (!flight.status().active) return;
    flight.stop();
    controls.setEnabled(true);
    controls.adopt(flight.simulation.position);
    controls.reset();
    controls.pause(false);
    controls.setAutoRotate(orbitAutoRotate);
    clearPick();
    canvas.focus({ preventScroll: true });
  };
  const flight = createFlightController(
    camera,
    canvas,
    (status) => callbacks.onFlightStatus?.(status),
    (paused) => {
      controls.setEnabled(paused);
      if (paused) {
        controls.adopt(flight.simulation.position);
        controls.setAutoRotate(false);
      }
      controls.pause(paused);
    },
    exitFlight,
    () => motionPreference.matches,
  );
  scene.add(flight.craft, flight.trail);
  const selection = (
    index: number | null,
    point: { x: number; y: number },
    pinned = false,
  ) => {
    if (view === 'repositories')
      callbacks.onRepositoryPick?.(
        index === null
          ? null
          : (cityScene as RepositoryScene).layout.buildings[index]!,
        point,
        pinned,
      );
    else
      callbacks.onPick?.(
        index === null ? null : city!.days[index]!,
        point,
        pinned,
      );
  };

  const pick = (point: { x: number; y: number }, pin = false) => {
    if (!cityScene || !city) return;
    if (flight.status().active && !flight.status().paused) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((point.x - rect.left) / rect.width) * 2 - 1,
      (-(point.y - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const result = raycaster.intersectObject(cityScene.buildings, false)[0];
    const index = result?.instanceId ?? null;
    if (pin && pinnedPoint && index === picked) {
      hoverPoint = null;
      clearPick();
      return;
    }
    pinnedPoint = pin && index !== null ? point : null;
    if (picked !== index) {
      picked = index;
      cityScene.highlight(index);
    }
    controls.pause(index !== null);
    selection(index, point, pinnedPoint !== null);
  };
  const clearPick = () => {
    picked = null;
    pinnedPoint = null;
    cityScene?.highlight(null);
    controls.pause(false);
    callbacks.onPick?.(null, { x: 0, y: 0 });
    callbacks.onRepositoryPick?.(null, { x: 0, y: 0 });
  };
  const render = () => {
    if (disposed || contextLost) return;
    try {
      renderer.info.reset();
      composer.render();
    } catch {
      contextLost = true;
      onStateChange('unavailable');
    }
  };
  const animate = (now: number) => {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    const elapsedMs = Math.max(0, now - previousTime);
    const dt = Math.min(0.1, elapsedMs / 1000);
    previousTime = now;
    if (contextLost || document.hidden) return;
    averageFrameMs = averageFrameMs
      ? averageFrameMs * 0.96 + elapsedMs * 0.04
      : elapsedMs;
    const flying = flight.status();
    if (flying.active && !flying.paused) flight.update(dt);
    else {
      if (!flying.active) {
        const targetFov = 55;
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * dt));
        camera.updateProjectionMatrix();
      }
      controls.update(dt, now);
    }
    const rise = motionPreference.matches
      ? 1
      : Math.min(1, (now - riseStarted) / 1200);
    if (view === 'repositories')
      (cityScene as RepositoryScene | null)?.update(
        rise,
        camera,
        host.clientHeight,
        dt,
        motionPreference.matches,
      );
    else
      (cityScene as CityScene | null)?.update(rise, camera, host.clientHeight);
    if (
      !pinnedPoint &&
      hoverPoint &&
      !controls.isInteracting() &&
      (pickDirty || now - lastPickTime > 90)
    ) {
      pick(hoverPoint);
      pickDirty = false;
      lastPickTime = now;
    }
    const zoom = controls.zoomLevel();
    if (Math.abs(zoom - lastZoom) > 0.01) {
      callbacks.onZoom?.(zoom);
      lastZoom = zoom;
    }
    render();
  };
  let framedWidth = 0;
  let framedHeight = 0;
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      view === 'repositories' ? 1.25 : 2,
    );
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (
      cityScene &&
      !flight.status().active &&
      (framedWidth !== width || framedHeight !== height)
    ) {
      const { width: w, depth, maxHeight } = cityScene.layout;
      if (view === 'repositories')
        controls.setHome(
          new Vector3(-800, 700, -1000),
          new Vector3(0, 70, 0),
          true,
        );
      else controls.fit(w, depth, maxHeight, true);
      framedWidth = width;
      framedHeight = height;
    }
    camera.far = Math.max(10000, camera.far);
    camera.updateProjectionMatrix();
    pickDirty = true;
    render();
    if (pinnedPoint && picked !== null && city)
      selection(picked, pinnedPoint, true);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    flight.pause(true);
    contextLost = true;
    onStateChange('lost');
  };
  const onContextRestored = () => {
    contextLost = false;
    resize();
    onStateChange('ready');
  };
  const onMove = (event: PointerEvent) => {
    if (flight.status().active && !flight.status().paused) return;
    if (event.pointerType !== 'mouse' || controls.isInteracting()) {
      hoverPoint = null;
      if (controls.isInteracting()) clearPick();
      return;
    }
    hoverPoint = { x: event.clientX, y: event.clientY };
    pickDirty = true;
  };
  const onDown = (event: PointerEvent) => {
    if (pressedPointers.size === 0) multiplePointers = false;
    pressedPointers.add(event.pointerId);
    if (pressedPointers.size > 1) multiplePointers = true;
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const onUp = (event: PointerEvent) => {
    pressedPointers.delete(event.pointerId);
    if (
      event.button === 0 &&
      (!flight.status().active || flight.status().paused) &&
      !multiplePointers &&
      !pressedPointers.size &&
      pointerDown &&
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <
        6
    )
      pick({ x: event.clientX, y: event.clientY }, true);
    pointerDown = null;
  };
  const onCancel = (event: PointerEvent) => {
    pressedPointers.delete(event.pointerId);
    pointerDown = null;
  };
  const onVisibility = () => {
    previousTime = performance.now();
    if (document.hidden) {
      flight.pause(true);
      pressedPointers.clear();
      pointerDown = null;
      multiplePointers = false;
    }
  };
  const onLostCapture = (event: PointerEvent) => {
    if (event.buttons !== 0) onCancel(event);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      hoverPoint = null;
      clearPick();
    }
  };
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      hoverPoint = null;
      if (!pinnedPoint) clearPick();
    }
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('lostpointercapture', onLostCapture);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerleave', onLeave);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  frameId = requestAnimationFrame(animate);
  onStateChange('ready');

  const load = (data: CityData) => {
    if (view === 'repositories' && !world && !mapFailed) {
      city = data;
      onStateChange('loading');
      return;
    }
    exitFlight();
    clearPick();
    if (cityScene) {
      scene.remove(cityScene.group);
      cityScene.dispose();
    }
    city = data;
    cityScene =
      view === 'repositories'
        ? createRepositoryScene(data, themeIndex, world)
        : createCityScene(data);
    scene.add(cityScene.group);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    if (view === 'repositories')
      controls.setHome(new Vector3(-800, 700, -1000), new Vector3(0, 70, 0));
    else
      controls.fit(
        cityScene.layout.width,
        cityScene.layout.depth,
        cityScene.layout.maxHeight,
      );
    camera.far = Math.max(10000, camera.far);
    camera.updateProjectionMatrix();
    framedWidth = Math.max(1, host.clientWidth);
    framedHeight = Math.max(1, host.clientHeight);
    riseStarted = performance.now();
    cityScene.update(
      motionPreference.matches ? 1 : 0,
      camera,
      host.clientHeight,
    );
    resize();
    render();
    onStateChange('ready');
  };
  void loadMapWorld(mapRequest.signal)
    .then((result) => {
      if (disposed) return;
      world = result;
      if (city && view === 'repositories') load(city);
    })
    .catch(() => {
      if (disposed) return;
      mapFailed = true;
      if (city && view === 'repositories') load(city);
      callbacks.onNotice?.(
        'The reference map could not load. Showing the fallback city; reload to try the map again.',
      );
    });

  return {
    render,
    load,
    filter: (id) => cityScene?.setFilter(id),
    recolor: (id, color) => cityScene?.setColor(id, color),
    zoom: (factor) => controls.zoom(factor),
    reset: controls.reset,
    autoRotate: (enabled) => {
      orbitAutoRotate = enabled;
      controls.setAutoRotate(enabled);
    },
    setView: (next) => {
      if (next !== view) {
        view = next;
        if (city) load(city);
      }
    },
    setTheme: (index) => {
      if (!CITY_THEMES[index]) return;
      themeIndex = index;
      sky.setTheme(index);
      scene.fog = new Fog(CITY_THEMES[index]!.fog, 400, 3500);
      ambient.color.set(['#40a060', '#4060b0', '#e0a080', '#8040c0'][index]!);
      ambient.intensity = [0.55, 0.55, 0.7, 0.6][index]! * 3;
      sun.color.set(['#70d090', '#7090d0', '#f0b070', '#c050e0'][index]!);
      sun.intensity = [0.75, 0.75, 1, 0.85][index]! * 3.5;
      sun.position.fromArray(
        [
          [300, 100, -250],
          [300, 120, -200],
          [400, 120, -300],
          [300, 100, -200],
        ][index]!,
      );
      fill.color.set(['#20a080', '#304080', '#6050a0', '#00c0d0'][index]!);
      fill.intensity = [0.35, 0.3, 0.35, 0.4][index]! * 3;
      fill.position.fromArray(
        [
          [-200, 60, 200],
          [-200, 60, 200],
          [-200, 80, 200],
          [-250, 60, 200],
        ][index]!,
      );
      hemi.color.set(['#50b068', '#5080a0', '#d09080', '#9040d0'][index]!);
      hemi.groundColor.set(
        ['#183020', '#202830', '#4a2828', '#201028'][index]!,
      );
      hemi.intensity = [0.5, 0.5, 0.55, 0.5][index]! * 3.5;
      scene.background = new Color(CITY_THEMES[index]!.fog);
      if (view === 'repositories')
        (cityScene as RepositoryScene | null)?.setTheme(index);
      render();
    },
    fly: (enabled) => {
      if (enabled) {
        if (
          !cityScene ||
          flight.status().active ||
          (view === 'repositories' && !world && !mapFailed)
        )
          return;
        clearPick();
        controls.setEnabled(false);
        flight.start(
          view === 'repositories'
            ? ((cityScene as RepositoryScene).flightRadius ??
                Math.hypot(cityScene.layout.width, cityScene.layout.depth) / 2)
            : Math.hypot(cityScene.layout.width, cityScene.layout.depth) / 2,
        );
      } else exitFlight();
    },
    pauseFlight: () => flight.pause(!flight.status().paused),
    boost: flight.boost,
    brake: flight.brake,
    throttle: flight.throttle,
    focusRepository: (id) => {
      if (view !== 'repositories' || !cityScene) return;
      const building = (cityScene as RepositoryScene).layout.buildings.find(
        (b) => b.id === id,
      );
      if (!building) return;
      exitFlight();
      picked = building.index;
      const rect = canvas.getBoundingClientRect();
      pinnedPoint = {
        x: rect.left + rect.width * 0.6,
        y: rect.top + rect.height * 0.2,
      };
      cityScene.highlight(picked);
      controls.pause(true);
      callbacks.onRepositoryPick?.(building, pinnedPoint, true);
      controls.focus(
        new Vector3(building.x, building.height * 0.45, building.z),
        Math.max(
          60,
          building.height * 0.85,
          building.width * 4,
          building.depth * 4,
        ),
      );
    },
    clearSelection: () => {
      hoverPoint = null;
      clearPick();
      canvas.focus({ preventScroll: true });
    },
    exportPng: () =>
      new Promise((resolve, reject) => {
        if (contextLost || disposed) {
          reject(new Error('The graphics view is unavailable.'));
          return;
        }
        render();
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('Could not export this view.')),
          'image/png',
        );
      }),
    diagnostics: () => ({
      ...cityScene?.counts(),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frameMs: averageFrameMs,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    }),
    dispose: () => {
      disposed = true;
      mapRequest.abort();
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      flight.dispose();
      cityScene?.dispose();
      sky.dispose();
      bloom.dispose();
      renderPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
