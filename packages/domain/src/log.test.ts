import { describe, expect, it } from "vitest";
import {
  defaultLevels,
  defaultStatuses,
  foldLog,
  formatStamp,
  hlcObserve,
  hlcTick,
  LOG_VERSION,
  logFilePath,
  parseLog,
  parseStamp,
  serializeEvent,
  ZERO_HLC,
  type Hlc,
  type LogEvent,
  type LogEventBody,
} from "./index";

let ids = 0;
const id = (p: string) => `${p}${ids++}`;
const levels = defaultLevels(id);
const statuses = defaultStatuses(id);
const [SQ, SC, SH] = levels.map((l) => l.id) as [string, string, string];
const TODO = statuses[0]!.id;
const DONE = statuses[4]!.id;

/** A device writing its own log with its own clock. */
function device(deviceId: string, userId = `u_${deviceId}`) {
  let clock: Hlc = ZERO_HLC;
  let now = 1_000;
  return {
    emit(body: LogEventBody, at = now++): LogEvent {
      clock = hlcTick(clock, at);
      return { ...body, v: LOG_VERSION, at: formatStamp(clock, deviceId), userId } as LogEvent;
    },
    /** Read another device's events before writing (what the app does after a sync). */
    see(events: LogEvent[]) {
      for (const e of events) clock = hlcObserve(clock, parseStamp(e.at)!.clock, now);
    },
    setNow(ms: number) {
      now = ms;
    },
  };
}

const created = (prodId = "p1"): LogEventBody => ({
  type: "production.created",
  production: { id: prodId, workspaceId: "w", name: "Mareas", levels, statuses },
});

const node = (nodeId: string, parentId: string | null, levelId: string, number: number, title = ""): LogEventBody => ({
  type: "node.created",
  node: { id: nodeId, parentId, levelId, number, title, statusId: TODO },
});

/** Every permutation would be overkill; a few reorderings catch order dependence. */
function shuffles<T>(xs: T[]): T[][] {
  return [xs, [...xs].reverse(), [...xs.slice(1), xs[0]!], xs.filter((_, i) => i % 2).concat(xs.filter((_, i) => !(i % 2)))];
}

describe("hybrid logical clock", () => {
  it("orders stamps as strings and round-trips them", () => {
    const a = formatStamp({ wall: 5, counter: 0 }, "dev-a");
    const b = formatStamp({ wall: 5, counter: 1 }, "dev-a");
    const c = formatStamp({ wall: 6, counter: 0 }, "dev-a");
    expect([c, b, a].sort()).toEqual([a, b, c]);
    expect(parseStamp(b)).toEqual({ clock: { wall: 5, counter: 1 }, deviceId: "dev-a" });
    expect(parseStamp("nope")).toBeNull();
  });

  it("never goes backwards when the wall clock does", () => {
    const t1 = hlcTick(ZERO_HLC, 100);
    const t2 = hlcTick(t1, 90);
    expect(t2).toEqual({ wall: 100, counter: 1 });
  });

  it("sorts after a stamp seen from a device whose clock runs ahead", () => {
    const mine = hlcTick(ZERO_HLC, 100);
    const theirs: Hlc = { wall: 5_000, counter: 3 };
    const after = hlcTick(hlcObserve(mine, theirs, 120), 130);
    expect(formatStamp(after, "a") > formatStamp(theirs, "b")).toBe(true);
  });
});

describe("log files", () => {
  it("writes one file per device and month", () => {
    expect(logFilePath("mac-ana", Date.UTC(2026, 9, 15))).toBe(".sweetflow/log/mac-ana/2026-10.jsonl");
  });

  it("round-trips events and skips unreadable lines", () => {
    const d = device("a");
    const e1 = d.emit(created());
    const e2 = d.emit(node("n1", null, SQ, 10, "Apertura"));
    const text = [serializeEvent(e1), "", serializeEvent(e2), '{"v":1,"type":"node.cre', '{"v":1,"at":"x","userId":"u","type":"node.deleted"}'].join("\n");
    const { events, badLines } = parseLog(text);
    expect(events).toEqual([e1, e2]);
    expect(badLines).toEqual([4, 5]);
  });

  it("rejects events from a newer log version", () => {
    const e = { ...device("a").emit(created()), v: LOG_VERSION + 1 };
    expect(parseLog(serializeEvent(e)).badLines).toEqual([1]);
  });
});

