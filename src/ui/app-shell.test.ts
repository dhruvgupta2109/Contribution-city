// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDemoCity } from '../data/demo.ts';
import { createViewport } from '../rendering/viewport.ts';
import { createAppShell } from './app-shell.ts';

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
    expect(root.querySelector('.date-range')?.textContent).toContain('14 Oct 2025');
    expect(root.querySelector('.date-range')?.textContent).toContain('13 Oct 2026');
    expect(root.querySelector('.dataset-count')?.textContent).toContain('365 days');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(365);
    expect(root.querySelector('.data-inspector summary')?.textContent).toBe('Inspect daily data');
    expect(root.querySelector('.table-wrapper')?.getAttribute('tabindex')).toBe('0');
  });

  it('updates the inspector without retaining a previous dataset', () => {
    const { root, shell } = setup();
    const baseline = root.querySelector('tbody')!.innerHTML;
    shell.updateData(generateDemoCity({ seed: 'new-dataset' }));
    expect(root.querySelector('tbody')!.innerHTML).not.toBe(baseline);
    shell.updateData(generateDemoCity());
    expect(root.querySelector('tbody')!.innerHTML).toBe(baseline);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(365);
  });

  it('keeps the demo readable when WebGL 2 is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { root, shell } = setup();
    const viewport = createViewport(shell.viewportHost, shell.updateGraphicsState);
    expect(shell.viewportHost.dataset.graphics).toBe('unavailable');
    expect(root.querySelector('.viewport-message h2')?.textContent).toBe('WebGL unavailable');
    expect(root.querySelector('.viewport-message p')?.textContent).toContain('inspect the daily data');
    expect(root.querySelector('canvas')).toBeNull();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(365);
    expect(() => viewport.render()).not.toThrow();
    expect(() => viewport.dispose()).not.toThrow();
  });

  it('handles a graphics initialization failure without breaking the shell', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('Graphics initialization blocked');
    });
    const { root, shell } = setup();
    expect(() => createViewport(shell.viewportHost, shell.updateGraphicsState)).not.toThrow();
    expect(root.querySelector('.viewport-message h2')?.textContent).toBe('WebGL unavailable');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(365);
  });
  it('isolates a repository, clears the filter, and exposes its state to keyboard controls', () => {
    const root = document.createElement('div'); const filter = vi.fn();
    const shell = createAppShell(root, { filter }); const city = generateDemoCity(); shell.updateData(city);
    const control = root.querySelector<HTMLButtonElement>('.repo-filter')!;
    control.click(); expect(filter).toHaveBeenLastCalledWith(city.repositories[0]!.id);
    expect(control.getAttribute('aria-pressed')).toBe('true');
    control.click(); expect(filter).toHaveBeenLastCalledWith(null); expect(control.getAttribute('aria-pressed')).toBe('false');
  });
  it('recolors an inspected day immediately and keeps the tooltip inside the viewport', () => {
    const root = document.createElement('div'); document.body.append(root); const recolor = vi.fn();
    const shell = createAppShell(root, { recolor }); const city = generateDemoCity(); shell.updateData(city);
    const repository = city.repositories[0]!;
    const day = city.days.find((day) => day.segments.some((segment) => segment.kind === 'repository' && segment.repoId === repository.id))!;
    shell.showDay(day, { x: window.innerWidth - 1, y: window.innerHeight - 1 });
    expect(root.querySelector('.day-tooltip h3')!.textContent).toContain(String(day.contributionCount));
    const color = root.querySelector<HTMLInputElement>('.repo-color')!; color.value = '#123456'; color.dispatchEvent(new Event('input'));
    expect(recolor).toHaveBeenLastCalledWith(repository.id, '#123456');
    expect(root.querySelector<HTMLElement>('.swatch-dot')!.style.background).toBe('#123456');
    const tooltip = root.querySelector<HTMLElement>('.day-tooltip')!;
    expect(parseFloat(tooltip.style.left)).toBeLessThanOrEqual(window.innerWidth - 260 - 12);
    expect(parseFloat(tooltip.style.top)).toBeLessThanOrEqual(window.innerHeight - 180 - 12);
    shell.showDay(null, { x: 0, y: 0 }); expect(tooltip.hidden).toBe(true);
  });
  it('makes pinned day details focusable and dismisses them with Escape or the close button', () => {
    const root = document.createElement('div'); document.body.append(root); const closeDay = vi.fn();
    const shell = createAppShell(root, { closeDay }); const city = generateDemoCity(); shell.updateData(city);
    const day = city.days.find((day) => day.segments.length > 1)!;
    const tooltip = root.querySelector<HTMLElement>('.day-tooltip')!;
    shell.showDay(day, { x: 30, y: 30 }, true);
    expect(tooltip.classList.contains('pinned')).toBe(true);
    expect(tooltip.tabIndex).toBe(0);
    expect(tooltip.querySelectorAll('.tooltip-row')).toHaveLength(day.segments.length);
    tooltip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closeDay).toHaveBeenCalledTimes(1); expect(tooltip.hidden).toBe(true);
    shell.showDay(day, { x: 30, y: 30 }, true);
    tooltip.querySelector<HTMLButtonElement>('.tooltip-close')!.click();
    expect(closeDay).toHaveBeenCalledTimes(2); expect(tooltip.hidden).toBe(true);
    shell.showDay(day, { x: 30, y: 30 });
    expect(tooltip.tabIndex).toBe(-1); expect(tooltip.querySelector('.tooltip-close')).toBeNull();
  });
});
