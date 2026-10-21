/**
 * Frame accuracy (docs/INTERFAZ.md §4): a cut or a trim on a clip lands on
 * a frame of that clip's own video, not on the timeline's grid, so any frame
 * of the file can be reached even when the timeline runs at another rate. A
 * video's rate is read from the file the first time it is used.
 */

import { clipEnd, t6, toFrame, type Edit, type EditClip, type Media } from "@sweetflow/domain";
import type { Snapshot } from "../data/source";
import { useStore } from "../state/store";
import { shotPlay } from "./model";

const RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
const measured = new Map<string, number>();
const measuring = new Set<string>();

const isRealVideo = (m?: Media) => !!m?.url && m.kind === "video" && !m.url.startsWith("data:image");

/** A video's frame rate: from the production, or measured on this computer (null: not known yet). */
export function fpsOf(m?: Media): number | null {
  if (!m) return null;
  if (m.fps) return m.fps;
  if (m.url && measured.has(m.url)) return measured.get(m.url)!;
  if (isRealVideo(m)) measure(m);
  return null;
}

/** Plays a few frames silently and times them (the browser does not say a video's rate). */
function measure(m: Media): void {
  const url = m.url!;
  if (measuring.has(url)) return;
  measuring.add(url);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  type Rvfc = (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  const rvfc = (v as unknown as { requestVideoFrameCallback?: Rvfc }).requestVideoFrameCallback?.bind(v);
  if (!rvfc) return;
  const times: number[] = [];
  const done = () => {
    v.pause();
    v.removeAttribute("src");
    v.load();
  };
  const step = (_: number, meta: { mediaTime: number }) => {
    times.push(meta.mediaTime);
    if (times.length < 12) return void rvfc(step);
    done();
    const d = times.slice(1).map((t, i) => t - times[i]!).filter((x) => x > 0.001).sort((a, b) => a - b);
    const mid = d[Math.floor(d.length / 2)];
    if (!mid) return;
    const raw = 1 / mid;
    const fps = RATES.reduce((best, r) => (Math.abs(r - raw) < Math.abs(best - raw) ? r : best), RATES[0]!);
    measured.set(url, fps);
    useStore.getState().source.noteFps?.(m.id, fps);
  };
  rvfc(step);
  void v.play().catch(done);
}

/** The frame rate a clip cuts on: its video's, or the timeline's when it is not known. */
export function clipFps(s: Snapshot, e: Edit, c: EditClip): number {
  if (c.source.kind !== "shot") return e.format.fps;
  return fpsOf(shotPlay(s, c.source.nodeId)?.media) ?? e.format.fps;
}

/** Where in its file a clip is at time `t` of the timeline. */
function fileTime(s: Snapshot, c: EditClip, t: number): number {
  const fileIn = c.source.kind === "shot" ? (shotPlay(s, c.source.nodeId)?.fileIn ?? 0) : 0;
  return fileIn + c.inSec + (t - c.start);
}

/**
 * `t` moved to the start of the clip's frame there: the frame of its own
 * video under the pointer (inside the clip).
 */
export function onClipFrame(s: Snapshot, e: Edit, c: EditClip, t: number): number {
  const fps = clipFps(s, e, c);
  const ft = fileTime(s, c, t);
  const frame = Math.floor(ft * fps + 1e-6);
  const at = t6(t - (ft - frame / fps));
  return Math.min(clipEnd(c), Math.max(c.start, at));
}

/** The number of the clip's frame at `t` (of its own video), for the indicator. */
export function clipFrameAt(s: Snapshot, e: Edit, c: EditClip, t: number): number {
  return Math.floor(fileTime(s, c, t) * clipFps(s, e, c) + 1e-6);
}

/** A moving edge, on the clip's own frames (its source's grid, wherever it lands). */
export function edgeOnFrames(s: Snapshot, e: Edit, c: EditClip, delta: number, side: "left" | "right"): number {
  const fps = clipFps(s, e, c);
  const fileIn = c.source.kind === "shot" ? (shotPlay(s, c.source.nodeId)?.fileIn ?? 0) : 0;
  const edge = fileIn + (side === "left" ? c.inSec : c.outSec) + delta;
  return t6(Math.round(edge * fps) / fps - fileIn - (side === "left" ? c.inSec : c.outSec));
}

/** The timeline's frame nearest to `t`. */
export const onTimelineFrame = (e: Edit, t: number) => toFrame(Math.max(0, t), e.format.fps);

/** The clip on top under the playhead on video tracks (for stepping frames), if any. */
export function clipUnder(e: Edit, t: number): EditClip | null {
  const order = new Map(e.tracks.map((tr, i) => [tr.id, i]));
  let best: EditClip | null = null;
  for (const c of e.clips) {
    const kind = e.tracks.find((x) => x.id === c.trackId)?.kind;
    if (kind !== "video" || t < c.start || t >= clipEnd(c)) continue;
    if (!best || (order.get(c.trackId) ?? 0) > (order.get(best.trackId) ?? 0)) best = c;
  }
  return best;
}

