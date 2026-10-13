import { buildMapWorld } from './world-build.ts';
import { readMapAsset } from './map-compression.ts';
const worker = globalThis as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: () => void;
};
worker.onmessage = () => {
  void Promise.all([
    readMapAsset('/maps/bay.json.gz'),
    readMapAsset('/maps/sf.json.gz'),
  ])
    .then(([bay, sf]) => {
      const world = buildMapWorld(bay, sf);
      const transfer = [
        ...Object.values(world.arrays),
        world.lots,
        world.trees,
        ...world.routes.map((route) => route.points),
      ].map((array) => array.buffer as ArrayBuffer);
      worker.postMessage({ world }, transfer);
    })
    .catch(() =>
      worker.postMessage({
        error: 'The reference map is temporarily unavailable.',
      }),
    );
};
