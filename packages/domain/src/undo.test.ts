import { describe, expect, it } from "vitest";
import {
  childrenOf,
  defaultLevels,
  defaultStatuses,
  foldLog,
  formatStamp,
  hlcTick,
  invertEvents,
  LOG_VERSION,
  planCreateNode,
  ZERO_HLC,
  type Hlc,
  type LogEvent,
  type LogEventBody,
} from "./index";

let ids = 0;
const id = (p: string) => `${p}${ids++}`;

function session() {
  const log: LogEvent[] = [];
  let clock: Hlc = ZERO_HLC;
  const append = (bodies: LogEventBody[]) => {
    for (const b of bodies) {
      clock = hlcTick(clock, 1_000);
      log.push({ ...b, v: LOG_VERSION, at: formatStamp(clock, "dev"), userId: "u" } as LogEvent);
    }
  };
  append([{ type: "production.created", production: { id: "p", workspaceId: "w", name: "T", levels: defaultLevels(id), statuses: defaultStatuses(id) } }]);
  const state = () => foldLog(log);
  /** Does it, and returns how to undo it. */
  const act = (bodies: LogEventBody[]) => {
    const undo = invertEvents(state(), bodies);
    append(bodies);
    return undo;
  };
  return { append, state, act };
}

describe("undo", () => {
  it("brings back a shot sent to the trash, and redo sends it again", () => {
    const { append, state, act } = session();
    const sq = planCreateNode(state().production!, state().nodes, null, "q").events;
    append(sq);
    const q = state().nodes[0]!.id;
    const undo = act([{ type: "node.trashed", id: q }]);
    expect(state().nodes[0]!.trashedAt).toBeDefined();
    const redo = invertEvents(state(), undo);
    append(undo);
    expect(state().nodes[0]!.trashedAt).toBeUndefined();
    append(redo);
    expect(state().nodes[0]!.trashedAt).toBeDefined();
  });

  it("puts back a title, a place and a code", () => {
    const { append, state, act } = session();
    append(planCreateNode(state().production!, state().nodes, null, "a", "Uno").events);
    append(planCreateNode(state().production!, state().nodes, null, "b", "Dos").events);
    const [a] = childrenOf(state().nodes, null);
    append(act([{ type: "node.updated", id: a!.id, patch: { title: "Otro" } }]));
    expect(state().nodes.find((n) => n.id === a!.id)?.title).toBe("Uno");
    const before = state().nodes.find((n) => n.id === a!.id)!;
    append(act([{ type: "node.moved", id: a!.id, parentId: null, order: 999, number: 70 }]));
    const after = state().nodes.find((n) => n.id === a!.id)!;
    expect([after.number, after.parentId ?? null]).toEqual([before.number, before.parentId ?? null]);
  });

  it("a shot created goes to the trash on undo (never deleted)", () => {
    const { append, state, act } = session();
    const undo = act(planCreateNode(state().production!, state().nodes, null, "c", "Nuevo").events);
    expect(undo).toEqual([{ type: "node.trashed", id: expect.any(String) }]);
    append(undo);
    expect(state().nodes[0]!.trashedAt).toBeDefined();
  });

  it("leaves generations alone", () => {
    const { state } = session();
    const undo = invertEvents(state(), [{ type: "media.updated", id: "m", patch: { status: "ready", progress: 100 } }]);
    expect(undo).toEqual([]);
  });
});
