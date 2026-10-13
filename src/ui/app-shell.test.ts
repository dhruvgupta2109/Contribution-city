// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDemoCity } from '../data/demo.ts';
import { createViewport } from '../rendering/viewport.ts';
import { createAppShell } from './app-shell.ts';
import { createRepositoryLayout } from '../rendering/repository-layout.ts';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const shell = createAppShell(root);
  shell.updateData(generateDemoCity());
  return { root, shell };
}

describe('demo shell', () => {
  it('labels the demo and exposes all 365 daily totals for inspection', () => {
    const { root } = setup();
    expect(root.querySelector('h1')?.textContent).toBe('Contribution City');
    expect(root.querySelector('.date-range')?.textContent).toContain(
      '14 Oct 2025',
    );
    expect(root.querySelector('.date-range')?.textContent).toContain(
      '13 Oct 2026',
    );
    expect(root.querySelector('.dataset-count')?.textContent).toContain(
      '365 days',
    );
    expect(root.querySelectorAll('.daily-inspector tbody tr')).toHaveLength(
      365,
    );
    expect(root.querySelector('.daily-inspector summary')?.textContent).toBe(
      'Inspect daily data',
    );
    expect(root.querySelector('.table-wrapper')?.getAttribute('tabindex')).toBe(
      '0',
    );
  });

  it('updates the inspector without retaining a previous dataset', () => {
    const { root, shell } = setup();
    const baseline = root.querySelector('.daily-inspector tbody')!.innerHTML;
    shell.updateData(generateDemoCity({ seed: 'new-dataset' }));
    expect(root.querySelector('.daily-inspector tbody')!.innerHTML).not.toBe(
      baseline,
    );
    shell.updateData(generateDemoCity());
    expect(root.querySelector('.daily-inspector tbody')!.innerHTML).toBe(
      baseline,
    );
    expect(root.querySelectorAll('.daily-inspector tbody tr')).toHaveLength(
      365,
    );
  });

  it('keeps the demo readable when WebGL 2 is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { root, shell } = setup();
    const viewport = createViewport(
      shell.viewportHost,
      shell.updateGraphicsState,
    );
    expect(shell.viewportHost.dataset.graphics).toBe('unavailable');
    expect(root.querySelector('.viewport-message h2')?.textContent).toBe(
      'WebGL unavailable',
    );
    expect(root.querySelector('.viewport-message p')?.textContent).toContain(
      'inspect the daily data',
    );
    expect(root.querySelector('canvas')).toBeNull();
    expect(root.querySelectorAll('.daily-inspector tbody tr')).toHaveLength(
      365,
    );
    expect(() => viewport.render()).not.toThrow();
    expect(() => viewport.dispose()).not.toThrow();
  });

  it('handles a graphics initialization failure without breaking the shell', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => {
        throw new Error('Graphics initialization blocked');
      },
    );
    const { root, shell } = setup();
    expect(() =>
      createViewport(shell.viewportHost, shell.updateGraphicsState),
    ).not.toThrow();
    expect(root.querySelector('.viewport-message h2')?.textContent).toBe(
      'WebGL unavailable',
    );
    expect(root.querySelectorAll('.daily-inspector tbody tr')).toHaveLength(
      365,
    );
  });
  it('isolates a repository, clears the filter, and exposes its state to keyboard controls', () => {
    const root = document.createElement('div');
    const filter = vi.fn();
    const shell = createAppShell(root, { filter });
    const city = generateDemoCity();
    shell.updateData(city);
    const control = root.querySelector<HTMLButtonElement>('.repo-filter')!;
    control.click();
    expect(filter).toHaveBeenLastCalledWith(city.repositories[0]!.id);
    expect(control.getAttribute('aria-pressed')).toBe('true');
    control.click();
    expect(filter).toHaveBeenLastCalledWith(null);
    expect(control.getAttribute('aria-pressed')).toBe('false');
  });
  it('recolors an inspected day immediately and keeps the tooltip inside the viewport', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const recolor = vi.fn();
    const shell = createAppShell(root, { recolor });
    const city = generateDemoCity();
    shell.updateData(city);
    const repository = city.repositories[0]!;
    const day = city.days.find((day) =>
      day.segments.some(
        (segment) =>
          segment.kind === 'repository' && segment.repoId === repository.id,
      ),
    )!;
    shell.showDay(day, { x: window.innerWidth - 1, y: window.innerHeight - 1 });
    expect(root.querySelector('.day-tooltip h3')!.textContent).toContain(
      String(day.contributionCount),
    );
    const color = root.querySelector<HTMLInputElement>('.repo-color')!;
    color.value = '#123456';
    color.dispatchEvent(new Event('input'));
    expect(recolor).toHaveBeenLastCalledWith(repository.id, '#123456');
    expect(
      root.querySelector<HTMLElement>('.swatch-dot')!.style.background,
    ).toBe('#123456');
    const tooltip = root.querySelector<HTMLElement>('.day-tooltip')!;
    expect(parseFloat(tooltip.style.left)).toBeLessThanOrEqual(
      window.innerWidth - 260 - 12,
    );
    expect(parseFloat(tooltip.style.top)).toBeLessThanOrEqual(
      window.innerHeight - 180 - 12,
    );
    shell.showDay(null, { x: 0, y: 0 });
    expect(tooltip.hidden).toBe(true);
  });
  it('makes pinned day details focusable and dismisses them with Escape or the close button', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const closeDay = vi.fn();
    const shell = createAppShell(root, { closeDay });
    const city = generateDemoCity();
    shell.updateData(city);
    const day = city.days.find((day) => day.segments.length > 1)!;
    const tooltip = root.querySelector<HTMLElement>('.day-tooltip')!;
    shell.showDay(day, { x: 30, y: 30 }, true);
    expect(tooltip.classList.contains('pinned')).toBe(true);
    expect(tooltip.tabIndex).toBe(0);
    expect(tooltip.querySelectorAll('.tooltip-row')).toHaveLength(
      day.segments.length,
    );
    tooltip.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeDay).toHaveBeenCalledTimes(1);
    expect(tooltip.hidden).toBe(true);
    shell.showDay(day, { x: 30, y: 30 }, true);
    tooltip.querySelector<HTMLButtonElement>('.tooltip-close')!.click();
    expect(closeDay).toHaveBeenCalledTimes(2);
    expect(tooltip.hidden).toBe(true);
    shell.showDay(day, { x: 30, y: 30 });
    expect(tooltip.tabIndex).toBe(-1);
    expect(tooltip.querySelector('.tooltip-close')).toBeNull();
  });
  it('switches views and themes and keeps flight actions separate from orbit controls', () => {
    const root = document.createElement('div'),
      actions = {
        view: vi.fn(),
        theme: vi.fn(),
        fly: vi.fn(),
        pauseFlight: vi.fn(),
        throttle: vi.fn(),
      };
    const shell = createAppShell(root, actions);
    shell.updateData(generateDemoCity());
    root
      .querySelector<HTMLButtonElement>(
        '[aria-label="Show the daily contribution calendar"]',
      )!
      .click();
    expect(actions.view).toHaveBeenLastCalledWith('calendar');
    root
      .querySelector<HTMLButtonElement>(
        '[aria-label="Show repository towers"]',
      )!
      .click();
    expect(actions.view).toHaveBeenLastCalledWith('repositories');
    const theme = root.querySelector<HTMLSelectElement>('#city-theme')!;
    theme.value = '2';
    theme.dispatchEvent(new Event('change'));
    expect(actions.theme).toHaveBeenLastCalledWith(2);
    root.querySelector<HTMLButtonElement>('.fly-button')!.click();
    expect(actions.fly).toHaveBeenLastCalledWith(true);
    shell.updateFlight({
      active: true,
      paused: true,
      speed: 55,
      altitude: 120,
      throttle: 55,
    });
    expect(root.querySelector<HTMLElement>('.flight-hud')!.hidden).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.hidden,
    ).toBe(true);
    root
      .querySelector<HTMLButtonElement>('[aria-label="Resume flight"]')!
      .click();
    expect(actions.pauseFlight).toHaveBeenCalledOnce();
    const throttle = root.querySelector<HTMLInputElement>('#flight-throttle')!;
    throttle.value = '150';
    throttle.dispatchEvent(new Event('input'));
    expect(actions.throttle).toHaveBeenLastCalledWith(150);
    root
      .querySelector<HTMLButtonElement>('[aria-label="Exit flight"]')!
      .click();
    expect(actions.fly).toHaveBeenLastCalledWith(false);
  });
  it('shows exact repo counts, scan limitations, and a safe external repository link', () => {
    const { root, shell } = setup(),
      city = generateDemoCity(),
      building = createRepositoryLayout(city).buildings[0]!;
    building.scanComplete = false;
    shell.showRepository(building, { x: 50, y: 50 }, true);
    const tooltip = root.querySelector<HTMLElement>('.day-tooltip')!;
    expect(tooltip.textContent).toContain(String(building.commits));
    expect(tooltip.querySelector('.repo-scan')!.textContent).toContain(
      'Partial',
    );
    expect(tooltip.querySelector<HTMLAnchorElement>('a')!.href).toBe(
      building.repo!.url,
    );
    expect(root.querySelectorAll('.repo-table-body tr')).toHaveLength(5);
  });
});
