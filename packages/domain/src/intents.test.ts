import { describe, expect, it } from "vitest";
import {
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
  splitTrash,
  planUpdateNode,
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
    expect(titles(null)).toEqual(["10:A", "15:", "20:B"]);
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
});
