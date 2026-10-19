import { describe, expect, it } from "vitest";
import {
  planCreateLibNode,
  planMoveToLib,
  planPlaceLibMedia,
  nextGroupName,
  childrenOf,
  defaultLevels,
  defaultStatuses,
  foldLog,
  formatStamp,
  hlcTick,
  LOG_VERSION,
  planCreateNode,
  planDeleteNode,
  planInsertAfter,
  planMoveNode,
  planMoveNodes,
  planRestoreNode,
  planSetNumber,
  planTrashNode,
  planSplitShot,
  planGroupShots,
  planUngroupShots,
  planDissolveGroup,
  planRenameGroup,
  planPlaceInRow,
  planCreateInRow,
  planShotsFromEdited,
  planExtractVersion,
  planSplitTakeShot,
  planMoveNodes as moveNodes,
  planUnshelveNode,
  folderPath,
  splitTrash,
  planUpdateNode,
  nextMediaVersion,
  ZERO_HLC,
  type Hlc,
  type LogEvent,
  type LogEventBody,
  type Plan,
} from "./index";

let ids = 0;
const id = (p: string) => `${p}${ids++}`;

/** Applies plans through the real log, like LocalSource does. */
function session() {
  const levels = defaultLevels(id);
  const statuses = defaultStatuses(id);
  const log: LogEvent[] = [];
  let clock: Hlc = ZERO_HLC;
  const append = (bodies: LogEventBody[]) => {
    for (const b of bodies) {
      clock = hlcTick(clock, 1_000);
      log.push({ ...b, v: LOG_VERSION, at: formatStamp(clock, "dev"), userId: "u" } as LogEvent);
    }
  };
  append([{ type: "production.created", production: { id: "p", workspaceId: "w", name: "T", levels, statuses } }]);
  const state = () => foldLog(log);
  const run = (plan: (s: ReturnType<typeof state>) => Plan) => {
    const s = state();
    const p = plan(s);
    append(p.events);
    return p;
  };
  const titles = (parentId: string | null) => childrenOf(state().nodes, parentId).map((n) => `${n.number}:${n.title}`);
  return { run, state, titles, statuses, levels };
}

