/**
 * The editor's cuts (docs/INTERFAZ.md §4): a montage of a level (a scene, a
 * sequence or the whole production) or a group, on video and audio tracks.
 * Nothing is copied or rendered: each clip points at a shot (it plays the
 * shot's chosen take, and follows it when another is chosen) or at another
 * montage, nested as one block.
 *
 * Times are seconds, kept exact (not rounded to the timeline's frames), so a
 * cut can fall on any frame of its own clip even when the timeline runs at
 * another rate. Pure: every operation returns a new montage.
 */

import { childrenOf, isUnit, sortValue } from "./tree";
import type { Id, Millis, ProdNode, Production, ShotGroup } from "./types";

export interface EditFormat {
  width: number;
  height: number;
  /** Frames per second of the timeline (its ruler, timecode and moves). */
  fps: number;
}

export const DEFAULT_EDIT_FORMAT: EditFormat = { width: 1920, height: 1080, fps: 25 };

export type TrackKind = "video" | "audio";

export interface EditTrack {
  id: Id;
  kind: TrackKind;
  /** Silenced: its sound does not play (audio tracks). */
  muted?: boolean;
}

/** What a clip plays: a shot (its chosen take, followed), or a nested montage. */
export type ClipSource = { kind: "shot"; nodeId: Id } | { kind: "edit"; editId: Id };

export interface EditClip {
  id: Id;
  trackId: Id;
  source: ClipSource;
  /** Where it starts on the timeline. */
  start: number;
  /** The stretch of its source it uses, from the source's own start. */
  inSec: number;
  outSec: number;
  /** A video and its sound placed together share it: they move, trim and cut together. */
  linkId?: Id;
}

export interface Edit {
  id: Id;
  productionId: Id;
  /** The level it is the montage of (null and no group: the whole production). */
  nodeId: Id | null;
  /** A group: clips put together by hand into one block, with a name. */
  group?: { name: string };
  format: EditFormat;
  /** In order of their number within each kind: V1, V2… and A1, A2… */
  tracks: EditTrack[];
  clips: EditClip[];
  updatedAt: Millis;
  updatedBy: Id;
}

/** How long each source is, worked out by whoever holds the production (0: nothing to play). */
export type SourceLength = (src: ClipSource) => number;

/** Shortest a clip can be trimmed to (a frame at 1000 fps: anything a video has). */
export const MIN_CLIP = 0.001;

/** Exact seconds, without the floating-point dust of additions. */
export const t6 = (s: number) => Math.round(s * 1e6) / 1e6;

export const clipLength = (c: Pick<EditClip, "inSec" | "outSec">) => t6(c.outSec - c.inSec);
export const clipEnd = (c: EditClip) => t6(c.start + clipLength(c));

