import { describe, expect, it } from "vitest";
import {
  assembleLevel,
  canNest,
  clipEnd,
  editDuration,
  flattenEdit,
  groupClips,
  moveClips,
  newEdit,
  pictureAt,
  placeSources,
  removeClips,
  rowOrder,
  slipClip,
  splitAt,
  timecode,
  toFrame,
  trackName,
  trimClip,
  ungroupClip,
  unlinkClips,
  type Edit,
  type SourceLength,
} from "./edit";
import { foldLog, type LogEvent, type LogEventBody } from "./log";
import { invertEvents } from "./undo";
import { defaultLevels, defaultStatuses } from "./defaults";
import type { ProdNode, Production } from "./types";

let n = 0;
const newId = (p: string) => `${p}${++n}`;
const base = (): Edit => newEdit({ id: "e1", productionId: "p", nodeId: "sc1", newId, now: 0, by: "u" });
const shot = (id: string) => ({ kind: "shot" as const, nodeId: id });
const LEN: Record<string, number> = { a: 4, b: 6, c: 2.5 };
const length: SourceLength = (s) => (s.kind === "shot" ? LEN[s.nodeId] ?? 0 : 0);
const v = (e: Edit, i = 0) => e.tracks.filter((t) => t.kind === "video")[i]!.id;
const a = (e: Edit, i = 0) => e.tracks.filter((t) => t.kind === "audio")[i]!.id;
const on = (e: Edit, trackId: string) => e.clips.filter((c) => c.trackId === trackId).map((c) => [c.source.kind === "shot" ? c.source.nodeId : "block", c.start, c.inSec, c.outSec]);

describe("montage", () => {
  it("drops shots one after another, each with its sound linked below", () => {
    const e0 = base();
    const { edit } = placeSources(e0, [{ source: shot("a"), length: 4 }, { source: shot("b"), length: 6 }], { trackId: v(e0), start: 1 }, newId, a(e0));
    expect(on(edit, v(edit))).toEqual([["a", 1, 0, 4], ["b", 5, 0, 6]]);
    expect(on(edit, a(edit))).toEqual([["a", 1, 0, 4], ["b", 5, 0, 6]]);
    const [va, aa] = [edit.clips.find((c) => c.trackId === v(edit))!, edit.clips.find((c) => c.trackId === a(edit))!];
    expect(va.linkId).toBeDefined();
    expect(va.linkId).toBe(aa.linkId);
    expect(editDuration(edit)).toBe(11);
    expect(trackName(edit, v(edit, 1))).toBe("V2");
    expect(trackName(edit, a(edit))).toBe("A1");
  });

  it("overwrites what it lands on, as in Premiere: trims, splits and takes out", () => {
    const e0 = base();
    let { edit } = placeSources(e0, [{ source: shot("b"), length: 6 }], { trackId: v(e0), start: 0 }, newId, null);
    // c (2.5 s) in the middle of b: b splits around it.
    edit = placeSources(edit, [{ source: shot("c"), length: 2.5 }], { trackId: v(edit), start: 2 }, newId, null).edit;
    expect(on(edit, v(edit))).toEqual([["b", 0, 0, 2], ["c", 2, 0, 2.5], ["b", 4.5, 4.5, 6]]);
    // a over the first 4 s: b's first part goes, c keeps its last half second.
    edit = placeSources(edit, [{ source: shot("a"), length: 4 }], { trackId: v(edit), start: 0 }, newId, null).edit;
    expect(on(edit, v(edit))).toEqual([["a", 0, 0, 4], ["c", 4, 2, 2.5], ["b", 4.5, 4.5, 6]]);
  });

  it("moving a linked clip moves its sound; it never goes before 0 and can change track", () => {
    const e0 = base();
    let { edit, placed } = placeSources(e0, [{ source: shot("a"), length: 4 }], { trackId: v(e0), start: 2 }, newId, a(e0));
    edit = moveClips(edit, [placed[0]!, placed[1]!], -5, { video: 1, audio: 0 }, newId);
    expect(on(edit, v(edit, 1))).toEqual([["a", 0, 0, 4]]);
    expect(on(edit, a(edit))).toEqual([["a", 0, 0, 4]]);
  });

  it("trims by either edge within its source and its neighbours, linked ones together", () => {
    const e0 = base();
    let { edit, placed } = placeSources(e0, [{ source: shot("a"), length: 4 }, { source: shot("b"), length: 6 }], { trackId: v(e0), start: 0 }, newId, a(e0));
    const first = placed[0]!;
    // Left edge to the right: starts later in its source and on the timeline.
    edit = trimClip(edit, first, "left", 1.2345, length);
    expect(on(edit, v(edit))[0]).toEqual(["a", 1.2345, 1.2345, 4]);
    expect(on(edit, a(edit))[0]).toEqual(["a", 1.2345, 1.2345, 4]);
    // Right edge out: not past its source (4 s), nor into b.
    edit = trimClip(edit, first, "right", 3, length);
    expect(on(edit, v(edit))[0]).toEqual(["a", 1.2345, 1.2345, 4]);
    // Left edge back past its start: no further than its source's start.
    edit = trimClip(edit, first, "left", -9, length);
    expect(on(edit, v(edit))[0]).toEqual(["a", 0, 0, 4]);
    // Right edge in: shorter, leaving a gap before b.
    edit = trimClip(edit, first, "right", -1.5, length);
    expect(clipEnd(edit.clips.find((c) => c.id === first)!)).toBe(2.5);
  });

  it("slips what a clip shows, within its source", () => {
    const e0 = base();
    let { edit, placed } = placeSources(e0, [{ source: shot("b"), length: 6 }], { trackId: v(e0), start: 0 }, newId, null);
    edit = trimClip(edit, placed[0]!, "right", -3, length);
    edit = slipClip(edit, placed[0]!, 10, length);
    expect(on(edit, v(edit))).toEqual([["b", 0, 3, 6]]);
  });

  it("cuts at any time (not only the timeline's frames); the right parts stay linked", () => {
    const e0 = base();
    let { edit } = placeSources(e0, [{ source: shot("a"), length: 4 }], { trackId: v(e0), start: 0 }, newId, a(e0));
    edit = splitAt(edit, 1.0417, newId);
    expect(on(edit, v(edit))).toEqual([["a", 0, 0, 1.0417], ["a", 1.0417, 1.0417, 4]]);
    const rights = edit.clips.filter((c) => c.start === 1.0417);
    expect(rights).toHaveLength(2);
    expect(rights[0]!.linkId).toBe(rights[1]!.linkId);
    expect(rights[0]!.linkId).not.toBe(edit.clips.find((c) => c.start === 0)!.linkId);
  });

  it("unlinked, the sound moves and goes on its own", () => {
    const e0 = base();
    let { edit, placed } = placeSources(e0, [{ source: shot("a"), length: 4 }], { trackId: v(e0), start: 0 }, newId, a(e0));
    edit = unlinkClips(edit, [placed[0]!]);
    edit = removeClips(edit, [placed[1]!]);
    expect(on(edit, a(edit))).toEqual([]);
    expect(on(edit, v(edit))).toEqual([["a", 0, 0, 4]]);
  });

  it("frames and timecode", () => {
    expect(toFrame(1.03, 25)).toBe(1.04);
    expect(timecode(61.48, 25)).toBe("00:01:01:12");
  });
});