describe("structure intents", () => {
  it("creates children one level down with the next free number", () => {
    const { run, state, titles, statuses, levels } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "sq", "Apertura")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, null, "sq2", "Final"));
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "sc")).nodeId!;
    expect(titles(null)).toEqual(["10:Apertura", "20:Final"]);
    const scNode = state().nodes.find((n) => n.id === sc)!;
    expect(scNode).toMatchObject({ levelId: levels[1]!.id, number: 10, statusId: statuses[0]!.id });
  });

  it("refuses children under the last level", () => {
    const { run } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "a")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "b")).nodeId!;
    const sh = run((s) => planCreateNode(s.production!, s.nodes, sc, "c")).nodeId!;
    expect(() => run((s) => planCreateNode(s.production!, s.nodes, sh, "d"))).toThrow();
  });

  it("inserts right after a node without changing any existing code", () => {
    const { run, titles } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "a", "A"));
    run((s) => planCreateNode(s.production!, s.nodes, null, "b", "B"));
    run((s) => planInsertAfter(s.production!, s.nodes, "a", "x"));
    expect(titles(null)).toEqual(["10:A", "15:Secuencia 1,5", "20:B"]);
    for (const nid of ["y", "z", "w"]) run((s) => planInsertAfter(s.production!, s.nodes, "a", nid));
    // Each lands right after A; codes take the gap (12, 11) and, when it is
    // full, the next free number at the end (30). A and B keep 10 and 20.
    expect(titles(null).map((t) => t.split(":")[0])).toEqual(["10", "30", "11", "12", "15", "20"]);
  });

  it("swaps with a neighbour without touching codes, and ignores moves past the ends", () => {
    const { run, titles } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "a", "A"));
    run((s) => planCreateNode(s.production!, s.nodes, null, "b", "B"));
    run((s) => planMoveNode(s.production!, s.nodes, "b", -1));
    expect(titles(null)).toEqual(["20:B", "10:A"]);
    expect(run((s) => planMoveNode(s.production!, s.nodes, "b", -1)).events).toEqual([]);
    run((s) => planCreateNode(s.production!, s.nodes, null, "c", "C"));
    expect(titles(null)).toEqual(["20:B", "10:A", "30:C"]);
  });

  it("drags several nodes to a position, keeping their codes", () => {
    const { run, titles } = session();
    for (const [nid, t] of [["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]] as const) run((s) => planCreateNode(s.production!, s.nodes, null, nid, t));
    run((s) => planMoveNodes(s.production!, s.nodes, ["d", "c"], null, "a"));
    expect(titles(null)).toEqual(["40:D", "30:C", "10:A", "20:B"]);
    run((s) => planMoveNodes(s.production!, s.nodes, ["d"], null, null));
    expect(titles(null)).toEqual(["30:C", "10:A", "20:B", "40:D"]);
  });

  it("moves a node to another parent, renumbering only if its code is taken there", () => {
    const { run, titles } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "sq", "SQ"));
    run((s) => planCreateNode(s.production!, s.nodes, "sq", "sc1", "Uno"));
    run((s) => planCreateNode(s.production!, s.nodes, "sq", "sc2", "Dos"));
    run((s) => planCreateNode(s.production!, s.nodes, "sc1", "x", "X")); // SH0010 in sc1
    run((s) => planCreateNode(s.production!, s.nodes, "sc1", "y", "Y")); // SH0020 in sc1
    run((s) => planCreateNode(s.production!, s.nodes, "sc2", "z", "Z")); // SH0010 in sc2
    run((s) => planMoveNodes(s.production!, s.nodes, ["x", "y"], "sc2", "z"));
    // x: 10 is taken in sc2 → 20; y: 20 is then taken → 30.
    expect(titles("sc2")).toEqual(["20:X", "30:Y", "10:Z"]);
    expect(titles("sc1")).toEqual([]);
  });

  it("refuses moves to the wrong level or into the node's own subtree", () => {
    const { run } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "sq", "SQ"));
    run((s) => planCreateNode(s.production!, s.nodes, "sq", "sc", "SC"));
    run((s) => planCreateNode(s.production!, s.nodes, "sc", "sh", "SH"));
    expect(run((s) => planMoveNodes(s.production!, s.nodes, ["sh"], "sq", null)).events).toEqual([]);
    expect(run((s) => planMoveNodes(s.production!, s.nodes, ["sq"], "sc", null)).events).toEqual([]);
  });

  it("edits the number of a code by hand and rejects clashes", () => {
    const { run, titles } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "a", "A"));
    run((s) => planCreateNode(s.production!, s.nodes, null, "b", "B"));
    run((s) => planSetNumber(s.production!, s.nodes, "a", 35));
    expect(titles(null)).toEqual(["35:A", "20:B"]); // keeps its place on screen
    expect(() => run((s) => planSetNumber(s.production!, s.nodes, "a", 20))).toThrow("SQ020 ya existe aquí.");
    expect(() => run((s) => planSetNumber(s.production!, s.nodes, "a", 1000))).toThrow("entre 1 y 999");
    expect(() => run((s) => planSetNumber(s.production!, s.nodes, "a", 2.5))).toThrow();
  });

  it("writes only the fields that change", () => {
    const { run, state, statuses } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "a", "A"));
    const plan = run((s) => planUpdateNode(s.nodes, "a", { title: "A", statusId: statuses[1]!.id }));
    expect(plan.events).toEqual([{ type: "node.updated", id: "a", patch: { statusId: statuses[1]!.id } }]);
    expect(run((s) => planUpdateNode(s.nodes, "a", { title: "A" })).events).toEqual([]);
    expect(state().nodes[0]!.statusId).toBe(statuses[1]!.id);
  });

  it("deletes a subtree", () => {
    const { run, state } = session();
    const a = run((s) => planCreateNode(s.production!, s.nodes, null, "a")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, a, "b"));
    run((s) => planDeleteNode(s.nodes, a));
    expect(state().nodes).toEqual([]);
    expect(run((s) => planDeleteNode(s.nodes, "nope")).events).toEqual([]);
  });

  it("trashes a subtree, frees its code and restores it with a new number if taken", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "tsq")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, sq, "tsc10", "A"));
    const sc20 = run((s) => planCreateNode(s.production!, s.nodes, sq, "tsc20", "B")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, sc20, "tsh", "Plano"));
    run((s) => planTrashNode(s.nodes, sc20));

    const live = () => splitTrash(state().nodes).live;
    expect(live().map((n) => n.id).sort()).toEqual(["tsc10", "tsq"]);
    expect(splitTrash(state().nodes).roots.map((n) => n.id)).toEqual([sc20]);

    // While it is in the trash its code is free on the board.
    run((s) => planCreateNode(s.production!, splitTrash(s.nodes).live, sq, "tsc20b", "C"));
    expect(childrenOf(live(), sq).map((n) => `${n.number}:${n.title}`)).toEqual(["10:A", "20:C"]);

    const plan = run((s) => planRestoreNode(s.production!, s.nodes, sc20));
    expect((plan as { renumbered?: number }).renumbered).toBe(30);
    expect(childrenOf(live(), sq).map((n) => `${n.number}:${n.title}`)).toEqual(["10:A", "20:C", "30:B"]);
    expect(live().some((n) => n.id === "tsh")).toBe(true);
  });

  it("restores with its own number when it is still free", () => {
    const { run, state } = session();
    const a = run((s) => planCreateNode(s.production!, s.nodes, null, "ra")).nodeId!;
    run((s) => planTrashNode(s.nodes, a));
    run((s) => planRestoreNode(s.production!, s.nodes, a));
    expect(state().nodes.find((n) => n.id === a)).toMatchObject({ number: 10 });
    expect(state().nodes.find((n) => n.id === a)?.trashedAt).toBeUndefined();
  });

  it("keeps media in the log, merges its updates and drops it with its node", () => {
    const { run, state } = session();
    const sh = run((s) => planCreateNode(s.production!, s.nodes, null, "msh")).nodeId!;
    const base = { nodeId: sh, kind: "image" as const, origin: "generated" as const, archived: false, createdBy: "u", createdAt: 1 };
    run(() => ({ events: [{ type: "media.added", media: { ...base, id: "m1", version: nextMediaVersion([], sh, "image"), status: "queued", progress: 0 } }] }));
    run(() => ({ events: [{ type: "media.updated", id: "m1", patch: { status: "ready", progress: 100, file: "SH0010_img_v001.png" } }] }));
    expect(state().media).toMatchObject([{ id: "m1", version: 1, status: "ready", file: "SH0010_img_v001.png", productionId: "p" }]);
    expect(nextMediaVersion(state().media, sh, "image")).toBe(2);
    expect(nextMediaVersion(state().media, sh, "video")).toBe(1);
    run((s) => planDeleteNode(s.nodes, sh));
    expect(state().media).toEqual([]);
  });

  it("cuts a shot into shots in its place and sets the original aside in «Vídeos editados»", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c", "Puerto")).nodeId!;
    const a = run((s) => planCreateNode(s.production!, s.nodes, sc, "a", "Faro")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, sc, "b", "Muelle"));
    const base = { nodeId: a, kind: "video" as const, origin: "generated" as const, archived: false, createdBy: "u", createdAt: 1, version: 1, status: "ready" as const, progress: 100, durationSec: 20 };
    run(() => ({ events: [{ type: "media.added", media: { ...base, id: "mv" } }] }));

    const segs = [{ inSec: 0, outSec: 4 }, { inSec: 9, outSec: 14 }, { inSec: 14, outSec: 20 }];
    const plan = run((s) => planSplitShot(s.production!, s.nodes, { id: "mv", nodeId: a }, segs, id, "u", 5)) as Plan & { nodeIds: string[] };
    const s = state();
    const { live, shelf } = splitTrash(s.nodes);
    // Same place on the row, codes 010, 013, 016 before 020; the original is off the board.
    expect(childrenOf(live, sc).map((n) => `${n.number}:${n.title}`)).toEqual(["10:Faro", "13:Faro", "16:Faro", "20:Muelle"]);
    expect(shelf.map((n) => n.id)).toEqual([a]);
    expect(s.conflicts).toEqual([]);
    // Each new shot plays its stretch of the original video.
    const takes = plan.nodeIds.map((nid) => s.takes.find((t) => t.id === s.nodes.find((n) => n.id === nid)!.selectedTakeId));
    expect(takes.map((t) => `${t?.mediaId}@${t?.inSec}-${t?.outSec}`)).toEqual(["mv@0-4", "mv@9-14", "mv@14-20"]);
    expect(folderPath(s.production!, s.nodes, s.nodes.find((n) => n.id === a)!)).toBe("SQ010_Secuencia-1/SC010_Puerto/_editados/SH0010_Faro");

    // Back to the row: its code is taken, so it gets the next free one.
    const back = run((st) => planUnshelveNode(st.production!, st.nodes, a)) as Plan & { renumbered?: number };
    expect(back.renumbered).toBe(30);
    expect(splitTrash(state().nodes).shelf).toEqual([]);
  });

  it("puts the new shots at the end when there is no gap left in the codes", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c")).nodeId!;
    const a = run((s) => planCreateNode(s.production!, s.nodes, sc, "a")).nodeId!;
    const b = run((s) => planCreateNode(s.production!, s.nodes, sc, "b")).nodeId!;
    run(() => ({ events: [{ type: "node.renumbered", numbers: { [b]: 11 } }] }));
    run(() => ({ events: [{ type: "media.added", media: { id: "mv", nodeId: a, kind: "video", origin: "generated", archived: false, createdBy: "u", createdAt: 1, version: 1, status: "ready", progress: 100, durationSec: 9 } }] }));
    run((s) => planSplitShot(s.production!, s.nodes, { id: "mv", nodeId: a }, [{ inSec: 0, outSec: 3 }, { inSec: 3, outSec: 6 }, { inSec: 6, outSec: 9 }], id, "u", 5));
    expect(childrenOf(splitTrash(state().nodes).live, sc).map((n) => n.number)).toEqual([10, 20, 30, 11]);
  });

  it("groups shots in a scene: a folder on disk, codes unchanged, out again when emptied", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c", "Puerto")).nodeId!;
    const sc2 = run((s) => planCreateNode(s.production!, s.nodes, sq, "c2")).nodeId!;
    const a = run((s) => planCreateNode(s.production!, s.nodes, sc, "a", "Faro")).nodeId!;
    const b = run((s) => planCreateNode(s.production!, s.nodes, sc, "b", "Muelle")).nodeId!;
    const c = run((s) => planCreateNode(s.production!, s.nodes, sc2, "c3", "Barca")).nodeId!;

    // Drag b onto a: a new group in a's place with both.
    const g = (run((s) => planGroupShots(s.production!, s.nodes, s.groups, [b], { shotId: a }, "g1", 1)) as Plan & { groupId?: string }).groupId!;
    let s = state();
    expect(s.groups).toMatchObject([{ id: g, parentId: sc, name: "Grupo 1" }]);
    expect(folderPath(s.production!, s.nodes, s.nodes.find((n) => n.id === b)!, s.groups)).toBe("SQ010_Secuencia-1/SC010_Puerto/Grupo-1/SH0020_Muelle");

    // A shot from another scene joins: it moves into the scene (keeps its code if free).
    run((st) => planGroupShots(st.production!, st.nodes, st.groups, [c], { groupId: g }, "unused", 2));
    s = state();
    expect(s.nodes.find((n) => n.id === c)).toMatchObject({ parentId: sc, groupId: g, number: 30 });

    run((st) => planRenameGroup(st.groups, g, "Por decidir"));
    expect(folderPath(state().production!, state().nodes, state().nodes.find((n) => n.id === a)!, state().groups)).toBe("SQ010_Secuencia-1/SC010_Puerto/Por-decidir/SH0010_Faro");

    // Moved to another scene: it leaves the group.
    run((st) => moveNodes(st.production!, st.nodes, [c], sc2, null));
    expect(state().nodes.find((n) => n.id === c)?.groupId).toBeNull();

    run((st) => planUngroupShots(st.nodes, st.groups, [a]));
    expect(state().groups).toHaveLength(1);
    run((st) => planDissolveGroup(st.nodes, st.groups, g));
    s = state();
    expect(s.groups).toEqual([]);
    expect(s.nodes.filter((n) => n.parentId === sc).map((n) => [n.number, n.groupId ?? null])).toEqual([[10, null], [20, null]]);
  });

  it("creates an imported shot where it is dropped, with the code in the gap", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c")).nodeId!;
    const [a, b] = ["a", "b"].map((t) => run((s) => planCreateNode(s.production!, s.nodes, sc, `i${t}`, t.toUpperCase())).nodeId!) as [string, string];
    const g = (run((s) => planGroupShots(s.production!, s.nodes, s.groups, [b], { shotId: a }, "ig", 1)) as Plan & { groupId?: string }).groupId!;
    // Before the first shot of the group (A, 010): 005; at the end: 030; inside the group, after A: 015.
    const first = run((s) => planCreateInRow(s.production!, s.nodes, s.groups, sc, { groupId: g }, null, "n1")).nodeId!;
    const last = run((s) => planCreateInRow(s.production!, s.nodes, s.groups, sc, null, null, "n2")).nodeId!;
    const inside = run((s) => planCreateInRow(s.production!, s.nodes, s.groups, sc, { nodeId: b }, g, "n3")).nodeId!;
    const n = (id: string) => state().nodes.find((x) => x.id === id)!;
    expect([n(first).number, n(first).groupId ?? null]).toEqual([5, null]);
    expect([n(last).number, n(last).groupId ?? null]).toEqual([30, null]);
    expect([n(inside).number, n(inside).groupId]).toEqual([15, g]);
  });

  it("reorders a row with groups: shots and groups by what the row shows, joining and leaving groups", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c")).nodeId!;
    const [a, b, c, d] = ["a", "b", "c", "d"].map((t) => run((s) => planCreateNode(s.production!, s.nodes, sc, `r${t}`, t.toUpperCase())).nodeId!) as [string, string, string, string];
    const g = (run((s) => planGroupShots(s.production!, s.nodes, s.groups, [c], { shotId: b }, "rg", 1)) as Plan & { groupId?: string }).groupId!;
    // The row shows A, [B C], D.
    const row = () => {
      const s = state();
      const kids = childrenOf(s.nodes, sc);
      const loose = kids.filter((n) => !n.groupId).map((n) => ({ k: n.title, at: n.order ?? n.number }));
      const gs = s.groups.filter((x) => kids.some((n) => n.groupId === x.id)).map((x) => ({ k: `[${kids.filter((n) => n.groupId === x.id).map((n) => n.title).join(" ")}]`, at: x.order }));
      return [...loose, ...gs].sort((x, y) => x.at - y.at).map((x) => x.k).join(" ");
    };
    expect(row()).toBe("A [B C] D");
    // D before the group; the group before A.
    run((s) => planPlaceInRow(s.production!, s.nodes, s.groups, [{ nodeId: d }], sc, { groupId: g }, null));
    expect(row()).toBe("A D [B C]");
    run((s) => planPlaceInRow(s.production!, s.nodes, s.groups, [{ groupId: g }], sc, { nodeId: a }, null));
    expect(row()).toBe("[B C] A D");
    // A into the open group, after B; then C out of it, at the end of the row.
    run((s) => planPlaceInRow(s.production!, s.nodes, s.groups, [{ nodeId: a }], sc, { nodeId: c }, g));
    expect(row()).toBe("[B A C] D");
    run((s) => planPlaceInRow(s.production!, s.nodes, s.groups, [{ nodeId: c }], sc, null, null));
    expect(row()).toBe("[B A] D C");
    // Codes never changed.
    expect(state().nodes.filter((n) => n.parentId === sc).map((n) => `${n.title}${n.number}`).sort()).toEqual(["A10", "B20", "C30", "D40"]);
  });

  it("keeps comments with replies, resolves them and drops a thread with its root", () => {
    const { run, state } = session();
    const sh = run((s) => planCreateNode(s.production!, s.nodes, null, "csh")).nodeId!;
    const base = { nodeId: sh, authorId: "u", resolved: false, createdAt: 1 };
    run(() => ({ events: [{ type: "comment.added", comment: { ...base, id: "c1", text: "Más luz @Ana", mentions: ["u_ana"], atSec: 4.2, point: { x: 0.5, y: 0.4 } } }] }));
    run(() => ({ events: [{ type: "comment.added", comment: { ...base, id: "c2", text: "Hecho", parentId: "c1", authorId: "u_ana" } }] }));
    run(() => ({ events: [{ type: "comment.updated", id: "c1", patch: { resolved: true } }] }));
    expect(state().comments).toMatchObject([{ id: "c1", resolved: true, mentions: ["u_ana"], atSec: 4.2, productionId: "p" }, { id: "c2", parentId: "c1" }]);
    run(() => ({ events: [{ type: "comment.deleted", id: "c1" }] }));
    expect(state().comments).toEqual([]);
  });

  it("takes a version out to the row as a new shot right after, with it as its take", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c")).nodeId!;
    const a = run((s) => planCreateNode(s.production!, s.nodes, sc, "xa", "Faro")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, sc, "xb", "Muelle"));
    run(() => ({ events: [{ type: "media.added", media: { id: "mx", nodeId: a, kind: "video", origin: "generated", archived: false, createdBy: "u", createdAt: 1, version: 2, status: "ready", progress: 100, durationSec: 6 } }] }));
    const shotId = run((s) => planExtractVersion(s.production!, s.nodes, a, { id: "mx", durationSec: 6 }, id, "u", 5)).nodeId!;
    const s = state();
    expect(childrenOf(s.nodes, sc).map((n) => `${n.number}:${n.title}`)).toEqual(["10:Faro", "15:Faro", "20:Muelle"]);
    const shot = s.nodes.find((n) => n.id === shotId)!;
    expect(s.takes.find((t) => t.id === shot.selectedTakeId)).toMatchObject({ mediaId: "mx", inSec: 0, outSec: 6 });
    expect(s.media.find((m) => m.id === "mx")?.nodeId).toBe(a);
  });

  it("cuts a cut shot again: it keeps the first stretch, the rest go right after it", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c")).nodeId!;
    const a = run((s) => planCreateNode(s.production!, s.nodes, sc, "ta", "Faro")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, sc, "tb", "Muelle"));
    run(() => ({ events: [{ type: "media.added", media: { id: "mt", nodeId: a, kind: "video", origin: "generated", archived: false, createdBy: "u", createdAt: 1, version: 1, status: "ready", progress: 100, durationSec: 20 } }] }));
    const cut = run((s) => planSplitShot(s.production!, s.nodes, { id: "mt", nodeId: a }, [{ inSec: 0, outSec: 10 }], id, "u", 2)) as Plan & { nodeIds: string[] };
    const shot = cut.nodeIds[0]!;
    const take = state().takes.find((t) => t.nodeId === shot)!;
    run((s) => planSplitTakeShot(s.production!, splitTrash(s.nodes).live, shot, take, [{ inSec: 0, outSec: 4 }, { inSec: 6, outSec: 10 }], id, "u", 3));
    const s = state();
    const row = childrenOf(splitTrash(s.nodes).live, sc);
    expect(row.map((n) => `${n.number}:${n.title}`)).toEqual(["10:Faro", "15:Faro", "20:Muelle"]);
    expect(row.slice(0, 2).map((n) => { const t = s.takes.find((x) => x.id === n.selectedTakeId)!; return `${t.mediaId}@${t.inSec}-${t.outSec}`; })).toEqual(["mt@0-4", "mt@6-10"]);
  });

  it("edits a video in «Vídeos editados»: new shots after the last one made from it, the original stays", () => {
    const { run, state } = session();
    const sq = run((s) => planCreateNode(s.production!, s.nodes, null, "q")).nodeId!;
    const sc = run((s) => planCreateNode(s.production!, s.nodes, sq, "c")).nodeId!;
    const a = run((s) => planCreateNode(s.production!, s.nodes, sc, "ea", "Faro")).nodeId!;
    run((s) => planCreateNode(s.production!, s.nodes, sc, "eb", "Muelle"));
    run(() => ({ events: [{ type: "media.added", media: { id: "me", nodeId: a, kind: "video", origin: "generated", archived: false, createdBy: "u", createdAt: 1, version: 1, status: "ready", progress: 100, durationSec: 20 } }] }));
    const cut = run((s) => planSplitShot(s.production!, s.nodes, { id: "me", nodeId: a }, [{ inSec: 0, outSec: 5 }], id, "u", 2)) as Plan & { nodeIds: string[] };
    const original = state().nodes.find((n) => n.id === a)!;
    expect(original.shelvedAt).toBeDefined();
    run((s) => planShotsFromEdited(s.production!, s.nodes, original, cut.nodeIds[0]!, { id: "me" }, [{ inSec: 8, outSec: 12 }, { inSec: 15, outSec: 20 }], id, "u", 3));
    const s = state();
    const row = childrenOf(splitTrash(s.nodes).live, sc).filter((n) => n.shelvedAt === undefined);
    expect(row.map((n) => `${n.number}:${n.title}`)).toEqual(["10:Faro", "15:Faro", "17:Faro", "20:Muelle"]);
    expect(row.slice(1, 3).map((n) => { const t = s.takes.find((x) => x.id === n.selectedTakeId)!; return `${t.mediaId}@${t.inSec}-${t.outSec}`; })).toEqual(["me@8-12", "me@15-20"]);
    expect(s.nodes.find((n) => n.id === a)!.shelvedAt).toBeDefined();
  });
});

