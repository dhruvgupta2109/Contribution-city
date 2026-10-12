import * as THREE from 'three';
import { BUILDING, CELL, createLayout, FLOOR, SLAB, STREET } from './layout';
import { hash, type CityData } from '../data/types';

interface GlowInstance { day: number; repo: number; dark: boolean }
export interface CityCallbacks {
  hover: (index: number | null, x: number, y: number) => void;
  zoom: (zoom: number) => void;
}

const scratch = new THREE.Object3D();
const color = new THREE.Color();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function instances(geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}
function matrix(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0) {
  scratch.position.set(x, y, z); scratch.scale.set(sx, sy, sz); scratch.rotation.set(0, yaw, 0); scratch.updateMatrix();
  mesh.setMatrixAt(index, scratch.matrix);
}

export class CityRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1000);
  readonly scene = new THREE.Scene();
  private skyScene = new THREE.Scene();
  private skyCamera = new THREE.Camera();
  private skyMaterial: THREE.ShaderMaterial;
  private city = new THREE.Group();
  private data!: CityData;
  private layout!: ReturnType<typeof createLayout>;
  private body!: THREE.InstancedMesh;
  private windows!: THREE.InstancedMesh;
  private bands!: THREE.InstancedMesh;
  private roofs!: THREE.InstancedMesh;
  private windowData: GlowInstance[] = [];
  private bandData: GlowInstance[] = [];
  private roofData: GlowInstance[] = [];
  private highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#e5e9ff', transparent: true, opacity: .92, depthTest: false }));
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private target = new THREE.Vector3();
  private yaw = .34;
  private elevation = .73;
  private zoomLevel = 1;
  private baseSize = 32;
  private width = 1;
  private height = 1;
  private filter: number | null = null;
  private hovered: number | null = null;
  private lastInteraction = -Infinity;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private animationStart = 0;
  private riseUniform = { value: 10 };
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number } | null = null;
  private moved = false;
  private panMode = false;
  private lastFrame = 0;
  private frame = 0;
  private stopped = false;
  private dirty = true;
  private observer: ResizeObserver;
  private lastHoverPosition = { x: 0, y: 0 };

  constructor(private host: HTMLElement, private callbacks: CityCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.domElement.className = 'city-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.setAttribute('aria-label', 'Interactive contribution city. Arrow keys rotate and tilt. Shift and arrow keys pan. Plus and minus zoom. Zero resets.');
    this.host.prepend(this.renderer.domElement);
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: { aspect: { value: 1 } }, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float aspect;
        float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
        void main() {
          vec3 top=vec3(.031,.043,.112); vec3 mid=vec3(.108,.082,.218); vec3 horizon=vec3(.32,.169,.255);
          vec3 sky=mix(horizon,mid,smoothstep(.02,.63,vUv.y)); sky=mix(sky,top,smoothstep(.40,1.,vUv.y));
          vec2 p=vUv*vec2(aspect,1.); vec2 grid=p*72.; vec2 cell=floor(grid); vec2 local=fract(grid);
          float random=hash(cell); vec2 center=vec2(hash(cell+17.),hash(cell+39.));
          float star=(1.-smoothstep(.0,.07,length(local-center)))*step(.986,random)*smoothstep(.30,.75,vUv.y);
          float glow=exp(-length(p-vec2(aspect*.55,.16))*2.8)*.026;
          sky+=vec3(glow,glow*.55,glow*.8)+vec3(.48,.51,.66)*star;
          gl_FragColor=vec4(sky,1.);
        }`,
    });
    this.skyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMaterial));
    this.scene.add(this.city, this.highlight);
    this.highlight.visible = false;
    this.highlight.renderOrder = 10;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.bindControls();
    this.reducedMotion.addEventListener('change', () => { this.riseUniform.value = 10; this.dirty = true; });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.stopped = true;
      this.host.dispatchEvent(new CustomEvent('city-error', { detail: 'The 3D graphics context was interrupted. Reload the page to restore the city.' }));
    });
    this.resize();
    this.tick(0);
  }

  load(data: CityData) {
    this.disposeCity();
    this.data = data;
    this.layout = createLayout(data.days);
    this.windowData = []; this.bandData = []; this.roofData = [];
    this.filter = null; this.hovered = null; this.highlight.visible = false;
    this.callbacks.hover(null, 0, 0);
    this.makeGround();
    this.makeBuildings();
    this.animationStart = performance.now();
    this.riseUniform.value = this.reducedMotion.matches ? 10 : 0;
    this.reset();
    this.updateColors();
    this.dirty = true;
  }

  private riseMaterial(material: THREE.MeshBasicMaterial, days: number[]) {
    const geometryDelay = new Float32Array(days.map(i => hash(i * 19) * .55));
    material.onBeforeCompile = shader => {
      shader.uniforms.uRise = this.riseUniform;
      shader.vertexShader = 'uniform float uRise; attribute float riseDelay;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        float p = clamp((uRise-riseDelay)/1.25,0.,1.);
        mvPosition.y *= 1.-pow(1.-p,3.);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
    };
    return new THREE.InstancedBufferAttribute(geometryDelay, 1);
  }

  private makeGround() {
    const { width, depth, streets, avenue, weeks } = this.layout;
    const asphalt = new THREE.Mesh(new THREE.BoxGeometry(width + 3, .24, depth + 2.5), new THREE.MeshBasicMaterial({ color: '#151c35' }));
    asphalt.position.y = -.16;
    this.city.add(asphalt);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(asphalt.geometry), new THREE.LineBasicMaterial({ color: '#59627f', transparent: true, opacity: .3 }));
    edge.position.copy(asphalt.position); this.city.add(edge);
    const blocks = Math.ceil(weeks / 4);
    const lots = instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#25304a' }), blocks * 2);
    for (let b = 0; b < blocks; b++) {
      const blockWeeks = Math.min(4, weeks - b * 4);
      const x = b * (4 * CELL + STREET) + blockWeeks * CELL / 2 - width / 2;
      matrix(lots, b * 2, x, -.018, 2 * CELL - depth / 2, blockWeeks * CELL - .14, .045, 4 * CELL - .15);
      matrix(lots, b * 2 + 1, x, -.018, 5.5 * CELL + STREET - depth / 2, blockWeeks * CELL - .14, .045, 3 * CELL - .15);
    }
    this.city.add(lots);
    const dashPositions: [number, number, boolean][] = [];
    for (const x of streets) for (let z = -depth / 2 - .65; z < depth / 2 + .65; z += .7) {
      if (Math.abs(z - avenue) > .73) dashPositions.push([x, z, false]);
    }
    for (let x = -width / 2 - .65; x < width / 2 + .65; x += .75) {
      if (streets.every(s => Math.abs(s - x) > .76)) dashPositions.push([x, avenue, true]);
    }
    const markings = instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#bc9b62' }), dashPositions.length);
    dashPositions.forEach(([x, z, horizontal], i) => matrix(markings, i, x, -.01, z, horizontal ? .34 : .045, .015, horizontal ? .045 : .32));
    this.city.add(markings);
    // Subtle pool of light beneath each lot gives the city a grounded silhouette.
    const foundations = instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#11182f' }), this.data.days.length);
    this.layout.lots.forEach((lot, i) => matrix(foundations, i, lot.x, .025, lot.z, BUILDING + .15, .045, BUILDING + .15));
    this.city.add(foundations);
  }

  private makeBuildings() {
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    const faceColors = ['#202b58', '#141c3d', '#3b4874', '#172040', '#2a3666', '#19234b'];
    const vertices = new Float32Array(bodyGeo.attributes.position.count * 3);
    for (let i = 0; i < bodyGeo.attributes.position.count; i++) {
      color.set(faceColors[Math.floor(i / 4)]); color.toArray(vertices, i * 3);
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(vertices, 3));
    const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    bodyGeo.setAttribute('riseDelay', this.riseMaterial(bodyMat, this.data.days.map((_, i) => i)));
    this.body = instances(bodyGeo, bodyMat, this.data.days.length);
    this.layout.lots.forEach((lot, i) => matrix(this.body, i, lot.x, lot.height / 2, lot.z, BUILDING, lot.height, BUILDING));
    this.city.add(this.body);

    let floors = 0, segments = 0;
    this.data.days.forEach(day => { floors += day.count; segments += day.segments.length; });
    const windowCount = floors * 12;
    this.windows = instances(new THREE.BoxGeometry(.13, .12, .013), new THREE.MeshBasicMaterial({ toneMapped: false }), windowCount);
    this.bands = instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), segments * 4);
    this.roofs = instances(new THREE.BoxGeometry(.22, .016, .22), new THREE.MeshBasicMaterial({ toneMapped: false }), this.data.days.filter(day => day.count > 0).length);
    this.data.days.forEach((day, dayIndex) => {
      const lot = this.layout.lots[dayIndex];
      let floor = 0;
      day.segments.forEach(segment => {
        for (let f = floor; f < floor + segment.count; f++) {
          for (let face = 0; face < 4; face++) for (let w = 0; w < 3; w++) {
            const perpendicular = (w - 1) * .235;
            const side = BUILDING / 2 + .009;
            const x = face === 0 ? perpendicular : face === 1 ? side : face === 2 ? -perpendicular : -side;
            const z = face === 0 ? side : face === 1 ? -perpendicular : face === 2 ? -side : perpendicular;
            const index = this.windowData.length;
            matrix(this.windows, index, lot.x + x, SLAB + (f + .5) * FLOOR, lot.z + z, 1, 1, 1, face * Math.PI / 2);
            this.windowData.push({ day: dayIndex, repo: segment.repoIndex, dark: hash(dayIndex * 7919 + f * 97 + face * 7 + w) < .12 });
          }
        }
        for (let face = 0; face < 4; face++) {
          const index = this.bandData.length;
          const side = BUILDING / 2 + .008;
          matrix(this.bands, index, lot.x + (face === 1 ? side : face === 3 ? -side : 0), SLAB + (floor + segment.count / 2) * FLOOR, lot.z + (face === 0 ? side : face === 2 ? -side : 0), BUILDING * .83, segment.count * FLOOR * .93, .012, face * Math.PI / 2);
          this.bandData.push({ day: dayIndex, repo: segment.repoIndex, dark: false });
        }
        floor += segment.count;
      });
      if (day.count > 0) {
        matrix(this.roofs, this.roofData.length, lot.x, lot.height + .012, lot.z);
        this.roofData.push({ day: dayIndex, repo: day.segments.at(-1)!.repoIndex, dark: false });
      }
    });
    [this.windows, this.bands, this.roofs].forEach((mesh, i) => {
      const metadata = [this.windowData, this.bandData, this.roofData][i];
      mesh.geometry.setAttribute('riseDelay', this.riseMaterial(mesh.material as THREE.MeshBasicMaterial, metadata.map(w => w.day)));
      this.city.add(mesh);
    });
  }

  isolate(repo: number | null) { this.filter = repo; this.updateColors(); this.dirty = true; }
  recolor(repo: number, hex: string) { this.data.repos[repo].color = hex; this.updateColors(); this.dirty = true; }

  private updateColors() {
    if (!this.body) return;
    this.data.days.forEach((day, i) => {
      const relevant = this.filter === null || day.segments.some(s => s.repoIndex === this.filter);
      this.body.setColorAt(i, color.set(relevant ? '#ffffff' : '#555b74'));
    });
    this.body.instanceColor!.needsUpdate = true;
    [this.windows, this.bands, this.roofs].forEach((mesh, i) => {
      const metadata = [this.windowData, this.bandData, this.roofData][i];
      metadata.forEach((item, index) => {
        const lit = !item.dark && (this.filter === null || this.filter === item.repo);
        color.set(lit ? this.data.repos[item.repo].color : '#16203b');
        if (lit) color.multiplyScalar(i === 1 ? .55 : 1.25);
        mesh.setColorAt(index, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  private resize() {
    this.width = this.host.clientWidth; this.height = this.host.clientHeight;
    if (!this.width || !this.height) return;
    this.renderer.setSize(this.width, this.height);
    this.skyMaterial.uniforms.aspect.value = this.width / this.height;
    this.fitFrustum(); this.dirty = true;
  }

  private fitFrustum() {
    const aspect = this.width / this.height;
    // Fit the long city island, while leaving breathing room for the interface.
    this.baseSize = this.layout ? Math.max(25, (this.layout.width + 8) / aspect * .55) : 32;
    this.camera.left = -this.baseSize * aspect;
    this.camera.right = this.baseSize * aspect;
    this.camera.top = this.baseSize;
    this.camera.bottom = -this.baseSize;
    this.camera.zoom = this.zoomLevel;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }

  private updateCamera() {
    const distance = 150;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.elevation) * distance,
      this.target.y + Math.sin(this.elevation) * distance,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.elevation) * distance,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    if (this.windows) {
      const floorPixels = FLOOR * Math.cos(this.elevation) * this.height / (this.baseSize * 2) * this.zoomLevel;
      this.windows.visible = floorPixels >= 2.2;
      this.bands.visible = !this.windows.visible;
    }
    this.dirty = true;
  }

  private screenGround(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(groundPlane, point) ? point : null;
  }

  zoomBy(factor: number, x?: number, y?: number) {
    this.interact();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = x ?? rect.left + this.width / 2, py = y ?? rect.top + this.height / 2;
    const before = this.screenGround(px, py);
    this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel * factor, .4, 16);
    this.camera.zoom = this.zoomLevel; this.camera.updateProjectionMatrix();
    const after = this.screenGround(px, py);
    if (before && after) { this.target.x += before.x - after.x; this.target.z += before.z - after.z; }
    this.updateCamera(); this.callbacks.zoom(this.zoomLevel);
    this.refreshHover();
  }

  reset() {
    this.target.set(0, 1.4, 0); this.yaw = .34; this.elevation = .73; this.zoomLevel = 1;
    this.fitFrustum(); this.callbacks.zoom(1); this.interact();
  }

  private interact() { this.lastInteraction = performance.now(); }
  private pan(dx: number, dy: number) {
    const scale = this.baseSize * 2 / this.height / this.zoomLevel;
    this.target.x += (-dx * Math.cos(this.yaw) + dy * Math.sin(this.yaw) / Math.sin(this.elevation)) * scale;
    this.target.z += (dx * Math.sin(this.yaw) + dy * Math.cos(this.yaw) / Math.sin(this.elevation)) * scale;
    this.updateCamera();
  }

  private pick(x: number, y: number) {
    if (!this.body || this.riseUniform.value < 1.8) return;
    this.lastHoverPosition = { x, y };
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.body, false);
    this.hovered = hits[0]?.instanceId ?? null;
    this.highlight.visible = this.hovered !== null;
    this.renderer.domElement.classList.toggle('is-hovering', this.hovered !== null);
    if (this.hovered !== null) {
      const lot = this.layout.lots[this.hovered];
      this.highlight.position.set(lot.x, lot.height / 2, lot.z);
      this.highlight.scale.set(BUILDING + .012, lot.height + .012, BUILDING + .012);
    }
    this.callbacks.hover(this.hovered, x - rect.left, y - rect.top);
    this.dirty = true;
  }

  private refreshHover() {
    if (this.hovered !== null && !this.pointers.size) this.pick(this.lastHoverPosition.x, this.lastHoverPosition.y);
  }

  private clearHover() {
    this.hovered = null; this.highlight.visible = false; this.callbacks.hover(null, 0, 0);
    this.renderer.domElement.classList.remove('is-hovering'); this.dirty = true;
  }

  private bindControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * .0018), e.clientX, e.clientY); }, { passive: false });
    canvas.addEventListener('dblclick', e => { e.preventDefault(); this.zoomBy(2.2, e.clientX, e.clientY); });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 2) return;
      this.interact(); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
      this.dragStart = { x: e.clientX, y: e.clientY }; this.moved = false; this.panMode = e.shiftKey || e.button === 2;
      canvas.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', e => {
      const previous = this.pointers.get(e.pointerId);
      if (!previous) { if (e.pointerType === 'mouse') this.pick(e.clientX, e.clientY); return; }
      this.interact();
      if (this.dragStart && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 4) this.moved = true;
      if (this.pointers.size >= 2) {
        this.moved = true; this.clearHover();
        const oldPoints = [...this.pointers.values()].slice(0, 2);
        const oldDistance = Math.hypot(oldPoints[0].x - oldPoints[1].x, oldPoints[0].y - oldPoints[1].y);
        const oldCenter = { x: (oldPoints[0].x + oldPoints[1].x) / 2, y: (oldPoints[0].y + oldPoints[1].y) / 2 };
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const newPoints = [...this.pointers.values()].slice(0, 2);
        const newDistance = Math.hypot(newPoints[0].x - newPoints[1].x, newPoints[0].y - newPoints[1].y);
        const newCenter = { x: (newPoints[0].x + newPoints[1].x) / 2, y: (newPoints[0].y + newPoints[1].y) / 2 };
        if (oldDistance > 4) this.zoomBy(newDistance / oldDistance, oldCenter.x, oldCenter.y);
        this.pan(newCenter.x - oldCenter.x, newCenter.y - oldCenter.y);
      } else {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.moved) {
          this.clearHover();
          const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
          if (this.panMode || e.shiftKey) this.pan(dx, dy);
          else { this.yaw -= dx * .005; this.elevation = THREE.MathUtils.clamp(this.elevation + dy * .004, .22, 1.35); this.updateCamera(); }
        }
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId); this.interact();
      if (!this.pointers.size) {
        canvas.classList.remove('is-dragging');
        if (!this.moved && e.type !== 'pointercancel') this.pick(e.clientX, e.clientY);
        this.dragStart = null;
      } else { this.moved = true; this.dragStart = null; }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => { if (!this.pointers.size) this.clearHover(); });
    canvas.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Escape'].includes(e.key)) {
        e.preventDefault(); this.interact();
        if (e.key === '+' || e.key === '=') this.zoomBy(1.3);
        else if (e.key === '-') this.zoomBy(1 / 1.3);
        else if (e.key === '0') this.reset();
        else if (e.key === 'Escape') this.clearHover();
        else if (e.shiftKey) this.pan(e.key === 'ArrowLeft' ? 30 : e.key === 'ArrowRight' ? -30 : 0, e.key === 'ArrowUp' ? 30 : e.key === 'ArrowDown' ? -30 : 0);
        else {
          if (e.key === 'ArrowLeft') this.yaw -= .09;
          if (e.key === 'ArrowRight') this.yaw += .09;
          if (e.key === 'ArrowUp') this.elevation = Math.min(1.35, this.elevation + .06);
          if (e.key === 'ArrowDown') this.elevation = Math.max(.22, this.elevation - .06);
          this.updateCamera();
        }
      }
    });
  }

  private tick = (time: number) => {
    if (this.stopped) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min((time - this.lastFrame) / 1000, .05); this.lastFrame = time;
    if (!this.data || document.hidden) return;
    if (this.riseUniform.value < 2) { this.riseUniform.value = (time - this.animationStart) / 1000; this.dirty = true; }
    if (!this.reducedMotion.matches && this.hovered === null && !this.pointers.size && time - this.lastInteraction > 3000) {
      this.yaw += dt * .022; this.updateCamera();
    }
    if (this.dirty) { this.render(); this.dirty = false; }
  };

  private render() {
    this.renderer.clear(); this.renderer.render(this.skyScene, this.skyCamera);
    this.renderer.clearDepth(); this.renderer.render(this.scene, this.camera);
  }

  async savePNG() {
    this.render();
    const blob = await new Promise<Blob | null>(resolve => this.renderer.domElement.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not export the current view.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `contribution-city-${this.data.username}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private disposeCity() {
    this.city.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
    this.city.clear();
  }

  dispose() { this.stopped = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.disposeCity(); this.renderer.dispose(); }
}
