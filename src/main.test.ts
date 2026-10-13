// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDemoCity } from './data/demo.ts';

const mocks = vi.hoisted(() => ({
  proxy: vi.fn(), direct: vi.fn(),
  viewport: {
    load: vi.fn(), render: vi.fn(), filter: vi.fn(), recolor: vi.fn(), zoom: vi.fn(),
    reset: vi.fn(), clearSelection: vi.fn(), autoRotate: vi.fn(), exportPng: vi.fn(), diagnostics: vi.fn(() => ({})), dispose: vi.fn(),
  },
}));
vi.mock('./rendering/viewport.ts', () => ({ createViewport: (_host: HTMLElement, state: (value: string) => void) => { state('ready'); return mocks.viewport; } }));
vi.mock('./data/github.ts', async (importOriginal) => ({ ...await importOriginal<typeof import('./data/github.ts')>(), loadCityFromProxy: mocks.proxy, loadGitHubCity: mocks.direct }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '/');
});
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function realCity(username = 'octocat') {
  const city = generateDemoCity({ seed: 'loaded' });
  city.metadata.source = 'github'; city.metadata.username = username; city.metadata.seed = null;
  return city;
}
function submit(username: string, token = '') {
  document.querySelector<HTMLInputElement>('#github-username')!.value = username;
  document.querySelector<HTMLInputElement>('#visitor-token')!.value = token;
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('application load lifecycle', () => {
  it('keeps the previous city visible while loading and after a failed request', async () => {
    const pending = deferred<ReturnType<typeof realCity>>(); mocks.proxy.mockReturnValue(pending.promise);
    await import('./main.ts'); const baseline = document.querySelector('tbody')!.innerHTML;
    submit('octocat'); expect(document.querySelector('.build-button')!.textContent).toBe('Building…');
    expect(document.querySelector('tbody')!.innerHTML).toBe(baseline);
    pending.reject(new Error('offline'));
    await vi.waitFor(() => expect(document.querySelector('.build-button')!.textContent).toBe('Build city'));
    expect(document.querySelector('tbody')!.innerHTML).toBe(baseline); expect(mocks.viewport.load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.status')!.classList.contains('error')).toBe(true);
  });
  it('updates the shared URL only after success and clears a visitor token', async () => {
    const pending = deferred<ReturnType<typeof realCity>>(); mocks.direct.mockReturnValue(pending.promise);
    await import('./main.ts'); submit('octocat', 'fixture-visitor-token');
    expect(window.location.search).toBe(''); expect(mocks.direct.mock.calls[0]![0]).toMatchObject({ token: 'fixture-visitor-token', repositoryLimit: 40 });
    pending.resolve(realCity());
    await vi.waitFor(() => expect(window.location.search).toBe('?user=octocat'));
    expect(document.querySelector<HTMLInputElement>('#visitor-token')!.value).toBe('');
    expect(document.querySelector('.city-heading h2')!.textContent).toContain('@octocat');
  });
  it('cancels loading and prevents a stale result replacing a newly restored demo', async () => {
    const pending = deferred<ReturnType<typeof realCity>>(); mocks.proxy.mockReturnValue(pending.promise);
    await import('./main.ts'); submit('octocat');
    const signal = mocks.proxy.mock.calls[0]![1] as AbortSignal;
    document.querySelector<HTMLButtonElement>('[aria-label="Load the demo city"]')!.click();
    expect(signal.aborted).toBe(true); pending.resolve(realCity());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.city-heading h2')!.textContent).toBe('The demo neighborhood'); expect(window.location.search).toBe('');
    expect(mocks.viewport.load).toHaveBeenCalledTimes(2);
  });
  it('loads a shared username automatically and supports explicit cancellation', async () => {
    window.history.replaceState(null, '', '/?user=octocat');
    const pending = deferred<ReturnType<typeof realCity>>(); mocks.proxy.mockReturnValue(pending.promise);
    await import('./main.ts'); expect(mocks.proxy).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLInputElement>('#github-username')!.value).toBe('octocat');
    document.querySelector<HTMLButtonElement>('[aria-label="Cancel loading"]')!.click();
    const signal = mocks.proxy.mock.calls[0]![1] as AbortSignal; expect(signal.aborted).toBe(true);
    expect(document.querySelector('.status')!.textContent).toBe('Loading cancelled.');
    expect(document.querySelector('.build-button')!.textContent).toBe('Build city');
    pending.reject(new Error('cancelled')); await vi.waitFor(() => expect(document.querySelector('.build-button')!.textContent).toBe('Build city'));
  });
});