/** Where the last clip ends. */
export function editDuration(e: Pick<Edit, "clips">): number {
  return e.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

/** The nearest frame at `fps`. */
export const toFrame = (s: number, fps: number) => t6(Math.round(s * fps) / fps);

/** "00:00:04:12" (frames at `fps`). */
export function timecode(s: number, fps: number): string {
  const f = Math.max(0, Math.round(s * fps));
  const r = Math.round(fps);
  const ff = f % r;
  const total = Math.floor(f / r);
  const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
  return [hh, mm, ss, ff].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Track names as the UI shows them: V1, V2… A1, A2… */
export function trackName(e: Pick<Edit, "tracks">, trackId: Id): string {
  const t = e.tracks.find((x) => x.id === trackId);
  if (!t) return "";
  const same = e.tracks.filter((x) => x.kind === t.kind);
  return `${t.kind === "video" ? "V" : "A"}${same.indexOf(t) + 1}`;
}

/** A new, empty montage: two video and two audio tracks. */
export function newEdit(o: { id: Id; productionId: Id; nodeId: Id | null; group?: { name: string }; format?: EditFormat; newId: (p: string) => Id; now: Millis; by: Id }): Edit {
  return {
    id: o.id,
    productionId: o.productionId,
    nodeId: o.nodeId,
    ...(o.group ? { group: o.group } : {}),
    format: o.format ?? DEFAULT_EDIT_FORMAT,
    tracks: [
      { id: o.newId("tv"), kind: "video" },
      { id: o.newId("tv"), kind: "video" },
      { id: o.newId("ta"), kind: "audio" },
      { id: o.newId("ta"), kind: "audio" },
    ],
    clips: [],
    updatedAt: o.now,
    updatedBy: o.by,
  };
}

export const tracksOf = (e: Pick<Edit, "tracks">, kind: TrackKind) => e.tracks.filter((t) => t.kind === kind);

/** The clips that go with these (their linked video or sound). */
export function withLinked(e: Pick<Edit, "clips">, ids: Iterable<Id>): Set<Id> {
  const out = new Set(ids);
  const links = new Set(e.clips.filter((c) => out.has(c.id) && c.linkId).map((c) => c.linkId!));
  for (const c of e.clips) if (c.linkId && links.has(c.linkId)) out.add(c.id);
  return out;
}

/**
 * Makes room for `placed` on their tracks, as Premiere's overwrite does:
 * whatever lies under them is trimmed, split or taken out. A clip split in
 * two keeps its link on the left part; the right parts of a linked pair split
 * together share a new link.
 */
export function overwrite(clips: EditClip[], placed: EditClip[], newId: (p: string) => Id): EditClip[] {
  const placing = new Set(placed.map((c) => c.id));
  let rest = clips.filter((c) => !placing.has(c.id));
  const relink = new Map<Id, Id>();
  for (const p of placed) {
    const from = p.start, to = clipEnd(p);
    const next: EditClip[] = [];
    for (const c of rest) {
      const s = c.start, e = clipEnd(c);
      if (c.trackId !== p.trackId || e <= from || s >= to) {
        next.push(c);
        continue;
      }
      // Its part before the new clip.
      if (s < from) next.push({ ...c, outSec: t6(c.inSec + (from - s)) });
      // Its part after it.
      if (e > to) {
        const cut = t6(to - s);
        const right: EditClip = { ...c, id: s < from ? newId("cl") : c.id, start: to, inSec: t6(c.inSec + cut) };
        if (s < from && c.linkId) {
          if (!relink.has(c.linkId)) relink.set(c.linkId, newId("ln"));
          right.linkId = relink.get(c.linkId)!;
        }
        next.push(right);
      }
    }
    rest = next;
  }
  // A link left with a single clip is no link.
  const out = [...rest, ...placed];
  const count = new Map<Id, number>();
  for (const c of out) if (c.linkId) count.set(c.linkId, (count.get(c.linkId) ?? 0) + 1);
  return out.map((c) => (c.linkId && count.get(c.linkId)! < 2 ? stripLink(c) : c));
}

function stripLink(c: EditClip): EditClip {
  const { linkId: _l, ...rest } = c;
  return rest;
}

function touched<T extends Pick<Edit, "clips">>(e: T, clips: EditClip[]): T {
  return { ...e, clips: sortClips(clips) };
}

const sortClips = (clips: EditClip[]) => [...clips].sort((a, b) => a.start - b.start || (a.trackId < b.trackId ? -1 : 1));

/** New clips for sources dropped on a track at `at`, one after another (with the sound of each below, linked). */
export function placeSources(
  e: Edit,
  sources: Array<{ source: ClipSource; length: number }>,
  at: { trackId: Id; start: number },
  newId: (p: string) => Id,
  /** Its sound on this audio track (a video track dropped on); null: none. */
  audioTrackId: Id | null,
): { edit: Edit; placed: Id[] } {
  const placed: EditClip[] = [];
  let start = Math.max(0, t6(at.start));
  for (const s of sources) {
    if (s.length <= 0) continue;
    const linkId = audioTrackId ? newId("ln") : undefined;
    placed.push({ id: newId("cl"), trackId: at.trackId, source: s.source, start, inSec: 0, outSec: t6(s.length), ...(linkId ? { linkId } : {}) });
    if (audioTrackId) placed.push({ id: newId("cl"), trackId: audioTrackId, source: s.source, start, inSec: 0, outSec: t6(s.length), linkId });
    start = t6(start + s.length);
  }
  return { edit: touched(e, overwrite(e.clips, placed, newId)), placed: placed.map((c) => c.id) };
}

/**
 * Moves clips by `dt` seconds and `dTrack` tracks (within their kind; linked
 * ones move along in time and keep their own tracks if they are of the other
 * kind), overwriting what they land on.
 */
export function moveClips(e: Edit, ids: Iterable<Id>, dt: number, dTrack: { video: number; audio: number }, newId: (p: string) => Id): Edit {
  const moving = new Set(ids);
  const sel = e.clips.filter((c) => moving.has(c.id));
  if (!sel.length) return e;
  // Never before 0.
  const minStart = Math.min(...sel.map((c) => c.start));
  const shift = Math.max(dt, -minStart);
  const kindOf = (id: Id) => e.tracks.find((t) => t.id === id)?.kind ?? "video";
  const moved = sel.map((c) => {
    const kind = kindOf(c.trackId);
    const list = tracksOf(e, kind);
    const i = list.findIndex((t) => t.id === c.trackId);
    const d = kind === "video" ? dTrack.video : dTrack.audio;
    const to = list[Math.max(0, Math.min(list.length - 1, i + d))]!;
    return { ...c, trackId: to.id, start: t6(c.start + shift) };
  });
  return touched(e, overwrite(e.clips, moved, newId));
}

/** How far a clip's edge may go before it runs into its neighbour on the same track. */
function room(e: Edit, c: EditClip, ignore: Set<Id>): { before: number; after: number } {
  const others = e.clips.filter((x) => x.trackId === c.trackId && x.id !== c.id && !ignore.has(x.id));
  const before = Math.max(0, ...others.filter((x) => clipEnd(x) <= c.start + 1e-9).map(clipEnd));
  const afterList = others.filter((x) => x.start >= clipEnd(c) - 1e-9).map((x) => x.start);
  return { before, after: afterList.length ? Math.min(...afterList) : Infinity };
}

/**
 * Drags an edge of a clip (and of its linked one): `left` moves where it
 * starts in its source and on the timeline; `right`, where it ends. Never past
 * its source, its neighbours or shorter than a frame of a millisecond.
 */
export function trimClip(e: Edit, id: Id, side: "left" | "right", delta: number, length: SourceLength, linked = true): Edit {
  const c = e.clips.find((x) => x.id === id);
  if (!c) return e;
  const group = [...(linked ? withLinked(e, [id]) : new Set([id]))].map((x) => e.clips.find((y) => y.id === x)!).filter((x) => x.inSec === c.inSec && x.outSec === c.outSec && x.start === c.start);
  const ids = new Set(group.map((x) => x.id));
  let d = delta;
  for (const x of group) {
    const len = length(x.source);
    const r = room(e, x, ids);
    if (side === "left") {
      // Earlier: not before its source's start, nor into the clip before; later: keep a minimum.
      d = Math.max(d, -x.inSec, r.before - x.start);
      d = Math.min(d, clipLength(x) - MIN_CLIP);
    } else {
      d = Math.min(d, (len || x.outSec) - x.outSec, r.after - clipEnd(x));
      d = Math.max(d, MIN_CLIP - clipLength(x));
    }
  }
  const clips = e.clips.map((x) =>
    !ids.has(x.id) ? x : side === "left" ? { ...x, start: t6(x.start + d), inSec: t6(x.inSec + d) } : { ...x, outSec: t6(x.outSec + d) },
  );
  return touched(e, clips);
}

/** Slides what a clip shows inside it (its in and out move together), keeping where it is on the timeline. */
export function slipClip(e: Edit, id: Id, delta: number, length: SourceLength, linked = true): Edit {
  const ids = linked ? withLinked(e, [id]) : new Set([id]);
  let d = delta;
  for (const x of e.clips.filter((y) => ids.has(y.id))) {
    const len = length(x.source) || x.outSec;
    d = Math.max(d, -x.inSec);
    d = Math.min(d, len - x.outSec);
  }
  return touched(e, e.clips.map((x) => (ids.has(x.id) ? { ...x, inSec: t6(x.inSec + d), outSec: t6(x.outSec + d) } : x)));
}

/**
 * Cuts at `at` the clips given (with their linked ones), or every clip there
 * when none is given. The right parts of a linked pair stay linked to each
 * other.
 */
export function splitAt(e: Edit, at: number, newId: (p: string) => Id, ids?: Iterable<Id>, linked = true): Edit {
  const only = ids ? (linked ? withLinked(e, ids) : new Set(ids)) : null;
  const relink = new Map<Id, Id>();
  const out: EditClip[] = [];
  for (const c of e.clips) {
    const inside = at > c.start + MIN_CLIP / 2 && at < clipEnd(c) - MIN_CLIP / 2;
    if (!inside || (only && !only.has(c.id))) {
      out.push(c);
      continue;
    }
    const cut = t6(at - c.start);
    out.push({ ...c, outSec: t6(c.inSec + cut) });
    const right: EditClip = { ...stripLink(c), id: newId("cl"), start: t6(at), inSec: t6(c.inSec + cut) };
    if (c.linkId) {
      if (!relink.has(c.linkId)) relink.set(c.linkId, newId("ln"));
      right.linkId = relink.get(c.linkId)!;
    }
    out.push(right);
  }
  return touched(e, out);
}

/** Takes clips out (with their linked ones when `linked`), leaving the gap. */
export function removeClips(e: Edit, ids: Iterable<Id>, linked = true): Edit {
  const gone = linked ? withLinked(e, ids) : new Set(ids);
  return touched(e, e.clips.filter((c) => !gone.has(c.id)));
}

/** Their video and sound apart: each moves and trims on its own. */
export function unlinkClips(e: Edit, ids: Iterable<Id>): Edit {
  const all = withLinked(e, ids);
  return touched(e, e.clips.map((c) => (all.has(c.id) ? stripLink(c) : c)));
}

/** A video and a sound (or more) together again. */
export function linkClips(e: Edit, ids: Iterable<Id>, newId: (p: string) => Id): Edit {
  const set = new Set(ids);
  if (set.size < 2) return e;
  const linkId = newId("ln");
  return touched(e, e.clips.map((c) => (set.has(c.id) ? { ...c, linkId } : c)));
}

/** A new track of a kind, after the others of that kind. */
export function addTrack(e: Edit, kind: TrackKind, newId: (p: string) => Id): Edit {
  const last = e.tracks.map((t, i) => (t.kind === kind ? i : -1)).filter((i) => i >= 0).at(-1);
  const tracks = [...e.tracks];
  tracks.splice(last === undefined ? tracks.length : last + 1, 0, { id: newId(kind === "video" ? "tv" : "ta"), kind });
  return { ...e, tracks };
}

/** A track silenced, or heard again. */
export function setTrackMuted(e: Edit, trackId: Id, muted: boolean): Edit {
  return { ...e, tracks: e.tracks.map((t) => (t.id !== trackId ? t : muted ? { ...t, muted: true } : { id: t.id, kind: t.kind })) };
}

/** A track out, with what is on it; at least one of each kind stays. */
export function removeTrack(e: Edit, trackId: Id): Edit {
  const t = e.tracks.find((x) => x.id === trackId);
  if (!t || tracksOf(e, t.kind).length <= 1) return e;
  return { ...e, tracks: e.tracks.filter((x) => x.id !== trackId), clips: e.clips.filter((c) => c.trackId !== trackId) };
}

/**
 * Selected clips into a group: a montage of their own (`group`), and one
 * block in their place that plays it: on the top video track used (its
 * pictures) and, when sound was selected, on the first audio track used (its
 * sound), linked.
 */
export function groupClips(e: Edit, ids: Iterable<Id>, o: { groupId: Id; name: string; newId: (p: string) => Id; now: Millis; by: Id }): { edit: Edit; group: Edit } | null {
  const set = new Set(ids);
  const sel = e.clips.filter((c) => set.has(c.id));
  if (!sel.length) return null;
  const from = Math.min(...sel.map((c) => c.start));
  const to = Math.max(...sel.map(clipEnd));
  const used = new Set(sel.map((c) => c.trackId));
  const tracks = e.tracks.filter((t) => used.has(t.id));
  // The group keeps the tracks the clips were on (at least one of each kind).
  const groupTracks = [...tracks];
  for (const kind of ["video", "audio"] as const) if (!groupTracks.some((t) => t.kind === kind)) groupTracks.push({ id: o.newId(kind === "video" ? "tv" : "ta"), kind });
  const group: Edit = {
    id: o.groupId,
    productionId: e.productionId,
    nodeId: e.nodeId,
    group: { name: o.name },
    format: e.format,
    tracks: groupTracks.sort((a, b) => (a.kind === b.kind ? e.tracks.indexOf(a) - e.tracks.indexOf(b) : a.kind === "video" ? -1 : 1)),
    clips: sortClips(sel.map((c) => ({ ...c, start: t6(c.start - from) }))),
    updatedAt: o.now,
    updatedBy: o.by,
  };
  const videoTracks = tracks.filter((t) => t.kind === "video");
  const audioTracks = tracks.filter((t) => t.kind === "audio");
  const len = t6(to - from);
  const linkId = videoTracks.length && audioTracks.length ? o.newId("ln") : undefined;
  const blocks: EditClip[] = [];
  const src: ClipSource = { kind: "edit", editId: o.groupId };
  const top = videoTracks.at(-1);
  if (top) blocks.push({ id: o.newId("cl"), trackId: top.id, source: src, start: from, inSec: 0, outSec: len, ...(linkId ? { linkId } : {}) });
  const firstAudio = audioTracks[0];
  if (firstAudio) blocks.push({ id: o.newId("cl"), trackId: firstAudio.id, source: src, start: from, inSec: 0, outSec: len, ...(linkId ? { linkId } : {}) });
  const rest = e.clips.filter((c) => !set.has(c.id));
  return { edit: touched(e, overwrite(rest, blocks, o.newId)), group };
}

/**
 * A group's block back into its clips, as they show through it (only the
 * stretch the block uses, where it is). Its tracks are found by kind and
 * number; missing ones are added.
 */
export function ungroupClip(e: Edit, blockId: Id, group: Edit, newId: (p: string) => Id): Edit {
  const block = e.clips.find((c) => c.id === blockId);
  if (!block || block.source.kind !== "edit" || block.source.editId !== group.id) return e;
  const pair = withLinked(e, [blockId]);
  let edit: Edit = { ...e, clips: e.clips.filter((c) => !pair.has(c.id)) };
  const placed: EditClip[] = [];
  const map = new Map<Id, Id>();
  for (const kind of ["video", "audio"] as const) {
    const inner = tracksOf(group, kind);
    // Only the kinds the block was showing.
    if (![...pair].some((id) => e.tracks.find((t) => t.id === e.clips.find((c) => c.id === id)?.trackId)?.kind === kind)) continue;
    inner.forEach((t, i) => {
      while (tracksOf(edit, kind).length <= i) edit = addTrack(edit, kind, newId);
      map.set(t.id, tracksOf(edit, kind)[i]!.id);
    });
  }
  const links = new Map<Id, Id>();
  for (const c of group.clips) {
    const trackId = map.get(c.trackId);
    if (!trackId) continue;
    // Only what the block shows of it.
    const from = Math.max(c.start, block.inSec), to = Math.min(clipEnd(c), block.outSec);
    if (to - from < MIN_CLIP) continue;
    const linkId = c.linkId ? (links.get(c.linkId) ?? (links.set(c.linkId, newId("ln")), links.get(c.linkId)!)) : undefined;
    placed.push({ ...stripLink(c), id: newId("cl"), trackId, start: t6(block.start + from - block.inSec), inSec: t6(c.inSec + (from - c.start)), outSec: t6(c.inSec + (to - c.start)), ...(linkId ? { linkId } : {}) });
  }
  return touched(edit, overwrite(edit.clips, placed, newId));
}

/** Clip edges (and other points) a moving edge or clip sticks to. */
export function snapPoints(e: Pick<Edit, "clips">, except: Set<Id>, extra: number[] = []): number[] {
  const pts = new Set<number>([0, ...extra]);
  for (const c of e.clips) {
    if (except.has(c.id)) continue;
    pts.add(c.start);
    pts.add(clipEnd(c));
  }
  return [...pts].sort((a, b) => a - b);
}

/** The point nearest to `t` within `within` seconds, if any. */
export function nearest(points: number[], t: number, within: number): number | null {
  let best: number | null = null;
  for (const p of points) if (Math.abs(p - t) <= within && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
  return best;
}

// ---------- playing ----------

/** A stretch of a shot that plays at some time of the montage. */
export interface PlayPart {
  /** On the montage's timeline. */
  start: number;
  end: number;
  /** The shot it plays, and from where in its chosen take. */
  nodeId: Id;
  srcIn: number;
  /** Which picture is on top: compared item by item (outer track first). */
  layer: number[];
  /** The clip of the montage shown that brings it (the block, for nested ones). */
  clipId: Id;
}

/**
 * What plays and when: the pictures (video tracks) and the sound (audio
 * tracks), nested montages opened up. A block on a video track brings its
 * montage's pictures; on an audio track, its sound. A montage inside itself
 * (directly or not) plays nothing there.
 */
export function flattenEdit(e: Edit, editById: (id: Id) => Edit | undefined): { video: PlayPart[]; audio: PlayPart[] } {
  const out = { video: [] as PlayPart[], audio: [] as PlayPart[] };
  const walk = (edit: Edit, kind: TrackKind, offset: number, from: number, to: number, layer: number[], via: Id | null, seen: Set<Id>) => {
    const list = tracksOf(edit, kind);
    for (const c of edit.clips) {
      const ti = list.findIndex((t) => t.id === c.trackId);
      // A silenced track plays nothing (inside a block too).
      if (ti < 0 || (kind === "audio" && list[ti]!.muted)) continue;
      // The part of this clip inside the window seen through the outer block.
      const s = Math.max(c.start, from), en = Math.min(clipEnd(c), to);
      if (en - s < 1e-9) continue;
      const at = offset + (s - from);
      const shown = via ?? c.id;
      if (c.source.kind === "shot") {
        (kind === "video" ? out.video : out.audio).push({ start: t6(at), end: t6(at + (en - s)), nodeId: c.source.nodeId, srcIn: t6(c.inSec + (s - c.start)), layer: [...layer, ti], clipId: shown });
      } else {
        const inner = editById(c.source.editId);
        if (!inner || seen.has(inner.id)) continue;
        const innerFrom = c.inSec + (s - c.start);
        walk(inner, kind, at, innerFrom, innerFrom + (en - s), [...layer, ti], shown, new Set([...seen, inner.id]));
      }
    }
  };
  walk(e, "video", 0, 0, Infinity, [], null, new Set([e.id]));
  walk(e, "audio", 0, 0, Infinity, [], null, new Set([e.id]));
  const byStart = (a: PlayPart, b: PlayPart) => a.start - b.start;
  return { video: out.video.sort(byStart), audio: out.audio.sort(byStart) };
}

/** The picture on top at `t` (the highest video track wins). */
export function pictureAt(parts: PlayPart[], t: number): PlayPart | null {
  let best: PlayPart | null = null;
  for (const p of parts) {
    if (t < p.start - 1e-9 || t >= p.end - 1e-9) continue;
    if (!best || higher(p.layer, best.layer)) best = p;
  }
  return best;
}

function higher(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1, y = b[i] ?? -1;
    if (x !== y) return x > y;
  }
  return false;
}

/** Whether a montage can go inside another without ending up inside itself. */
export function canNest(outerId: Id, innerId: Id, editById: (id: Id) => Edit | undefined): boolean {
  if (outerId === innerId) return false;
  const stack = [innerId];
  const seen = new Set<Id>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === outerId) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    const e = editById(id);
    for (const c of e?.clips ?? []) if (c.source.kind === "edit") stack.push(c.source.editId);
  }
  return true;
}