describe("foldLog", () => {
  it("builds the production and its tree", () => {
    const d = device("a");
    const s = foldLog([
      d.emit(created()),
      d.emit(node("sq", null, SQ, 10, "Apertura")),
      d.emit(node("sc", "sq", SC, 10, "Persecución")),
      d.emit(node("sh", "sc", SH, 10, "Plano general")),
    ]);
    expect(s.production?.name).toBe("Mareas");
    expect(s.nodes.map((n) => [n.id, n.parentId, n.number, n.productionId])).toEqual([
      ["sq", null, 10, "p1"],
      ["sc", "sq", 10, "p1"],
      ["sh", "sc", 10, "p1"],
    ]);
    expect(s.conflicts).toEqual([]);
  });

  it("gives the same state whatever order the logs arrive in", () => {
    const a = device("a");
    const b = device("b");
    const events = [
      a.emit(created()),
      a.emit(node("sq", null, SQ, 10)),
      b.emit(node("sq2", null, SQ, 20)),
      a.emit({ type: "node.updated", id: "sq", patch: { title: "A" } }),
      b.emit({ type: "node.updated", id: "sq", patch: { title: "B", notes: "nota" } }),
      a.emit({ type: "node.renumbered", numbers: { sq: 20, sq2: 10 } }),
    ];
    const states = shuffles(events).map((e) => foldLog(e));
    for (const s of states) expect(s).toEqual(states[0]);
  });

  it("resolves concurrent edits field by field, last writer wins", () => {
    const a = device("a");
    const b = device("b");
    const base = [a.emit(created()), a.emit(node("sq", null, SQ, 10))];
    b.see(base);
    // Same instant on both devices: the device id breaks the tie ("b" > "a").
    a.setNow(2_000);
    b.setNow(2_000);
    const s = foldLog([
      ...base,
      a.emit({ type: "node.updated", id: "sq", patch: { title: "De A", statusId: DONE } }),
      b.emit({ type: "node.updated", id: "sq", patch: { title: "De B" } }),
    ]);
    expect(s.nodes[0]).toMatchObject({ title: "De B", statusId: DONE, updatedBy: "u_b" });
  });

  it("lets a later write win even if the writer's wall clock lags", () => {
    const a = device("a");
    const b = device("b");
    a.setNow(9_000);
    const first = [a.emit(created()), a.emit(node("sq", null, SQ, 10)), a.emit({ type: "node.updated", id: "sq", patch: { title: "Antes" } })];
    b.setNow(1_000); // b's clock is 8 s behind, but it has seen a's events
    b.see(first);
    const s = foldLog([...first, b.emit({ type: "node.updated", id: "sq", patch: { title: "Después" } })]);
    expect(s.nodes[0]!.title).toBe("Después");
  });

  it("deletes the subtree, including children created concurrently", () => {
    const a = device("a");
    const b = device("b");
    const base = [a.emit(created()), a.emit(node("sq", null, SQ, 10)), a.emit(node("sc", "sq", SC, 10))];
    b.see(base);
    const s = foldLog([
      ...base,
      a.emit({ type: "node.deleted", id: "sq" }),
      b.emit(node("sh", "sc", SH, 10)), // b did not know about the delete
      b.emit({ type: "node.updated", id: "sq", patch: { title: "zombi" } }),
    ]);
    expect(s.nodes).toEqual([]);
  });

  it("does not resurrect a deleted node", () => {
    const a = device("a");
    const s = foldLog([
      a.emit(created()),
      a.emit(node("sq", null, SQ, 10)),
      a.emit({ type: "node.deleted", id: "sq" }),
      a.emit(node("sq", null, SQ, 10)),
    ]);
    expect(s.nodes).toEqual([]);
  });

  it("separates siblings that took the same number on two devices", () => {
    const a = device("a");
    const b = device("b");
    const base = [a.emit(created()), a.emit(node("sq", null, SQ, 10)), a.emit(node("sc", "sq", SC, 10)), a.emit(node("sh10", "sc", SH, 10)), a.emit(node("sh20", "sc", SH, 20))];
    b.see(base);
    // Both insert after SH0010 → both pick 15.
    const fromA = a.emit(node("x", "sc", SH, 15, "de A"));
    const fromB = b.emit(node("y", "sc", SH, 15, "de B"));
    for (const order of shuffles([...base, fromA, fromB])) {
      const s = foldLog(order);
      const num = (nid: string) => s.nodes.find((n) => n.id === nid)!.number;
      const first = fromA.at < fromB.at ? "x" : "y";
      const second = first === "x" ? "y" : "x";
      expect(num(first)).toBe(15);
      expect(num(second)).toBe(17); // midpoint of the 15–20 gap
      expect(s.conflicts).toEqual([{ nodeId: second, wanted: 15, got: 17 }]);
    }
  });

  it("moves a clashing node to the end when there is no gap left", () => {
    const a = device("a");
    const b = device("b");
    const base = [a.emit(created()), a.emit(node("sq", null, SQ, 10)), a.emit(node("sq11", null, SQ, 11))];
    b.see(base);
    const x = a.emit(node("x", null, SQ, 10));
    const y = b.emit(node("y", null, SQ, 10));
    const s = foldLog([...base, x, y]);
    const numbers = Object.fromEntries(s.nodes.map((n) => [n.id, n.number]));
    const [first, second] = x.at < y.at ? ["x", "y"] : ["y", "x"];
    expect(numbers).toEqual({ sq: 10, sq11: 11, [first]: 20, [second]: 30 });
    expect(new Set(Object.values(numbers)).size).toBe(4);
  });

  it("separates two nodes moved into the same parent with the same code at once", () => {
    const a = device("a");
    const b = device("b");
    const base = [
      a.emit(created()),
      a.emit(node("sq", null, SQ, 10)),
      a.emit(node("sc1", "sq", SC, 10)),
      a.emit(node("sc2", "sq", SC, 20)),
      a.emit(node("sc3", "sq", SC, 30)),
      a.emit(node("x", "sc1", SH, 10)),
      a.emit(node("y", "sc2", SH, 10)),
    ];
    b.see(base);
    const s = foldLog([
      ...base,
      a.emit({ type: "node.moved", id: "x", parentId: "sc3", order: 5 }),
      b.emit({ type: "node.moved", id: "y", parentId: "sc3", order: 6 }),
    ]);
    const inSc3 = s.nodes.filter((n) => n.parentId === "sc3").map((n) => n.number).sort();
    expect(inSc3).toEqual([10, 20]);
    expect(s.conflicts).toHaveLength(1);
  });

  it("applies configuration changes and ignores duplicate events", () => {
    const a = device("a");
    const e1 = a.emit(created());
    const e2 = a.emit({ type: "statuses.set", statuses: statuses.slice(0, 2) });
    const e3 = a.emit({ type: "production.updated", patch: { name: "Mareas · Ep01" } });
    const s = foldLog([e1, e2, e3, e2, e1]);
    expect(s.production).toMatchObject({ name: "Mareas · Ep01", statuses: statuses.slice(0, 2), levels });
    expect(s.lastStamp).toBe(e3.at);
  });

  it("keeps the latest profile of each member", () => {
    const a = device("a");
    const join = (displayName: string): LogEventBody => ({ type: "member.joined", member: { uid: "u_a", displayName, email: "a@x", role: "admin" } });
    const s = foldLog([a.emit(created()), a.emit(join("Ana")), a.emit(join("Ana G."))]);
    expect(s.members).toEqual([{ uid: "u_a", displayName: "Ana G.", email: "a@x", role: "admin", magnificConnected: false }]);
  });

  it("starts empty without a production", () => {
    expect(foldLog([])).toEqual({ production: null, nodes: [], media: [], takes: [], groups: [], comments: [], members: [], conflicts: [], lastStamp: null });
  });
});