describe("library", () => {
  it("makes the desk and cards apart from the board, with their own folders", async () => {
    const { foldLog, LOG_VERSION, formatStamp, ZERO_HLC, hlcTick, splitTrash, folderPath, codeOf, defaultLevels, defaultStatuses } = await import("./index");
    let clock = ZERO_HLC;
    let k = 0;
    const id = (p: string) => `${p}${k++}`;
    const p = { id: "p", workspaceId: "w", name: "Mareas", levels: defaultLevels(id), statuses: defaultStatuses(id), createdAt: 0, updatedAt: 0 };
    const emit = (events: import("./log").LogEventBody[]) => events.map((b, i) => {
      clock = hlcTick(clock, 1000 + i + k++);
      return { ...b, v: LOG_VERSION, at: formatStamp(clock, "d"), userId: "u" } as import("./log").LogEvent;
    });
    const evs = [
      ...emit([{ type: "production.created", production: p }]),
      ...emit(planCreateLibNode(p, { kind: "desk" }, "", "desk").events),
      ...emit(planCreateLibNode(p, { kind: "card", type: "cast" }, "Elena Ruiz", "elena").events),
      ...emit([1, 2, 3].map((v) => ({ type: "media.added" as const, media: { id: `m${v}`, nodeId: "desk", kind: "image" as const, version: v, origin: "generated" as const, status: "ready" as const, progress: 100, archived: false, createdBy: "u", createdAt: 0 } }))),
    ];
    let s = foldLog(evs);
    const split = splitTrash(s.nodes);
    expect(split.live).toEqual([]);
    expect(split.library.map((n) => n.id)).toEqual(["desk", "elena"]);
    const elena = s.nodes.find((n) => n.id === "elena")!;
    expect(folderPath(s.production!, s.nodes, elena)).toBe("Biblioteca/Elena-Ruiz");
    expect(folderPath(s.production!, s.nodes, s.nodes.find((n) => n.id === "desk")!)).toBe("Biblioteca/_mesa");
    expect(codeOf(s.production!, elena)).toBe("Elena-Ruiz");

    // Two images chosen into Elena's card: they become her v001 and v002 references.
    s = foldLog([...evs, ...emit(planMoveToLib(s.media, s.nodes, ["m2", "m3"], "elena", true).events)]);
    expect(s.media.filter((m) => m.nodeId === "elena").map((m) => [m.id, m.version, m.chosen])).toEqual([["m2", 1, true], ["m3", 2, true]]);
    expect(s.media.find((m) => m.id === "m1")).toMatchObject({ nodeId: "desk", version: 1 });
  });
});

