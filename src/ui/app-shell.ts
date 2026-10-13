import { OTHER_ACTIVITY_COLOR } from '../data/demo.ts';
import { cityStatistics } from '../data/statistics.ts';
import type { CityData, ContributionDay } from '../data/types.ts';
import type { GraphicsState } from '../rendering/viewport.ts';
import type { CityView } from '../rendering/viewport.ts';
import type { RepoBuilding } from '../rendering/repository-layout.ts';
import type { FlightStatus } from '../interaction/flight-controller.ts';
import { CITY_THEMES } from '../rendering/themes.ts';
import { OTHER_ID, segmentId } from '../rendering/city-scene.ts';
import { button, element, longDate, number, shortDate } from './dom.ts';

export interface AppActions {
  build?: (username: string, token: string) => void;
  cancel?: () => void;
  filter?: (id: string | null) => void;
  recolor?: (id: string, color: string) => void;
  zoom?: (factor: number) => void;
  reset?: () => void;
  autoRotate?: (enabled: boolean) => void;
  export?: () => void;
  share?: () => void;
  closeDay?: () => void;
  view?: (view: CityView) => void;
  theme?: (index: number) => void;
  fly?: (enabled: boolean) => void;
  pauseFlight?: () => void;
  boost?: (enabled: boolean) => void;
  brake?: (enabled: boolean) => void;
  throttle?: (speed: number) => void;
  visit?: (id: string) => void;
}
export interface AppShell {
  viewportHost: HTMLElement;
  resetButton: HTMLButtonElement;
  updateData: (city: CityData) => void;
  updateGraphicsState: (state: GraphicsState) => void;
  announce: (message: string, error?: boolean) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setUsername: (username: string) => void;
  clearToken: () => void;
  showDay: (
    day: ContributionDay | null,
    point: { x: number; y: number },
    pinned?: boolean,
  ) => void;
  updateZoom: (zoom: number) => void;
  showRepository: (
    building: RepoBuilding | null,
    point: { x: number; y: number },
    pinned?: boolean,
  ) => void;
  updateFlight: (status: FlightStatus) => void;
  updateOrbit: (enabled: boolean) => void;
}

