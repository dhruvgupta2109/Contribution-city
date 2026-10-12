import './style.css';
import { CityRenderer } from './city/renderer';
import { createDemo } from './data/demo';
import { fetchGitHubCity, GitHubError, safeError, validUsername } from './data/github';
import { cityStats, type CityData } from './data/types';

const icons = {
  city: '<path d="M3 20V10h5v10m3 0V4h5v16m3 0V8h4v12M1 22h24"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1-.1-1.6-.6-2 3-.3 6.1-1.5 6.1-6.7 0-1.5-.5-2.7-1.4-3.7.2-.4.6-1.8-.1-3.6 0 0-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7.1 0C5.3 1.6 4.1 2 4.1 2c-.7 1.8-.3 3.2-.1 3.6-.9 1-1.4 2.2-1.4 3.7 0 5.2 3.1 6.4 6.1 6.7-.4.4-.7 1-.7 2v4"/>',
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9 2-2-2-2-2 2m-1-7-3 3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  rotate: '<path d="M4 11a8 8 0 1 1 2 7M4 4v7h7"/>',
  cursor: '<path d="m5 3 14 10-7 1-3 7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
type IconName = keyof typeof icons;
const icon = (name: IconName, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 ${name === 'city' ? 26 : 24} 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="/" aria-label="Contribution City home">
      <span class="brand-icon">${icon('city')}</span>
      <span>contribution<span class="brand-light"> city</span><span class="brand-period">.</span></span>
    </a>
    <form id="build-form" class="build-form">
      <div class="username-field">${icon('github')}<label class="sr-only" for="username">GitHub username</label><input id="username" name="username" placeholder="Your GitHub username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="39" required /></div>
      <button id="build" class="button primary" type="submit">Build city ${icon('arrow')}</button>
    </form>
    <div class="header-actions">
      <button class="button quiet token-toggle" id="token-toggle" aria-expanded="false" aria-controls="token-panel" type="button">${icon('key')}<span>Access token</span></button>
      <button class="button outlined" id="save" type="button">${icon('download')}<span>Save PNG</span></button>
    </div>
    <div id="token-panel" class="token-panel panel" hidden>
      <label for="token">GitHub access token <span>optional</span></label>
      <input id="token" type="password" autocomplete="off" placeholder="github_pat_…" spellcheck="false" />
      <p>Include up to 40 repositories. Your token goes directly to GitHub and stays only in memory for this build.</p>
      <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">Create a token on GitHub ↗</a>
    </div>
  </header>

  <main>
    <section class="intro" aria-labelledby="headline">
      <div><div class="eyebrow"><span class="live-dot"></span> YOUR CODE, A SKYLINE</div><h1 id="headline">Small commits.<br class="mobile-break" /> <span>Extraordinary cities.</span></h1><p>A year of GitHub activity, brought to life. Every day a building. Every contribution a floor.</p></div>
      <div class="intro-stamp"><span class="stamp-number">365</span><span>DAYS. ONE CITY.<br />A STORY ONLY YOU CAN BUILD.</span></div>
    </section>

    <section id="city-stage" class="city-stage" aria-label="Contribution city viewer">
      <div class="city-info">
        <div class="city-title-row"><span class="city-avatar">${icon('city')}</span><div><h2 id="city-name">The demo city</h2><div class="city-subtitle"><span id="city-handle">A little inspiration before you build</span><span id="demo-badge" class="badge">DEMO</span></div></div></div>
        <div class="date-range" id="date-range"></div>
      </div>
      <div class="view-indicator"><span class="live-dot"></span> LIVE CITY <span class="view-line"></span> <span id="view-year"></span></div>

      <aside class="legend panel" aria-label="Repository legend">
        <div class="legend-heading"><h3>City lights</h3><span id="repo-number" class="count-pill"></span><button id="legend-toggle" class="icon-button" aria-label="Collapse repository legend" aria-expanded="true">${icon('minus')}</button></div>
        <div class="legend-content" id="legend-content"><p class="legend-hint">Every colour tells a different story.</p><div id="repo-list" class="repo-list"></div><div class="legend-foot"><span>Click a repo to isolate</span><span>●</span><span>Swatch to recolour</span></div></div>
        <button id="clear-filter" class="clear-filter" hidden>Clear filter ${icon('close')}</button>
      </aside>

      <div id="tooltip" class="tooltip panel" hidden role="status"></div>
      <div id="message" class="message panel" hidden role="status"><div><span id="message-title"></span><p id="message-detail"></p></div><button id="dismiss-message" class="icon-button" aria-label="Dismiss notification">${icon('close')}</button></div>
      <div id="loading" class="loading panel" hidden role="status"><span class="spinner"></span><div><strong>Building your city</strong><span id="loading-text">Reading the contribution calendar…</span></div><button class="icon-button" id="cancel-build" aria-label="Cancel city build">${icon('close')}</button></div>

      <div class="stage-bottom">
        <div class="gestures"><span>${icon('cursor')}<span>Drag to orbit</span></span><span><span class="gesture-symbol">↕</span><span>Scroll to zoom</span></span><span><kbd>shift</kbd><span>+ drag to pan</span></span></div>
        <div class="zoom-controls" role="group" aria-label="Zoom controls"><span id="zoom-label" class="zoom-label">1.0×</span><button id="zoom-out" class="icon-button" aria-label="Zoom out">${icon('minus')}</button><button id="zoom-in" class="icon-button" aria-label="Zoom in">${icon('plus')}</button><span class="zoom-divider"></span><button id="reset" class="reset-button" aria-label="Reset camera to one to one zoom">1:1</button></div>
      </div>
      <div class="city-watermark">BUILT ONE DAY AT A TIME.</div>
    </section>

    <section class="stats" aria-label="Contribution statistics">
      <div class="stat"><span class="stat-label">TOTAL CONTRIBUTIONS</span><div><strong id="stat-total">—</strong><span class="stat-note">little steps, big skyline</span></div></div>
      <div class="stat"><span class="stat-label">BUSIEST DAY</span><div><strong id="stat-busiest">—</strong><span class="stat-note" id="stat-busiest-date"></span></div></div>
      <div class="stat"><span class="stat-label">LONGEST STREAK</span><div><strong id="stat-streak">—</strong><span class="stat-note">days in a row</span></div></div>
      <div class="stat"><span class="stat-label">REPOSITORIES</span><div><strong id="stat-repos">—</strong><span class="stat-note">lighting up your city</span></div></div>
    </section>
  </main>
  <footer class="footer"><span>Made of code. Built by you.</span><span>${icon('info')} Heights follow GitHub’s contribution graph.</span><a href="https://github.com" target="_blank" rel="noopener noreferrer">Explore GitHub ${icon('arrow')}</a></footer>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const stage = $('#city-stage');
const tooltip = $('#tooltip');
const usernameInput = $<HTMLInputElement>('#username');
const tokenInput = $<HTMLInputElement>('#token');
const fmt = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
let data = createDemo();
let selectedRepo: number | null = null;
let request: AbortController | null = null;
let renderer: CityRenderer | null = null;
let currentHover: number | null = null;

function renderTooltip(index: number | null, x = 0, y = 0) {
  if (index === null) { tooltip.hidden = true; currentHover = null; return; }
  const day = data.days[index];
  if (currentHover !== index || tooltip.hidden) {
    tooltip.replaceChildren();
    const date = document.createElement('div'); date.className = 'tooltip-date'; date.textContent = dateFormat.format(new Date(`${day.date}T00:00:00Z`));
    const total = document.createElement('div'); total.className = 'tooltip-total';
    const number = document.createElement('strong'); number.textContent = fmt.format(day.count);
    const label = document.createElement('span'); label.textContent = day.count === 1 ? 'contribution' : 'contributions'; total.append(number, label);
    tooltip.append(date, total);
    day.segments.forEach(segment => {
      const repo = data.repos[segment.repoIndex];
      const row = document.createElement('div'); row.className = 'tooltip-repo';
      const dot = document.createElement('span'); dot.className = 'tooltip-dot'; dot.style.backgroundColor = repo.color;
      const name = document.createElement('span'); name.textContent = repo.name;
      const count = document.createElement('span'); count.textContent = fmt.format(segment.count);
      row.append(dot, name, count); tooltip.append(row);
    });
    if (!day.count) { const note = document.createElement('p'); note.textContent = 'A quiet day. Room to grow.'; tooltip.append(note); }
  }
  currentHover = index; tooltip.hidden = false;
  const left = Math.max(12, Math.min(stage.clientWidth - tooltip.offsetWidth - 12, x + 18));
  const top = Math.max(12, Math.min(stage.clientHeight - tooltip.offsetHeight - 70, y - tooltip.offsetHeight - 18));
  tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`;
}

function showMessage(title: string, detail: string, error = false) {
  $('#message-title').textContent = title; $('#message-detail').textContent = detail;
  $('#message').hidden = false; $('#message').classList.toggle('is-error', error);
}

try {
  renderer = new CityRenderer(stage, {
    hover: renderTooltip,
    zoom: zoom => { $('#zoom-label').textContent = `${zoom.toFixed(1)}×`; $<HTMLButtonElement>('#zoom-out').disabled = zoom <= .40001; $<HTMLButtonElement>('#zoom-in').disabled = zoom >= 15.999; },
  });
} catch {
  stage.classList.add('no-webgl');
  showMessage('3D rendering is unavailable', 'This browser could not start WebGL. Enable hardware acceleration or try a browser with WebGL support.', true);
}

function setFilter(index: number | null) {
  selectedRepo = index; renderer?.isolate(index);
  $('#clear-filter').hidden = index === null;
  document.querySelectorAll<HTMLButtonElement>('.repo-button').forEach(button => {
    const active = Number(button.dataset.repo) === index;
    button.setAttribute('aria-pressed', String(active));
    button.closest('.repo-row')?.classList.toggle('is-selected', active);
    button.closest('.repo-row')?.classList.toggle('is-muted', index !== null && !active);
  });
}

function renderLegend() {
  const list = $('#repo-list'); list.replaceChildren();
  data.repos.forEach((repo, i) => {
    const row = document.createElement('div'); row.className = `repo-row${repo.other ? ' other-row' : ''}`;
    const swatch = document.createElement('input'); swatch.type = 'color'; swatch.value = repo.color; swatch.className = 'repo-swatch';
    swatch.setAttribute('aria-label', `Recolour ${repo.name}`); swatch.title = `Recolour ${repo.name}`;
    swatch.addEventListener('input', () => { repo.color = swatch.value; renderer?.recolor(i, swatch.value); if (currentHover !== null) { const index = currentHover; currentHover = null; renderTooltip(index, parseFloat(tooltip.style.left) - 18, parseFloat(tooltip.style.top) + tooltip.offsetHeight + 18); } });
    const button = document.createElement('button'); button.type = 'button'; button.className = 'repo-button'; button.dataset.repo = String(i);
    button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `Isolate ${repo.name}, ${fmt.format(repo.commits)} ${repo.other ? 'contributions' : 'commits'}`); button.title = repo.fullName;
    const name = document.createElement('span'); name.className = 'repo-name'; name.textContent = repo.name;
    const count = document.createElement('span'); count.className = 'repo-count'; count.textContent = fmt.format(repo.commits);
    button.append(name, count); button.addEventListener('click', () => setFilter(selectedRepo === i ? null : i));
    row.append(swatch, button); list.append(row);
  });
  $('#repo-number').textContent = String(data.repos.filter(r => !r.other).length);
  $('#clear-filter').hidden = true;
}

function displayCity(next: CityData) {
  data = next; selectedRepo = null; currentHover = null;
  renderer?.load(data); renderLegend();
  $('#city-name').textContent = data.demo ? 'The demo city' : `${data.name}’s city`;
  $('#city-handle').textContent = data.demo ? 'A little inspiration before you build' : `@${data.username}`;
  $('#demo-badge').hidden = !data.demo;
  const first = data.days[0], last = data.days.at(-1)!;
  $('#date-range').textContent = `${dateFormat.format(new Date(`${first.date}T00:00:00Z`))} — ${dateFormat.format(new Date(`${last.date}T00:00:00Z`))}`;
  $('#view-year').textContent = '365 DAYS';
  const stats = cityStats(data);
  $('#stat-total').textContent = fmt.format(stats.total);
  $('#stat-busiest').textContent = fmt.format(stats.busiest?.count ?? 0);
  $('#stat-busiest-date').textContent = stats.busiest ? shortDate.format(new Date(`${stats.busiest.date}T00:00:00Z`)) : '—';
  $('#stat-streak').textContent = fmt.format(stats.longestStreak); $('#stat-repos').textContent = fmt.format(stats.repos);
  if (data.warnings.length) showMessage('Your skyline is ready · partial repo attribution', data.warnings.join(' '));
  document.title = data.demo ? 'Contribution City — Your code, a skyline.' : `@${data.username}’s Contribution City`;
}

async function buildCity(username: string) {
  if (!validUsername(username)) { showMessage('Check the username', 'Enter a GitHub username without an @ sign or URL.', true); usernameInput.focus(); return; }
  request?.abort();
  const controller = new AbortController(); request = controller;
  $('#message').hidden = true; $('#loading').hidden = false; $('#loading-text').textContent = 'Reading the contribution calendar…';
  $<HTMLButtonElement>('#build').disabled = true;
  const token = tokenInput.value.trim(); tokenInput.value = ''; // Never persisted, and clear the password field immediately.
  $('#token-panel').hidden = true; $('#token-toggle').setAttribute('aria-expanded', 'false');
  try {
    let city: CityData;
    if (token) city = await fetchGitHubCity(username, { token, repoLimit: 40, signal: controller.signal, progress: message => { if (request === controller) $('#loading-text').textContent = message; } });
    else {
      const response = await fetch(`/api/github?user=${encodeURIComponent(username)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(58_000)]), headers: { Accept: 'application/json' } });
      let result: CityData & { error?: string };
      try { result = await response.json(); } catch { throw new GitHubError('The GitHub proxy is unavailable on this host. Add a token under “Access token”, or use a deployment with the API function enabled.', 503); }
      if (!response.ok) throw new GitHubError(result.error ?? 'Could not load the contribution calendar.', response.status);
      city = result;
    }
    if (request !== controller) return;
    displayCity(city);
    const url = new URL(location.href); url.searchParams.set('user', username); history.replaceState(null, '', url);
  } catch (error) {
    if (!controller.signal.aborted) showMessage('Your city couldn’t be built', safeError(error), true);
  } finally {
    if (request === controller) { $('#loading').hidden = true; $<HTMLButtonElement>('#build').disabled = false; request = null; }
  }
}