describe("library groups", () => {
  const p = { id: "p", workspaceId: "w", name: "M", levels: [], statuses: [{ id: "s", name: "P", color: "#fff", category: "todo" as const, order: 0 }], createdAt: 0, updatedAt: 0 };
  const group = (id: string, title: string, number: number) => ({ id, productionId: "p", parentId: null, levelId: "lib", number, title, notes: "", statusId: "s", assigneeIds: [], assetIds: [], lib: { kind: "card" as const }, updatedAt: 0, updatedBy: "u" });
  const img = (id: string, nodeId: string, createdAt: number, version = 1) => ({ id, nodeId, kind: "image" as const, version, createdAt, archived: false });

  it("names new groups «Grupo N» until the team names them", () => {
    expect(nextGroupName([])).toBe("Grupo 1");
    expect(nextGroupName(["Grupo 1", "Casa de Robida", "grupo 2"])).toBe("Grupo 3");
    const plan = planCreateLibNode(p, { kind: "card" }, "", "g3", [group("g1", "Grupo 1", 1), group("g2", "Elena", 4)]);
    expect(plan.events[0]).toMatchObject({ type: "node.created", node: { title: "Grupo 2", number: 5 } });
  });

  it("gives two groups with the same name their own folder", async () => {
    const { folderPath } = await import("./index");
    const nodes = [group("a", "Personaje 1", 1), group("b", "Personaje 1", 2)];
    expect(nodes.map((n) => folderPath(p, nodes, n))).toEqual(["Biblioteca/Personaje-1", "Biblioteca/Personaje-1-2"]);
  });

  it("places images before another one, or at the end, also from another group", () => {
    const nodes = [group("a", "A", 1), group("b", "B", 2)];
    const media = [img("a1", "a", 100), img("a2", "a", 200), img("a3", "a", 300), img("b1", "b", 150)];
    const order = (events: ReturnType<typeof planPlaceLibMedia>["events"]) => {
      const next = media.map((m) => ({ ...m }));
      for (const e of events) if (e.type === "media.updated") Object.assign(next.find((m) => m.id === e.id)!, e.patch);
      return next.filter((m) => m.nodeId === "a").sort((x, y) => ((x as { order?: number }).order ?? x.createdAt) - ((y as { order?: number }).order ?? y.createdAt)).map((m) => `${m.id}:v${m.version}`);
    };
    expect(order(planPlaceLibMedia(media, nodes, ["a3"], "a", "a1").events)).toEqual(["a3:v1", "a1:v1", "a2:v1"]);
    expect(order(planPlaceLibMedia(media, nodes, ["b1"], "a", "a2").events)).toEqual(["a1:v1", "b1:v2", "a2:v1", "a3:v1"]);
    expect(order(planPlaceLibMedia(media, nodes, ["a1"], "a", null).events)).toEqual(["a2:v1", "a3:v1", "a1:v1"]);
  });
});