export function createAppShell(
  root: HTMLElement,
  actions: AppActions = {},
): AppShell {
  let currentCity: CityData | null = null;
  let selectedRepo: string | null = null;
  let selectedDay: ContributionDay | null = null;
  let selectedBuilding: RepoBuilding | null = null;
  let flightStatus: FlightStatus = {
    active: false,
    paused: false,
    speed: 55,
    altitude: 0,
    throttle: 55,
  };
  let selectedPoint = { x: 0, y: 0 };
  const colors = new Map<string, string>();
  let tooltipDirty = true;
  let dayPinned = false;
  const main = element('main', undefined, 'app-shell');
  const header = element('header', undefined, 'app-header');
  const brand = element('div', undefined, 'brand');
  const mark = element('div', undefined, 'city-mark');
  mark.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 4; i++) mark.append(element('i'));
  const heading = element('div');
  heading.append(
    element('p', 'Where your repositories become a city', 'eyebrow'),
    element('h1', 'Contribution City'),
  );
  brand.append(mark, heading);
  const headerActions = element('div', undefined, 'header-actions');
  const resetButton = button('Load the demo city', 'Demo', 'text-button');
  const share = button('Copy a link to this city', 'Share', 'text-button');
  const exportButton = button(
    'Download the current city view as PNG',
    'Export PNG',
    'text-button',
  );
  share.addEventListener('click', () => actions.share?.());
  exportButton.addEventListener('click', () => actions.export?.());
  headerActions.append(resetButton, share, exportButton);
  header.append(brand, headerActions);

  const toolbar = element('section', undefined, 'toolbar');
  toolbar.setAttribute('aria-label', 'City dataset and GitHub user');
  const cityHeading = element('div', undefined, 'city-heading');
  const cityName = element('h2', 'The demo neighborhood');
  const range = element('p', undefined, 'date-range');
  cityHeading.append(cityName, range);
  const formArea = element('div', undefined, 'form-area');
  const form = element('form', undefined, 'build-form');
  const usernameLabel = element('label', 'GitHub username', 'sr-only');
  usernameLabel.htmlFor = 'github-username';
  const username = element('input');
  username.id = 'github-username';
  username.name = 'username';
  username.placeholder = 'GitHub username';
  username.autocomplete = 'off';
  username.spellcheck = false;
  username.maxLength = 39;
  username.required = true;
  username.pattern = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?';
  const build = element('button', 'Build city', 'build-button');
  build.type = 'submit';
  const cancel = button('Cancel loading', 'Cancel', 'text-button');
  cancel.hidden = true;
  cancel.addEventListener('click', () => actions.cancel?.());
  form.append(usernameLabel, username, build, cancel);
  const tokenDetails = element('details', undefined, 'token-details');
  tokenDetails.append(element('summary', 'Use a GitHub token'));
  const tokenLabel = element('label', 'Personal access token');
  tokenLabel.htmlFor = 'visitor-token';
  const token = element('input');
  token.type = 'password';
  token.id = 'visitor-token';
  token.autocomplete = 'off';
  token.spellcheck = false;
  token.placeholder = 'Optional token';
  tokenDetails.append(
    tokenLabel,
    token,
    element(
      'p',
      'Used only for this request, sent directly to GitHub, and cleared afterwards. Private contributions may appear as Other activity.',
    ),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    actions.build?.(username.value.trim(), token.value.trim());
  });
  formArea.append(form, tokenDetails);
  toolbar.append(cityHeading, formArea);

  const viewportHost = element('section', undefined, 'viewport');
  viewportHost.setAttribute('aria-label', 'City viewport');
  const fallback = element('div', undefined, 'viewport-message');
  fallback.append(
    element('h2', 'Preparing your city'),
    element('p', '365 days, one neighborhood.'),
  );
  const legend = element('aside', undefined, 'legend');
  legend.setAttribute('aria-label', 'Repository legend');
  const legendHeader = element('div', undefined, 'legend-header');
  const legendHeading = element('h3', 'Repositories');
  const clearFilter = button(
    'Show all repository activity',
    'Show all',
    'legend-clear',
  );
  clearFilter.hidden = true;
  const legendList = element('div', undefined, 'legend-list');
  legendHeader.append(legendHeading, clearFilter);
  legend.append(legendHeader, legendList);
  const legendToggle = button(
    'Show repositories',
    'Repositories',
    'legend-toggle',
  );
  legendToggle.setAttribute('aria-expanded', 'false');
  legendToggle.addEventListener('click', () => {
    const expanded = legendToggle.getAttribute('aria-expanded') !== 'true';
    legendToggle.setAttribute('aria-expanded', String(expanded));
    legend.classList.toggle('expanded', expanded);
  });
  const controls = element('div', undefined, 'camera-controls');
  controls.setAttribute('aria-label', 'Camera controls');
  const zoomIn = button('Zoom in', '+');
  const zoomOut = button('Zoom out', '−');
  const resetCamera = button('Reset the camera to its initial view', '1:1');
  const rotation = button('Pause automatic rotation', 'Orbit');
  rotation.setAttribute('aria-pressed', 'true');
  const zoomLabel = element('span', '1.0×', 'zoom-label');
  zoomLabel.setAttribute('aria-label', 'Current zoom');
  zoomIn.addEventListener('click', () => actions.zoom?.(1.3));
  zoomOut.addEventListener('click', () => actions.zoom?.(1 / 1.3));
  resetCamera.addEventListener('click', () => actions.reset?.());
  rotation.addEventListener('click', () => {
    const enabled = rotation.getAttribute('aria-pressed') !== 'true';
    rotation.setAttribute('aria-pressed', String(enabled));
    rotation.setAttribute(
      'aria-label',
      enabled ? 'Pause automatic rotation' : 'Enable automatic rotation',
    );
    actions.autoRotate?.(enabled);
  });
  controls.append(rotation, zoomOut, zoomLabel, zoomIn, resetCamera);
  const flyButton = button(
    'Fly through the repository city',
    'Fly',
    'fly-button',
  );
  flyButton.setAttribute('aria-pressed', 'false');
  controls.append(flyButton);
  const modeControls = element('div', undefined, 'mode-controls');
  modeControls.setAttribute('aria-label', 'City view and appearance');
  const views = element('div', undefined, 'view-switch');
  const repositoryView = button('Show repository towers', 'Repos'),
    calendarView = button('Show the daily contribution calendar', 'Days');
  repositoryView.setAttribute('aria-pressed', 'true');
  calendarView.setAttribute('aria-pressed', 'false');
  const viewportNote = element(
    'span',
    'Lit towers: repos · dim blocks: scenery.',
    'viewport-note',
  );
  const changeView = (next: CityView) => {
    repositoryView.setAttribute(
      'aria-pressed',
      String(next === 'repositories'),
    );
    calendarView.setAttribute('aria-pressed', String(next === 'calendar'));
    viewportNote.textContent =
      next === 'repositories'
        ? 'Lit towers: repos · dim blocks: scenery.'
        : 'One building. One day.';
    const info = help.querySelector('p');
    if (info)
      info.textContent =
        next === 'repositories'
          ? 'Drag or one finger to pan · Right/Shift drag to orbit · Scroll to zoom · Two fingers pinch and rotate. Arrows pan, Shift + arrows orbit, + / − zoom, 0 resets.'
          : 'Drag to orbit · Scroll or pinch to zoom · Shift/right drag or two fingers to pan · Double-click zoom. Arrows orbit, Shift + arrows pan, + / − zoom, 0 resets.';
    legendList
      .querySelectorAll<HTMLElement>('.legend-view')
      .forEach((button) => {
        button.hidden = next !== 'repositories';
      });
    actions.view?.(next);
  };
  repositoryView.addEventListener('click', () => changeView('repositories'));
  calendarView.addEventListener('click', () => changeView('calendar'));
  views.append(repositoryView, calendarView);
  flyButton.addEventListener('click', () => {
    if (
      !flightStatus.active &&
      repositoryView.getAttribute('aria-pressed') !== 'true'
    )
      changeView('repositories');
    actions.fly?.(!flightStatus.active);
  });
  const themeLabel = element('label', 'Theme', 'sr-only');
  themeLabel.htmlFor = 'city-theme';
  const themeSelect = element('select');
  themeSelect.id = 'city-theme';
  themeSelect.setAttribute('aria-label', 'City theme');
  CITY_THEMES.forEach((theme, index) => {
    const option = element('option', theme.name);
    option.value = String(index);
    themeSelect.append(option);
  });
  themeSelect.addEventListener('change', () =>
    actions.theme?.(Number(themeSelect.value)),
  );
  modeControls.append(views, themeLabel, themeSelect);
  const flightHud = element('section', undefined, 'flight-hud');
  flightHud.setAttribute('aria-label', 'Flight controls');
  flightHud.hidden = true;
  const flightReadout = element('p', undefined, 'flight-readout');
  const throttleLabel = element('label', 'Throttle', 'throttle-label'),
    throttle = element('input');
  throttle.type = 'range';
  throttle.min = '0';
  throttle.max = '550';
  throttle.step = '1';
  throttle.value = '55';
  throttle.id = 'flight-throttle';
  throttleLabel.htmlFor = throttle.id;
  throttle.addEventListener('input', () =>
    actions.throttle?.(Number(throttle.value)),
  );
  const flightButtons = element('div', undefined, 'flight-buttons');
  const pauseFlight = button('Pause flight', 'Pause'),
    exitFlight = button('Exit flight', 'Exit'),
    boostFlight = button('Hold to boost flight speed', 'Boost'),
    brakeFlight = button('Hold to slow flight', 'Brake');
  pauseFlight.addEventListener('click', () => actions.pauseFlight?.());
  exitFlight.addEventListener('click', () => actions.fly?.(false));
  const hold = (
    control: HTMLButtonElement,
    action: (enabled: boolean) => void,
  ) => {
    control.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      action(true);
    });
    for (const name of [
      'pointerup',
      'pointercancel',
      'lostpointercapture',
      'blur',
    ])
      control.addEventListener(name, () => action(false));
    control.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        action(true);
      }
    });
    control.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        action(false);
      }
    });
  };
  hold(boostFlight, (value) => actions.boost?.(value));
  hold(brakeFlight, (value) => actions.brake?.(value));
  flightButtons.append(boostFlight, brakeFlight, pauseFlight, exitFlight);
  flightHud.append(
    flightReadout,
    throttleLabel,
    throttle,
    flightButtons,
    element(
      'p',
      'Steer with mouse or touch. W/S climb · A/D turn · Shift boost · Q brake · Wheel throttle · Space pause · R home · Esc pause/exit.',
      'flight-help',
    ),
  );
  const viewportCaption = element('div', undefined, 'viewport-caption');
  const badge = element('span', 'Demo city', 'badge');
  viewportCaption.append(badge, viewportNote);
  const help = element('details', undefined, 'controls-help');
  help.append(element('summary', 'Controls'));
  help.append(
    element(
      'p',
      'Drag or one finger to pan · Right/Shift drag to orbit · Scroll to zoom · Two fingers pinch and rotate. Arrows pan, Shift + arrows orbit, + / − zoom, 0 resets.',
    ),
  );
  viewportHost.append(
    fallback,
    legend,
    legendToggle,
    viewportCaption,
    controls,
    help,
    modeControls,
    flightHud,
  );
  const tooltip = element('div', undefined, 'day-tooltip');
  tooltip.setAttribute('role', 'status');
  tooltip.hidden = true;
  const closeDay = () => {
    selectedDay = null;
    selectedBuilding = null;
    dayPinned = false;
    tooltip.hidden = true;
    actions.closeDay?.();
  };
  tooltip.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDay();
    }
  });
  main.append(tooltip);

  const status = element('p', undefined, 'status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const warnings = element('details', undefined, 'warnings');
  warnings.hidden = true;
  warnings.append(element('summary', 'About this data'));
  const warningText = element('div');
  warnings.append(warningText);
  const footer = element('section', undefined, 'statistics');
  footer.setAttribute('aria-label', 'City statistics');
  const datasetCount = element('p', undefined, 'dataset-count sr-only');
  const inspector = element(
    'details',
    undefined,
    'data-inspector daily-inspector',
  );
  inspector.append(element('summary', 'Inspect daily data'));
  const seed = element('p', undefined, 'seed');
  const tableWrapper = element('div', undefined, 'table-wrapper');
  tableWrapper.tabIndex = 0;
  tableWrapper.setAttribute('role', 'region');
  tableWrapper.setAttribute('aria-label', 'Scrollable daily contribution data');
  const table = element('table');
  table.append(
    element('caption', 'Daily contributions and repository attribution'),
  );
  const thead = element('thead');
  const headingRow = element('tr');
  for (const label of [
    'Date (UTC)',
    'Contributions',
    'Repository commits',
    'Other activity',
  ]) {
    const th = element('th', label);
    th.scope = 'col';
    headingRow.append(th);
  }
  thead.append(headingRow);
  const tbody = element('tbody');
  table.append(thead, tbody);
  tableWrapper.append(table);
  inspector.append(seed, tableWrapper);
  const footnote = element('footer', 'Your code. Your corner of the city. ');
  const source = element('a', 'Source · AGPL-3.0');
  source.href = '/source.zip';
  source.download = 'contribution-city-source.zip';
  footnote.append(source);
  const mapCredit = element('a', '© OpenStreetMap contributors');
  mapCredit.href = 'https://www.openstreetmap.org/copyright';
  mapCredit.target = '_blank';
  mapCredit.rel = 'noopener noreferrer';
  footnote.append(mapCredit);
  const repoInspector = element(
    'details',
    undefined,
    'repo-inspector data-inspector',
  );
  repoInspector.append(element('summary', 'Inspect repositories'));
  const repoTableWrapper = element('div', undefined, 'table-wrapper');
  repoTableWrapper.tabIndex = 0;
  repoTableWrapper.setAttribute('role', 'region');
  repoTableWrapper.setAttribute('aria-label', 'Scrollable repository data');
  const repoTable = element('table');
  repoTable.append(
    element(
      'caption',
      'Authored commits fetched for the displayed year. Partial scans are labelled.',
    ),
  );
  const repoHead = element('thead'),
    repoRow = element('tr');
  for (const label of [
    'Repository',
    'Commits fetched',
    'Calendar matched',
    'Stars',
    'Language',
    'Scan',
  ]) {
    const th = element('th', label);
    th.scope = 'col';
    repoRow.append(th);
  }
  repoHead.append(repoRow);
  const repoBody = element('tbody', undefined, 'repo-table-body');
  repoTable.append(repoHead, repoBody);
  repoTableWrapper.append(repoTable);
  repoInspector.append(repoTableWrapper);
  main.append(
    header,
    toolbar,
    viewportHost,
    status,
    warnings,
    footer,
    datasetCount,
    repoInspector,
    inspector,
    footnote,
  );
  root.replaceChildren(main);

  const renderTooltip = () => {
    if ((!selectedDay && !selectedBuilding) || !currentCity) {
      tooltip.hidden = true;
      return;
    }
    tooltip.hidden = false;
    if (tooltipDirty) {
      if (selectedBuilding) {
        const building = selectedBuilding,
          repo = building.repo;
        tooltip.replaceChildren(
          element(
            'p',
            repo ? 'Repository' : 'Unmatched contributions',
            'tooltip-date',
          ),
          element('h3', building.name),
        );
        tooltip.append(
          element(
            'p',
            `${number(building.commits)} ${repo ? 'authored commits fetched' : 'contributions'} · ${shortDate(currentCity.metadata.startDate)} – ${shortDate(currentCity.metadata.endDate)}`,
            'repo-description',
          ),
        );
        if (repo) {
          if (repo.description)
            tooltip.append(element('p', repo.description, 'repo-description'));
          tooltip.append(
            element(
              'p',
              `${repo.language ?? 'No primary language'} · ${number(repo.stars ?? 0)} stars`,
              'repo-description',
            ),
          );
          tooltip.append(
            element(
              'p',
              building.scanComplete
                ? 'Default-branch commit scan complete.'
                : 'Partial or unavailable default-branch commit scan. The building uses known repository metadata and fetched activity.',
              'repo-scan',
            ),
          );
          const link = element('a', 'Open repository ↗', 'repo-link');
          try {
            const url = new URL(repo.url);
            if (url.protocol === 'https:' && url.hostname === 'github.com')
              link.href = url.href;
          } catch {
            /* Keep malformed upstream links inert. */
          }
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          tooltip.append(link);
          const visit = button(
            'Move the camera to this repository',
            'View building',
            'visit-building',
          );
          visit.addEventListener('click', () => actions.visit?.(building.id));
          tooltip.append(visit);
        } else
          tooltip.append(
            element(
              'p',
              'Issues, pull requests, reviews, private or omitted repositories, and calendar activity not matched to fetched commits.',
              'repo-description',
            ),
          );
      } else if (selectedDay) {
        tooltip.replaceChildren(
          element('p', longDate(selectedDay.date), 'tooltip-date'),
          element(
            'h3',
            `${number(selectedDay.contributionCount)} ${selectedDay.contributionCount === 1 ? 'contribution' : 'contributions'}`,
          ),
        );
        const repos = new Map(
          currentCity.repositories.map((repo) => [repo.id, repo]),
        );
        for (const segment of selectedDay.segments) {
          const id = segmentId(segment);
          const row = element('div', undefined, 'tooltip-row');
          const dot = element('span', undefined, 'swatch-dot');
          dot.style.background = colors.get(id)!;
          row.append(
            dot,
            element(
              'span',
              segment.kind === 'other'
                ? 'Other activity'
                : repos.get(segment.repoId)!.name,
            ),
            element('strong', number(segment.count)),
          );
          tooltip.append(row);
        }
        if (!selectedDay.contributionCount)
          tooltip.append(element('p', 'A quiet day.', 'quiet-day'));
      }
      if (dayPinned) {
        const close = button('Close details', '×', 'tooltip-close');
        close.addEventListener('click', closeDay);
        tooltip.append(close);
      }
      tooltipDirty = false;
    }
    const width = tooltip.offsetWidth || 260;
    const height = tooltip.offsetHeight || 180;
    tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, selectedPoint.x + 16))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, selectedPoint.y + 16))}px`;
  };
  const setFilter = (id: string | null) => {
    selectedRepo = id;
    actions.filter?.(id);
    clearFilter.hidden = !id;
    legendList
      .querySelectorAll<HTMLButtonElement>('.repo-filter')
      .forEach((node) =>
        node.setAttribute('aria-pressed', String(node.dataset.repo === id)),
      );
  };
  clearFilter.addEventListener('click', () => setFilter(null));
  const renderInspector = () => {
    if (!currentCity) return;
    const repos = new Map(
      currentCity.repositories.map((repo) => [repo.id, repo]),
    );
    tbody.replaceChildren(
      ...currentCity.days.map((day) => {
        const row = element('tr');
        const date = element('th', day.date);
        date.scope = 'row';
        const repoCell = element('td');
        let other = 0;
        for (const segment of day.segments) {
          if (segment.kind === 'other') other += segment.count;
          else {
            const label = element(
              'span',
              `${repos.get(segment.repoId)!.name}: ${segment.count}`,
              'repo-label',
            );
            label.style.setProperty(
              '--repo-color',
              colors.get(segment.repoId)!,
            );
            repoCell.append(label);
          }
        }
        if (!repoCell.childElementCount) repoCell.textContent = '—';
        row.append(
          date,
          element('td', number(day.contributionCount)),
          repoCell,
          element('td', number(other)),
        );
        return row;
      }),
    );
  };
  inspector.addEventListener('toggle', () => {
    if (inspector.open) renderInspector();
  });
  return {
    viewportHost,
    resetButton,
    updateData: (city) => {
      currentCity = city;
      selectedDay = null;
      selectedBuilding = null;
      selectedRepo = null;
      dayPinned = false;
      tooltip.hidden = true;
      colors.clear();
      const catalog = city.repositoryCatalog ?? city.repositories;
      catalog.forEach((repo) => colors.set(repo.id, repo.color));
      colors.set(OTHER_ID, OTHER_ACTIVITY_COLOR);
      cityName.textContent =
        city.metadata.source === 'demo'
          ? 'The demo neighborhood'
          : `@${city.metadata.username}’s neighborhood`;
      range.textContent = `${shortDate(city.metadata.startDate)} – ${shortDate(city.metadata.endDate)} · UTC`;
      badge.textContent =
        city.metadata.source === 'demo'
          ? 'Demo city'
          : `@${city.metadata.username}`;
      datasetCount.textContent = `${city.days.length} days · ${catalog.length} repositories · ${number(city.metadata.totalContributions)} contributions`;
      seed.textContent = city.metadata.seed
        ? `Fixed seed: ${city.metadata.seed}`
        : 'GitHub calendar totals are authoritative. Repository attribution can be incomplete.';
      legendList.replaceChildren();
      clearFilter.hidden = true;
      const entries = [
        ...catalog.map((repo) => ({
          id: repo.id,
          name: repo.name,
          count: repo.authoredCommitCount ?? repo.commitCount,
        })),
        {
          id: OTHER_ID,
          name: 'Other activity',
          count: city.metadata.otherActivityCount,
        },
      ];
      for (const entry of entries) {
        const row = element('div', undefined, 'legend-row');
        const picker = element('input', undefined, 'repo-color');
        picker.type = 'color';
        picker.value = colors.get(entry.id)!;
        picker.setAttribute('aria-label', `Change color for ${entry.name}`);
        picker.title = `Change color for ${entry.name}`;
        picker.addEventListener('input', () => {
          colors.set(entry.id, picker.value);
          actions.recolor?.(entry.id, picker.value);
          const repo = catalog.find((candidate) => candidate.id === entry.id);
          if (repo) repo.color = picker.value;
          tooltipDirty = true;
          renderTooltip();
          if (inspector.open) renderInspector();
        });
        const filterButton = button(`Isolate ${entry.name}`, '', 'repo-filter');
        filterButton.dataset.repo = entry.id;
        filterButton.setAttribute('aria-pressed', 'false');
        filterButton.title =
          entry.id === OTHER_ID
            ? 'Unmatched calendar activity'
            : `${entry.name} · commits fetched for this year`;
        filterButton.append(
          element('span', entry.name, 'repo-name'),
          element('span', number(entry.count), 'repo-count'),
        );
        filterButton.addEventListener('click', () =>
          setFilter(selectedRepo === entry.id ? null : entry.id),
        );
        const visit = button(`View ${entry.name}`, '↗', 'legend-view');
        visit.hidden = repositoryView.getAttribute('aria-pressed') !== 'true';
        visit.addEventListener('click', () => actions.visit?.(entry.id));
        row.append(picker, filterButton, visit);
        legendList.append(row);
      }
      warningText.replaceChildren(
        ...city.warnings.map((warning) => element('p', warning.message)),
      );
      warnings.hidden = city.warnings.length === 0;
      repoBody.replaceChildren(
        ...catalog.map((repo) => {
          const row = element('tr'),
            name = element('th', repo.name);
          name.scope = 'row';
          row.append(
            name,
            ...[
              number(repo.authoredCommitCount ?? repo.commitCount),
              number(repo.commitCount),
              number(repo.stars ?? 0),
              repo.language ?? '—',
              repo.scanComplete === false ? 'Partial' : 'Complete',
            ].map((value) => element('td', value)),
          );
          return row;
        }),
      );
      const stats = cityStatistics(city);
      footer.replaceChildren();
      const values = [
        ['Contributions', number(stats.total), 'Across 365 days'],
        [
          'Busiest day',
          stats.busiestDay ? number(stats.busiestDay.contributionCount) : '0',
          stats.busiestDay
            ? shortDate(stats.busiestDay.date)
            : 'No activity yet',
        ],
        [
          'Longest streak',
          `${stats.longestStreak} ${stats.longestStreak === 1 ? 'day' : 'days'}`,
          `${stats.activeDays} active days`,
        ],
        ['Repositories', number(catalog.length), 'In this city'],
      ];
      for (const [label, value, note] of values) {
        const stat = element('div', undefined, 'stat');
        stat.append(
          element('p', label!, 'stat-label'),
          element('strong', value!),
          element('p', note!, 'stat-note'),
        );
        footer.append(stat);
      }
      renderInspector();
    },
    updateGraphicsState: (state) => {
      viewportHost.dataset.graphics = state;
      fallback.hidden = state === 'ready';
      controls.hidden = state !== 'ready';
      exportButton.disabled = state !== 'ready';
      flyButton.disabled = state !== 'ready';
      if (state !== 'ready') {
        fallback.querySelector('h2')!.textContent =
          state === 'loading'
            ? 'Preparing the reference city'
            : state === 'lost'
              ? 'Graphics connection interrupted'
              : 'WebGL unavailable';
        fallback.querySelector('p')!.textContent =
          state === 'loading'
            ? 'Loading the map and building its geometry. Your repository data is ready below.'
            : 'The city needs WebGL 2. Enable graphics acceleration or try another browser. You can still inspect the daily data below.';
      }
    },
    announce: (message, error = false) => {
      status.textContent = message;
      status.classList.toggle('error', error);
    },
    setLoading: (loading, message) => {
      if (loading) status.classList.remove('error');
      build.disabled = loading;
      username.disabled = loading;
      token.disabled = loading;
      build.textContent = loading ? 'Building…' : 'Build city';
      cancel.hidden = !loading;
      viewportHost.setAttribute('aria-busy', String(loading));
      if (message) status.textContent = message;
    },
    setUsername: (value) => {
      username.value = value;
    },
    clearToken: () => {
      token.value = '';
    },
    showDay: (day, point, pinned = false) => {
      if (selectedDay !== day || dayPinned !== pinned) tooltipDirty = true;
      selectedDay = day;
      selectedBuilding = null;
      selectedPoint = point;
      dayPinned = pinned;
      tooltip.classList.toggle('pinned', pinned);
      tooltip.tabIndex = pinned ? 0 : -1;
      renderTooltip();
    },
    updateZoom: (zoom) => {
      zoomLabel.textContent = `${zoom.toFixed(zoom < 0.1 ? 2 : 1)}×`;
    },
    updateOrbit: (enabled) => {
      rotation.setAttribute('aria-pressed', String(enabled));
      rotation.setAttribute(
        'aria-label',
        enabled ? 'Pause automatic rotation' : 'Enable automatic rotation',
      );
    },
    showRepository: (building, point, pinned = false) => {
      if (selectedBuilding !== building || dayPinned !== pinned)
        tooltipDirty = true;
      selectedBuilding = building;
      selectedDay = null;
      selectedPoint = point;
      dayPinned = pinned;
      tooltip.classList.toggle('pinned', pinned);
      tooltip.tabIndex = pinned ? 0 : -1;
      renderTooltip();
    },
    updateFlight: (status) => {
      flightStatus = status;
      flightHud.hidden = !status.active;
      flyButton.setAttribute('aria-pressed', String(status.active));
      flyButton.textContent = status.active ? 'Flying' : 'Fly';
      rotation.hidden =
        zoomOut.hidden =
        zoomLabel.hidden =
        zoomIn.hidden =
        resetCamera.hidden =
          status.active;
      flightReadout.textContent = `${status.paused ? 'Paused' : `${Math.round(status.speed)} u/s`} · altitude ${Math.round(status.altitude)} u`;
      pauseFlight.textContent = status.paused ? 'Resume' : 'Pause';
      pauseFlight.setAttribute(
        'aria-label',
        status.paused ? 'Resume flight' : 'Pause flight',
      );
      if (document.activeElement !== throttle)
        throttle.value = String(Math.round(status.throttle));
      viewportHost.classList.toggle('flying', status.active);
      modeControls.hidden = status.active;
    },
  };
}
