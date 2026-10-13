import type { DateKey } from './types.ts';

export const DAY_COUNT = 365;
const DAY_MS = 86_400_000;

/** Reject invalid dates instead of silently rolling them into another month. */
export function parseDateKey(date: DateKey): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return parsed;
}

/** Includes endDate and the preceding 364 UTC dates, even across leap years. */
export function contributionDates(endDate: DateKey): DateKey[] {
  const end = parseDateKey(endDate).getTime();
  return Array.from({ length: DAY_COUNT }, (_, index) =>
    new Date(end - (DAY_COUNT - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
}
