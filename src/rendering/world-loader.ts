import type { MapWorld } from './world-types.ts';
export function loadMapWorld(signal?: AbortSignal): Promise<MapWorld> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./world-worker.ts', import.meta.url), {
      type: 'module',
    });
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      reject(new Error('The reference map took too long to load.'));
    }, 45000);
    const abort = () => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error('Map loading cancelled.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ world?: MapWorld; error?: string }>,
    ) => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.world) resolve(event.data.world);
      else
        reject(
          new Error(
            event.data.error ?? 'The reference map could not be loaded.',
          ),
        );
    };
    worker.onerror = () => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error('The reference map could not be prepared.'));
    };
    worker.postMessage({ load: true });
    if (signal?.aborted) abort();
  });
}
