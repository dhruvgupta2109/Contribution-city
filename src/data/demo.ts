import { assembleCity, dateRange, hash, normalizeCalendar, type CityData } from './types';

export function createDemo(): CityData {
  const { start, end } = dateRange();
  const calendar = normalizeCalendar([], start, end);
  const names = ['contribution-city', 'atlas-ui', 'tiny-tools', 'open-source', 'daily-notes', 'experiments'];
  const attribution = names.map(name => ({ name, fullName: `demo/${name}`, daily: {} as Record<string, number> }));
  calendar.forEach((day, i) => {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    const active = hash(i * 7 + 11) > (weekday === 0 || weekday === 6 ? .49 : .13);
    const wave = Math.sin(i * .044) * .5 + .5;
    day.count = active ? Math.floor(2 + hash(i * 23) ** 1.9 * 21 + wave * 6) : 0;
    if (active && hash(i + 51) > .97) day.count += 18;
    let remaining = day.count;
    for (let r = 0; r < names.length; r++) {
      const count = Math.min(remaining, Math.floor(hash(i * 71 + r * 43) * (r === 0 ? 14 : 5)));
      attribution[r].daily[day.date] = count;
      remaining -= count;
    }
  });
  return { ...assembleCity('demo', 'The demo city', calendar, attribution), demo: true };
}