describe("nesting and groups", () => {
  it("a group becomes one block that plays the same; ungrouped, its clips come back", () => {
    const e0 = base();
    let { edit, placed } = placeSources(e0, [{ source: shot("a"), length: 4 }, { source: shot("b"), length: 6 }], { trackId: v(e0), start: 2 }, newId, a(e0));
    const g = groupClips(edit, placed, { groupId: "g1", name: "Grupo 1", newId, now: 0, by: "u" })!;
    expect(g.group.group).toEqual({ name: "Grupo 1" });
    expect(on(g.edit, v(g.edit))).toEqual([["block", 2, 0, 10]]);
    expect(on(g.edit, a(g.edit))).toEqual([["block", 2, 0, 10]]);
    const byId = (id: string) => (id === "g1" ? g.group : undefined);
    const before = flattenEdit(edit, byId);
    const after = flattenEdit(g.edit, byId);
    const strip = (parts: typeof before.video) => parts.map((p) => [p.nodeId, p.start, p.end, p.srcIn]);
    expect(strip(after.video)).toEqual(strip(before.video));
    expect(strip(after.audio)).toEqual(strip(before.audio));
    // Trim the block, then take it apart: only what it showed comes back.
    const trimmed = trimClip(g.edit, g.edit.clips[0]!.id, "left", 1, () => 10);
    const back = ungroupClip(trimmed, trimmed.clips[0]!.id, g.group, newId);
    expect(on(back, v(back))).toEqual([["a", 3, 1, 4], ["b", 6, 0, 6]]);
  });

  it("the picture on top wins; a montage can't go inside itself", () => {
    const e0 = base();
    let { edit } = placeSources(e0, [{ source: shot("b"), length: 6 }], { trackId: v(e0), start: 0 }, newId, null);
    edit = placeSources(edit, [{ source: shot("c"), length: 2.5 }], { trackId: v(edit, 1), start: 1 }, newId, null).edit;
    const { video } = flattenEdit(edit, () => undefined);
    expect(pictureAt(video, 0.5)?.nodeId).toBe("b");
    expect(pictureAt(video, 2)?.nodeId).toBe("c");
    expect(pictureAt(video, 4)?.nodeId).toBe("b");
    const outer: Edit = { ...base(), id: "o", clips: [{ id: "x", trackId: "t", source: { kind: "edit", editId: "e1" }, start: 0, inSec: 0, outSec: 1 }] };
    const all = new Map([["o", outer], ["e1", edit]]);
    expect(canNest("e1", "o", (id) => all.get(id))).toBe(false);
    expect(canNest("o", "e1", (id) => all.get(id))).toBe(true);
  });
});

