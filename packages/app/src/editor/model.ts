/**
 * The editor and the production (docs/INTERFAZ.md §4): what each clip plays
 * (a shot's chosen take, followed as the team chooses another), how long its
 * source is, the montage shown, and saving it.
 */

import { useMemo } from "react";
import {
  assembleLevel,
  canNest,
  codeOf,
  DEFAULT_EDIT_FORMAT,
  editDuration,
  editOf,
  isUnit,
  newEdit,
  type ClipSource,
  type Edit,
  type EditClip,
  type Id,
  type Media,
  type ProdNode,
  type Take,
} from "@sweetflow/domain";
import type { Snapshot } from "../data/source";
import { coverOf } from "../state/selectors";
import { useStore, type EditorRef } from "../state/store";
import { probedDuration } from "../components/media";

export const newId = (p: string) => `${p}_${crypto.randomUUID().slice(0, 12)}`;

/** What a shot plays: its chosen take (or its own video), from where in the file, and for how long. */
export interface ShotPlay {
  node: ProdNode;
  media?: Media;
  take?: Take;
  /** Where its stretch starts in the file. */
  fileIn: number;
  /** 0: nothing to play (no video yet). */
  length: number;
  poster?: string;
}

export function shotPlay(s: Snapshot, nodeId: Id): ShotPlay | null {
  const node = s.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const { media, take } = coverOf(s, node);
  if (take && media) return { node, media, take, fileIn: take.inSec, length: Math.max(0, take.outSec - take.inSec), poster: take.thumbUrl ?? media.thumbUrl ?? media.url };
  if (media?.kind === "video") return { node, media, fileIn: 0, length: media.durationSec ?? probedDuration(media), poster: media.thumbUrl ?? media.url };
  return { node, ...(media ? { media } : {}), fileIn: 0, length: 0, poster: media?.thumbUrl ?? media?.url };
}

/** Montages by id: saved ones and the ones only shown so far (not saved until something is placed). */
export function editLookup(s: Snapshot): (id: Id) => Edit | undefined {
  const byId = new Map(s.edits.map((e) => [e.id, e]));
  return (id) => byId.get(id) ?? drafts.get(id);
}

/** How long a clip's source is (0: nothing to play). */
export function sourceLength(s: Snapshot, src: ClipSource): number {
  if (src.kind === "shot") return shotPlay(s, src.nodeId)?.length ?? 0;
  const e = editLookup(s)(src.editId);
  return e ? editDuration(e) : 0;
}

/** Montages of levels shown before anything is placed in them: kept here until saved. */
const drafts = new Map<Id, Edit>();
const draftOf = new Map<string, Id>();

/** The montage of a level (or the production): its saved one, or a new empty one. */
export function levelEdit(s: Snapshot, nodeId: Id | null): Edit {
  const saved = editOf(s.edits, nodeId);
  if (saved) return saved;
  const key = `${s.production.id}:${nodeId ?? "*"}`;
  const id = draftOf.get(key);
  const have = id ? drafts.get(id) : undefined;
  if (have) return have;
  const e = newEdit({ id: newId("ed"), productionId: s.production.id, nodeId, format: s.production.editFormat ?? DEFAULT_EDIT_FORMAT, newId, now: Date.now(), by: s.me.uid });
  drafts.set(e.id, e);
  draftOf.set(key, e.id);
  return e;
}

/** The montage a reference points at. */
export function editAt(s: Snapshot, ref: EditorRef): Edit | undefined {
  return "editId" in ref ? editLookup(s)(ref.editId) : levelEdit(s, ref.nodeId);
}

/** The montage shown now, and the way to it. */
export function useCurrentEdit(): { edit: Edit | null; path: EditorRef[] } {
  const snap = useStore((s) => s.snap);
  const path = useStore((s) => s.editorPath);
  const edit = useMemo(() => {
    if (!snap) return null;
    // A block's montage gone (undone, deleted): back to the outer one.
    for (let i = path.length - 1; i >= 0; i--) {
      const e = editAt(snap, path[i]!);
      if (e) return e;
    }
    return levelEdit(snap, null);
  }, [snap, path]);
  return { edit, path };
}

/** Saves montages (one step to undo); the drafts saved stop being drafts. */
export function saveEdits(edits: Edit[]): void {
  if (!edits.length) return;
  useStore.getState().source.saveEdits(edits);
  for (const e of edits) drafts.delete(e.id);
}

/** A name for a montage or a block: a level's code and title, a group's name, or «Producción». */
export function editName(s: Snapshot, e: Edit): string {
  if (e.group) return e.group.name;
  if (!e.nodeId) return "Producción";
  const n = s.nodes.find((x) => x.id === e.nodeId) ?? s.trash.find((x) => x.id === e.nodeId);
  return n ? `${codeOf(s.production, n)}${n.title ? ` · ${n.title}` : ""}` : "Nivel eliminado";
}

/** What a clip is called on the timeline. */
export function clipLabel(s: Snapshot, c: EditClip): { code: string; title: string; missing: boolean } {
  if (c.source.kind === "edit") {
    const e = editLookup(s)(c.source.editId);
    if (!e) return { code: "", title: "Bloque eliminado", missing: true };
    if (e.group) return { code: "Grupo", title: e.group.name, missing: false };
    const n = e.nodeId ? s.nodes.find((x) => x.id === e.nodeId) : undefined;
    return n ? { code: codeOf(s.production, n), title: n.title, missing: false } : { code: "", title: editName(s, e), missing: false };
  }
  const n = s.nodes.find((x) => x.id === (c.source as { nodeId: Id }).nodeId);
  return n ? { code: codeOf(s.production, n), title: n.title, missing: false } : { code: "", title: "Plano eliminado", missing: true };
}

/**
 * What dragged items become on a montage: shots play themselves; a level is a
 * block with its montage (made with «Montar» now if it has none). Levels that
 * would end up inside themselves are left out.
 */
export function sourcesFor(s: Snapshot, into: Edit, nodeIds: Id[]): { sources: Array<{ source: ClipSource; length: number }>; save: Edit[]; skipped: number } {
  const lookup = editLookup(s);
  const sources: Array<{ source: ClipSource; length: number }> = [];
  const save: Edit[] = [];
  let skipped = 0;
  for (const id of nodeIds) {
    const n = s.nodes.find((x) => x.id === id);
    if (!n) continue;
    if (isUnit(s.production, n)) {
      const length = shotPlay(s, id)?.length ?? 0;
      if (length > 0) sources.push({ source: { kind: "shot", nodeId: id }, length });
      else skipped++;
      continue;
    }
    let inner = editOf(s.edits, id) ?? save.find((e) => e.nodeId === id && !e.group);
    if (!inner) {
      const made = assembleLevel({ production: s.production, nodes: s.nodes, groups: s.groups, edits: s.edits, nodeId: id, shotLength: (x) => shotPlay(s, x)?.length ?? 0, newId, now: Date.now(), by: s.me.uid, format: into.format });
      save.push(...made);
      inner = made[0]!;
    }
    const all = (x: Id) => save.find((e) => e.id === x) ?? lookup(x);
    if (!canNest(into.id, inner.id, all) || editDuration(inner) <= 0) {
      skipped++;
      continue;
    }
    sources.push({ source: { kind: "edit", editId: inner.id }, length: editDuration(inner) });
  }
  return { sources, save, skipped };
}

/** Shots used in a montage (directly), to mark them in the panel. */
export function shotsIn(e: Edit | null): Set<Id> {
  return new Set((e?.clips ?? []).flatMap((c) => (c.source.kind === "shot" ? [c.source.nodeId] : [])));
}
