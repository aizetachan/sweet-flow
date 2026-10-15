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

  it("inserts in the gap, renumbering siblings when it is full", () => {
    const { run, titles } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "a", "A"));
    run((s) => planCreateNode(s.production!, s.nodes, null, "b", "B"));
    run((s) => planInsertAfter(s.production!, s.nodes, "a", "x"));
    expect(titles(null)).toEqual(["10:A", "15:", "20:B"]);
    for (const nid of ["y", "z", "w"]) run((s) => planInsertAfter(s.production!, s.nodes, "a", nid));
    // After a: 15, then 12, then 11; no gap left between 10 and 11, so the
    // siblings renumber to 10…50 and the new one lands at 15.
    expect(titles(null).map((t) => t.split(":")[0])).toEqual(["10", "15", "20", "30", "40", "50"]);
  });

  it("swaps with a neighbour and ignores moves past the ends", () => {
    const { run, titles } = session();
    run((s) => planCreateNode(s.production!, s.nodes, null, "a", "A"));
    run((s) => planCreateNode(s.production!, s.nodes, null, "b", "B"));
    run((s) => planMoveNode(s.nodes, "b", -1));
    expect(titles(null)).toEqual(["10:B", "20:A"]);
    expect(run((s) => planMoveNode(s.nodes, "b", -1)).events).toEqual([]);
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
});