describe("«Montar» a level", () => {
  const levels = defaultLevels(newId);
  const p: Production = { id: "p", workspaceId: "w", name: "P", levels, statuses: defaultStatuses(newId), createdAt: 0, updatedAt: 0 };
  const node = (id: string, parentId: string | null, level: number, number: number, extra: Partial<ProdNode> = {}): ProdNode => ({
    id, productionId: "p", parentId, levelId: levels[level]!.id, number, title: id, statusId: "s", notes: "", assigneeIds: [], assetIds: [], updatedAt: 0, updatedBy: "u", ...extra,
  });
  const nodes = [
    node("sq1", null, 0, 10),
    node("sc1", "sq1", 1, 10),
    node("sc2", "sq1", 1, 20),
    node("b", "sc1", 2, 20),
    node("a", "sc1", 2, 10),
    node("c", "sc2", 2, 10),
  ];

  it("a scene: its shots in the board's order; a sequence: its scenes as blocks", () => {
    expect(rowOrder(nodes, [], "sc1").map((x) => x.id)).toEqual(["a", "b"]);
    const out = assembleLevel({ production: p, nodes, groups: [], edits: [], nodeId: "sq1", shotLength: (id) => LEN[id] ?? 0, newId, now: 0, by: "u" });
    const [sq, ...inner] = out;
    expect(sq!.nodeId).toBe("sq1");
    expect(inner.map((x) => x.nodeId).sort()).toEqual(["sc1", "sc2"]);
    expect(on(sq!, v(sq!))).toEqual([["block", 0, 0, 10], ["block", 10, 0, 2.5]]);
    const byId = (id: string) => out.find((x) => x.id === id);
    expect(flattenEdit(sq!, byId).video.map((x) => [x.nodeId, x.start, x.end])).toEqual([["a", 0, 4], ["b", 4, 10], ["c", 10, 12.5]]);
  });
});

describe("montages in the log", () => {
  it("saved whole (the last one wins), undone back to how it was", () => {
    const prod: LogEventBody = { type: "production.created", production: { id: "p", workspaceId: "w", name: "P", levels: defaultLevels(newId), statuses: defaultStatuses(newId) } };
    let k = 0;
    const stamp = () => `0000000000${String(++k).padStart(4, "0")}-0000-dev`;
    const ev = (b: LogEventBody): LogEvent => ({ ...b, v: 1, at: stamp(), userId: "u" } as LogEvent);
    const e1 = { ...newEdit({ id: "ed1", productionId: "p", nodeId: null, newId, now: 0, by: "u" }) };
    const { productionId: _p, ...rec } = e1;
    const events = [ev(prod), ev({ type: "edit.saved", edit: rec })];
    const s1 = foldLog(events);
    expect(s1.edits).toHaveLength(1);
    const changed = placeSources(e1, [{ source: shot("a"), length: 4 }], { trackId: v(e1), start: 0 }, newId, null).edit;
    const { productionId: _q, ...rec2 } = changed;
    const save2: LogEventBody = { type: "edit.saved", edit: rec2 };
    const undo = invertEvents(s1, [save2]);
    const s2 = foldLog([...events, ev(save2)]);
    expect(s2.edits[0]!.clips).toHaveLength(1);
    const s3 = foldLog([...events, ev(save2), ...undo.map(ev)]);
    expect(s3.edits[0]!.clips).toHaveLength(0);
    // A new montage undone goes away.
    expect(invertEvents(foldLog([ev(prod)]), [{ type: "edit.saved", edit: rec }])).toEqual([{ type: "edit.deleted", id: "ed1" }]);
  });
});
