/**
 * Hybrid logical clock (docs/ARCHITECTURE.md §5.0). Orders events written by
 * different devices into one stable sequence even when their wall clocks
 * drift: a stamp is never lower than any stamp the device has already seen.
 */

import type { Id, Millis } from "./types";

export interface Hlc {
  wall: Millis;
  counter: number;
}

/**
 * Sortable string form: "<wall 13 digits>-<counter 4 base36>-<deviceId>".
 * Plain string comparison gives the global order; the device id breaks ties
 * and makes every stamp unique, so it doubles as the event id.
 */
export type Stamp = string;

const WALL_DIGITS = 13;
const COUNTER_DIGITS = 4;
const COUNTER_MAX = 36 ** COUNTER_DIGITS - 1;

export const ZERO_HLC: Hlc = { wall: 0, counter: 0 };

/** Advance the clock for a local event. */
export function hlcTick(clock: Hlc, now: Millis): Hlc {
  if (now > clock.wall) return { wall: now, counter: 0 };
  return bump(clock);
}

/** Merge a stamp seen in another device's log so later local events sort after it. */
export function hlcObserve(clock: Hlc, seen: Hlc, now: Millis): Hlc {
  const wall = Math.max(clock.wall, seen.wall, now);
  if (wall === now && wall > clock.wall && wall > seen.wall) return { wall, counter: 0 };
  const counter = Math.max(wall === clock.wall ? clock.counter : -1, wall === seen.wall ? seen.counter : -1);
  return counter >= COUNTER_MAX ? { wall: wall + 1, counter: 0 } : { wall, counter: counter + 1 };
}

function bump(c: Hlc): Hlc {
  return c.counter >= COUNTER_MAX ? { wall: c.wall + 1, counter: 0 } : { wall: c.wall, counter: c.counter + 1 };
}

export function formatStamp(c: Hlc, deviceId: Id): Stamp {
  return `${String(c.wall).padStart(WALL_DIGITS, "0")}-${c.counter.toString(36).padStart(COUNTER_DIGITS, "0")}-${deviceId}`;
}

/** Inverse of formatStamp; null when the string is not a stamp. */
export function parseStamp(s: string): { clock: Hlc; deviceId: Id } | null {
  const m = /^(\d{13})-([0-9a-z]{4})-(.+)$/.exec(s);
  if (!m) return null;
  return { clock: { wall: Number(m[1]), counter: parseInt(m[2]!, 36) }, deviceId: m[3]! };
}
