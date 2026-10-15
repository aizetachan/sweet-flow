/** Non-destructive cutting: cut points → contiguous segments of a media. */

import type { Take } from "./types";

export interface Segment {
  inSec: number;
  outSec: number;
}

export const round1 = (s: number) => Math.round(s * 10) / 10;

/** Cut points (any order, duplicates, out of range) → segments covering [0, duration]. */
export function segmentsFromCuts(durationSec: number, cuts: number[]): Segment[] {
  const end = round1(durationSec);
  const pts = [...new Set(cuts.map(round1))].filter((c) => c > 0 && c < end).sort((a, b) => a - b);
  const edges = [0, ...pts, end];
  const out: Segment[] = [];
  for (let i = 0; i < edges.length - 1; i++) out.push({ inSec: edges[i]!, outSec: edges[i + 1]! });
  return out;
}

export const takeDuration = (t: Pick<Take, "inSec" | "outSec">) => round1(t.outSec - t.inSec);

/** "00:04.2" */
export function formatTc(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}
