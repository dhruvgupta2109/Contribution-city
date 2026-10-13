import { generateDemoCity } from './data/demo.ts';
import {
  GitHubError,
  loadCityFromProxy,
  loadGitHubCity,
  VISITOR_REPOSITORY_LIMIT,
} from './data/github.ts';
import type { CityData } from './data/types.ts';
import { createViewport } from './rendering/viewport.ts';
import { createAppShell } from './ui/app-shell.ts';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
let city = generateDemoCity();
let request: AbortController | null = null;
let requestNumber = 0;
let disposed = false;

const updateUrl = (username: string | null) => {
  const url = new URL(window.location.href);
  if (username) url.searchParams.set('user', username);
  else url.searchParams.delete('user');
  window.history.replaceState(null, '', url);
};
const display = (data: CityData) => {
  city = data;
  shell.updateData(city);
  viewport.load(city);
};
const build = async (username: string, token: string) => {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const thisRequest = ++requestNumber;
  shell.setLoading(true, 'Loading the contribution calendar…');
  try {
    const result = token
      ? await loadGitHubCity({
          username,
          token,
          repositoryLimit: VISITOR_REPOSITORY_LIMIT,
          signal: controller.signal,
          onProgress: (message) => {
            if (thisRequest === requestNumber) shell.announce(message);
          },
        })
      : await loadCityFromProxy(username, controller.signal, (message) => {
          if (thisRequest === requestNumber) shell.announce(message);
        });
    if (thisRequest !== requestNumber || disposed || controller.signal.aborted)
      return;
    display(result);
    updateUrl(username);
    shell.announce(
      `Built @${username}’s city. ${result.warnings.length ? 'See the data notes for attribution limits.' : ''}`,
    );
  } catch (error) {
    if (thisRequest !== requestNumber || disposed) return;
    shell.announce(
      error instanceof GitHubError
        ? error.message
        : 'The city could not be loaded. Please try again.',
      !(error instanceof GitHubError && error.code === 'cancelled'),
    );
  } finally {
    // Drop the credential reference and input; never put it in storage or a URL.
    token = '';
    if (thisRequest === requestNumber && !disposed) {
      request = null;
      shell.clearToken();
      shell.setLoading(false);
    }
  }
};
const download = async () => {
  try {
    const blob = await viewport.exportPng();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `contribution-city-${city.metadata.username ?? 'demo'}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    shell.announce('Your city view has been exported.');
  } catch (error) {
    shell.announce(
      error instanceof Error
        ? error.message
        : 'The view could not be exported.',
      true,
    );
  }
};
const shell = createAppShell(root, {
  build: (username, token) => {
    void build(username, token);
  },
  cancel: () => {
    requestNumber++;
    request?.abort();
    request = null;
    shell.clearToken();
    shell.setLoading(false);
    shell.announce('Loading cancelled.');
  },
  filter: (id) => viewport.filter(id),
  recolor: (id, color) => viewport.recolor(id, color),
  zoom: (factor) => viewport.zoom(factor),
  reset: () => viewport.reset(),
  autoRotate: (enabled) => viewport.autoRotate(enabled),
  export: () => {
    void download();
  },
  closeDay: () => viewport.clearSelection(),
  view: (view) => viewport.setView(view),
  theme: (index) => viewport.setTheme(index),
  fly: (enabled) => viewport.fly(enabled),
  pauseFlight: () => viewport.pauseFlight(),
  boost: (enabled) => viewport.boost(enabled),
  brake: (enabled) => viewport.brake(enabled),
  throttle: (speed) => viewport.throttle(speed),
  visit: (id) => viewport.focusRepository(id),
  share: () => {
    if (!navigator.clipboard) {
      shell.announce('Copy the URL from your address bar to share this city.');
      return;
    }
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => shell.announce('City link copied.'))
      .catch(() =>
        shell.announce(
          'Copy the URL from your address bar to share this city.',
        ),
      );
  },
});
const viewport = createViewport(shell.viewportHost, shell.updateGraphicsState, {
  onPick: shell.showDay,
  onZoom: shell.updateZoom,
  onRepositoryPick: shell.showRepository,
  onFlightStatus: shell.updateFlight,
  onOrbitChange: shell.updateOrbit,
  onNotice: shell.announce,
});
const loadDemo = () => {
  requestNumber++;
  request?.abort();
  request = null;
  shell.clearToken();
  shell.setLoading(false);
  shell.setUsername('');
  display(generateDemoCity());
  updateUrl(null);
  shell.announce('Demo city loaded.');
};
shell.resetButton.addEventListener('click', loadDemo);
display(city);
const sharedUsername = new URL(window.location.href).searchParams.get('user');
if (sharedUsername) {
  shell.setUsername(sharedUsername);
  void build(sharedUsername, '');
}

// Opt-in inspection on localhost; never contains the token or request headers.
if (import.meta.env.DEV)
  Object.defineProperty(window, 'cityDiagnostics', {
    configurable: true,
    value: () => viewport.diagnostics(),
  });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    request?.abort();
    shell.resetButton.removeEventListener('click', loadDemo);
    viewport.dispose();
    if (import.meta.env.DEV) Reflect.deleteProperty(window, 'cityDiagnostics');
  });