// ---------- «Montar» ----------

/** A level's children in the order the board shows them (shots of a group together, where the group is). */
export function rowOrder(nodes: ProdNode[], groups: ShotGroup[], parentId: Id | null): ProdNode[] {
  const kids = childrenOf(nodes, parentId);
  const rowGroups = groups.filter((g) => g.parentId === parentId && kids.some((k) => k.groupId === g.id));
  const inGroup = (n: ProdNode) => !!n.groupId && rowGroups.some((g) => g.id === n.groupId);
  const items: Array<{ at: number; shots: ProdNode[] }> = [
    ...kids.filter((k) => !inGroup(k)).map((k) => ({ at: sortValue(k), shots: [k] })),
    ...rowGroups.map((g) => ({ at: g.order, shots: kids.filter((k) => k.groupId === g.id) })),
  ].sort((a, b) => a.at - b.at);
  return items.flatMap((i) => i.shots);
}

/** The montage of a level (or of the whole production, `nodeId` null), if it has one. */
export const editOf = (edits: Edit[], nodeId: Id | null) => edits.find((e) => !e.group && e.nodeId === nodeId);

/**
 * «Montar»: a level's montage with what is inside it, in the board's order,
 * one after another from where the montage ends: a scene's shots (picture and
 * sound, linked), or a sequence's (or the production's) levels as blocks,
 * each playing its own montage, made the same way if it has none yet.
 * Returns every montage to save (the level's first).
 */
