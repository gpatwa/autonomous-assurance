/**
 * Time helpers. Centralized because detection windows, correlation windows,
 * snapshot freshness, and audit timestamps all depend on consistent
 * ISO-8601 handling and on a Clock that tests can swap.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function nowIso(clock: Clock = systemClock): string {
  return clock.now().toISOString();
}

export function parseIso(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Not a valid ISO-8601 datetime: ${value}`);
  }
  return d;
}

export function isoMinus(iso: string, ms: number): string {
  return new Date(parseIso(iso).getTime() - ms).toISOString();
}

export function isoPlus(iso: string, ms: number): string {
  return new Date(parseIso(iso).getTime() + ms).toISOString();
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
