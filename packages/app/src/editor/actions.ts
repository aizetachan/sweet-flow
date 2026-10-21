/**
 * What the editor does (docs/INTERFAZ.md §4), from its keys, its toolbar,
 * the clip's right-click menu and the panel: each a step that ⌘Z undoes.
 */

import { create } from "zustand";
import {
  addTrack,
  assembleLevel,
  clipEnd,
  editDuration,
  groupClips,
  linkClips,
  removeClips,
  removeTrack,
  splitAt,
  trimClip,
  ungroupClip,
  unlinkClips,
  withLinked,
  type Edit,
  type EditFormat,
  type Id,
  type TrackKind,
} from "@sweetflow/domain";
import { useStore } from "../state/store";
import { editLookup, newId, saveEdits, shotPlay, sourceLength } from "./model";
import { onTimelineFrame } from "./frames";

// ---------- preferences of this computer ----------

export type Tool = "select" | "razor";

interface Prefs {
  tool: Tool;
  /** Edges stick to edges and to the playhead. */
  snap: boolean;
  /** A video and its sound are selected, moved and trimmed together. */
  linked: boolean;
  /** «Visualización real»: the viewer shows the frame under the pointer over a clip, without cutting. */
  preview: boolean;
  /** The panel's shots: as a tree, or a gallery. */
  bin: "tree" | "gallery";
  thumb: "s" | "m" | "l";
  /** Pixels per second of the timeline. */
  zoom: number;
  set: (p: Partial<Omit<Prefs, "set">>) => void;
}

const PREFS_KEY = "sweetflow:editor";
const DEFAULTS = { tool: "select" as Tool, snap: true, linked: true, preview: false, bin: "gallery" as const, thumb: "m" as const, zoom: 60 };

function readPrefs(): Omit<Prefs, "set"> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  ...readPrefs(),
  set: (p) => {
    set(p);
    try {
      const { set: _s, ...rest } = get();
      localStorage.setItem(PREFS_KEY, JSON.stringify(rest));
    } catch {
      // Only a convenience.
    }
  },
}));

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 8000;

// ---------- steps ----------

const st = () => useStore.getState();
const lengthFn = () => {
  const snap = st().snap!;
  return (src: Parameters<typeof sourceLength>[1]) => sourceLength(snap, src);
};

/** The selection, with the clips linked to it when the linked selection is on. */
export function selected(e: Edit): Set<Id> {
  const sel = st().editSel.filter((id) => e.clips.some((c) => c.id === id));
  return usePrefs.getState().linked ? withLinked(e, sel) : new Set(sel);
}

/** ⌘K: cuts at the playhead the selected clips, or every clip there. */
export function cutAtPlayhead(e: Edit): void {
  const t = st().editTime;
  const sel = selected(e);
  const next = splitAt(e, t, newId, sel.size ? sel : undefined, usePrefs.getState().linked);
  if (next.clips.length !== e.clips.length) saveEdits([next]);
}

/** Delete: the selected clips out, leaving their gap. */
export function deleteSelection(e: Edit): void {
  const sel = selected(e);
  if (!sel.size) return;
  saveEdits([removeClips(e, sel, false)]);
  st().set({ editSel: [] });
}

/** ⌘G: the selection into a group (one block). */
export function groupSelection(e: Edit): void {
  const sel = selected(e);
  if (!sel.size) return;
  const n = st().snap!.edits.filter((x) => x.group).length + 1;
  const r = groupClips(e, sel, { groupId: newId("ed"), name: `Grupo ${n}`, newId, now: Date.now(), by: st().snap!.me.uid });
  if (!r) return;
  saveEdits([r.group, r.edit]);
  const block = r.edit.clips.find((c) => c.source.kind === "edit" && c.source.editId === r.group.id);
  st().set({ editSel: block ? [block.id] : [] });
  st().notify(`Agrupado como «${r.group.group!.name}». Doble clic en el bloque para editarlo por dentro.`);
}

/** ⌘⇧G: a group's block back into its clips. */
export function ungroupSelection(e: Edit): void {
  const lookup = editLookup(st().snap!);
  let next = e;
  for (const id of st().editSel) {
    const c = next.clips.find((x) => x.id === id);
    const g = c?.source.kind === "edit" ? lookup(c.source.editId) : undefined;
    if (c && g?.group) next = ungroupClip(next, c.id, g, newId);
  }
  if (next !== e) {
    saveEdits([next]);
    st().set({ editSel: [] });
  }
}

/** ⌘L: the selected video and sound apart, or together. */
export function toggleLink(e: Edit): void {
  const ids = st().editSel.filter((id) => e.clips.some((c) => c.id === id));
  if (!ids.length) return;
  const linked = e.clips.some((c) => ids.includes(c.id) && c.linkId);
  saveEdits([linked ? unlinkClips(e, ids) : linkClips(e, ids, newId)]);
  st().notify(linked ? "Vídeo y sonido desenlazados: cada uno se mueve por su cuenta." : "Enlazados: se mueven y se recortan juntos.");
}

/** I / O: the selected clip's start or end to the playhead. */
export function trimToPlayhead(e: Edit, side: "left" | "right"): void {
  const t = st().editTime;
  const id = st().editSel.find((x) => e.clips.some((c) => c.id === x));
  const c = e.clips.find((x) => x.id === id);
  if (!c || t <= c.start || t >= clipEnd(c)) return;
  const delta = side === "left" ? t - c.start : t - clipEnd(c);
  saveEdits([trimClip(e, c.id, side, delta, lengthFn(), usePrefs.getState().linked)]);
}

export function newTrack(e: Edit, kind: TrackKind): void {
  saveEdits([addTrack(e, kind, newId)]);
}

export function dropTrack(e: Edit, trackId: Id): void {
  const next = removeTrack(e, trackId);
  if (next !== e) saveEdits([next]);
}

/** «Montar»: the level's shots (or its levels, as blocks) in order, from where the montage ends. */
export function assemble(e: Edit): void {
  const snap = st().snap!;
  if (e.group) return;
  const made = assembleLevel({ production: snap.production, nodes: snap.nodes, groups: snap.groups, edits: [...snap.edits.filter((x) => x.id !== e.id), e], nodeId: e.nodeId, shotLength: (id) => shotPlay(snap, id)?.length ?? 0, newId, now: Date.now(), by: snap.me.uid, format: e.format });
  const top = made[0]!;
  if (editDuration(top) === editDuration(e)) return st().notify("No hay planos con vídeo que montar aquí.");
  saveEdits(made);
}

export function setFormat(e: Edit, format: EditFormat): void {
  saveEdits([{ ...e, format }]);
}

/** Steps the playhead `frames` frames at `fps`, landing where `snapTo` puts it (a frame of the clip under it, or of the timeline). */
export function stepTime(e: Edit, dir: -1 | 1, big: boolean, fps: number, snapTo: (t: number) => number): void {
  const frames = big ? 10 : 1;
  // A hair past the frame's start, so landing on it is not rounded back.
  const t = st().editTime + (dir * frames) / fps + 1e-4;
  st().set({ editTime: Math.max(0, Math.min(editDuration(e), snapTo(t))) });
}

export const snapTime = (e: Edit, t: number) => onTimelineFrame(e, t);