$('#build-form').addEventListener('submit', event => { event.preventDefault(); void buildCity(usernameInput.value.trim()); });
$('#cancel-build').addEventListener('click', () => { request?.abort(); });
$('#token-toggle').addEventListener('click', () => {
  const panel = $('#token-panel'); panel.hidden = !panel.hidden;
  $('#token-toggle').setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) tokenInput.focus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#token-panel').hidden = true; $('#token-toggle').setAttribute('aria-expanded', 'false'); } });
$('#dismiss-message').addEventListener('click', () => { $('#message').hidden = true; });
$('#clear-filter').addEventListener('click', () => setFilter(null));
$('#zoom-in').addEventListener('click', () => renderer?.zoomBy(1.4));
$('#zoom-out').addEventListener('click', () => renderer?.zoomBy(1 / 1.4));
$('#reset').addEventListener('click', () => renderer?.reset());
$('#legend-toggle').addEventListener('click', () => {
  const content = $('#legend-content'); content.hidden = !content.hidden;
  $('#legend-toggle').setAttribute('aria-expanded', String(!content.hidden));
  $('#legend-toggle').setAttribute('aria-label', content.hidden ? 'Expand repository legend' : 'Collapse repository legend');
  $('#legend-toggle').innerHTML = icon(content.hidden ? 'plus' : 'minus');
});
$('#save').addEventListener('click', async () => {
  try { if (!renderer) throw new Error(); await renderer.savePNG(); }
  catch { showMessage('Export unavailable', 'The current view could not be saved. Check that 3D rendering is available and try again.', true); }
});
stage.addEventListener('city-error', event => showMessage('Graphics interrupted', (event as CustomEvent<string>).detail, true));
displayCity(data);
const sharedUser = new URLSearchParams(location.search).get('user');
if (sharedUser) { usernameInput.value = sharedUser; void buildCity(sharedUser); }
if (import.meta.hot) import.meta.hot.dispose(() => { renderer?.dispose(); request?.abort(); });