export function assembleLevel(o: {
  production: Production;
  nodes: ProdNode[];
  groups: ShotGroup[];
  edits: Edit[];
  nodeId: Id | null;
  /** Length of a shot's chosen take (0: nothing to play). */
  shotLength: (nodeId: Id) => number;
  newId: (p: string) => Id;
  now: Millis;
  by: Id;
  format?: EditFormat;
}): Edit[] {
  const saved = new Map<Id, Edit>();
  const all = () => [...o.edits.filter((e) => !saved.has(e.id)), ...saved.values()];
  const make = (nodeId: Id | null): Edit => {
    const have = editOf(all(), nodeId);
    const base = have ?? newEdit({ id: o.newId("ed"), productionId: o.production.id, nodeId, format: o.format, newId: o.newId, now: o.now, by: o.by });
    const kids = rowOrder(o.nodes, o.groups, nodeId);
    const sources: Array<{ source: ClipSource; length: number }> = [];
    for (const k of kids) {
      if (isUnit(o.production, k)) sources.push({ source: { kind: "shot", nodeId: k.id }, length: o.shotLength(k.id) });
      else {
        // Its own montage; made now if it has none.
        const inner = editOf(all(), k.id) ?? make(k.id);
        sources.push({ source: { kind: "edit", editId: inner.id }, length: editDuration(inner) });
      }
    }
    const v1 = tracksOf(base, "video")[0]!, a1 = tracksOf(base, "audio")[0]!;
    const { edit } = placeSources(base, sources, { trackId: v1.id, start: editDuration(base) }, o.newId, a1.id);
    const done = { ...edit, updatedAt: o.now, updatedBy: o.by };
    saved.set(done.id, done);
    return done;
  };
  const top = make(o.nodeId);
  return [top, ...[...saved.values()].filter((e) => e.id !== top.id)];
}
