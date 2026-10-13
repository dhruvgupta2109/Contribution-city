import { describe, expect, it } from 'vitest';
import { parsePublicCalendar } from './public-calendar.ts';

describe('public GitHub calendar parsing', () => {
  it('reads exact totals from associated tooltips, independent of cell order and colour level', () => {
    const html = `<table><td id="b" data-date="2026-10-13" data-level="4"></td><td id="a" data-date="2026-10-12" data-level="1"></td><td id="c" data-date="2026-10-11" data-level="0"></td></table>
      <tool-tip for="a">1 contribution on October 12th.</tool-tip><tool-tip for="b">1,234 contributions on October 13th.</tool-tip><tool-tip for="c">No contributions on October 11th.</tool-tip>`;
    expect(parsePublicCalendar(html)).toEqual([{ date: '2026-10-13', contributionCount: 1234 }, { date: '2026-10-12', contributionCount: 1 }, { date: '2026-10-11', contributionCount: 0 }]);
  });
  it('fails clearly when the format changes instead of inventing counts from levels', () => {
    expect(() => parsePublicCalendar('<td id="a" data-date="2026-10-13" data-level="4"></td>')).toThrow('format has changed');
    expect(() => parsePublicCalendar('<html>No calendar</html>')).toThrow('could not be read');
  });
});
