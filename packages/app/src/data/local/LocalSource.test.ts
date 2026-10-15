import { defaultLevels, defaultStatuses, type Member } from "@sweetflow/domain";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../source";
import { LocalSource } from "./LocalSource";
import { MemoryLogStore, type LogStore } from "./store";

let n = 0;
const newId = (p: string) => `${p}${n++}`;
const levels = defaultLevels(newId);
const statuses = defaultStatuses(newId);
const create = { id: "p1", name: "Mareas", levels, statuses };

const member = (uid: string, displayName: string): Member => ({ uid, displayName, email: `${uid}@x`, role: "admin", magnificConnected: false });

function open(store: LogStore, deviceId: string, me = member(`u_${deviceId}`, deviceId), clock = { t: 1_000 }) {
  const src = new LocalSource({ store, deviceId, me, create, newId, now: () => clock.t++ });
  let last: Snapshot | null = null;
  src.subscribe((s) => (last = s));
  return { src, snap: () => last! };
}

describe("LocalSource", () => {
  it("creates the production in an empty folder and saves it", async () => {
    const store = new MemoryLogStore();
    const { src, snap } = open(store, "a");
    await src.ready;
    src.createNode(null, "Apertura");
    await src.flushed();
    expect(snap().production.name).toBe("Mareas");
    expect(snap().nodes.map((x) => x.title)).toEqual(["Apertura"]);
    expect(snap().mirror).toMatchObject({ status: "synced", pending: 0 });
    expect([...store.files.keys()]).toEqual([expect.stringMatching(/^\.sweetflow\/log\/a\/\d{4}-\d{2}\.jsonl$/)]);
  });

  it("reopens the same state from disk", async () => {
    const store = new MemoryLogStore();
    const first = open(store, "a");
    await first.src.ready;
    const sq = first.src.createNode(null, "Apertura");
    first.src.createNode(sq, "Puerto");
    first.src.updateNode(sq, { notes: "noche" });
    await first.src.flushed();

    const again = open(store, "a", undefined, { t: 50_000 });
    await again.src.ready;
    expect(again.snap().nodes).toEqual(first.snap().nodes);
    // Reopening does not create a second production or re-announce the member.
    expect(store.files.get([...store.files.keys()][0]!)!.match(/production.created|member.joined/g)).toHaveLength(2);
  });

  it("merges two devices sharing a folder", async () => {
    const store = new MemoryLogStore();
    const a = open(store, "a", member("u_ana", "Ana"));
    await a.src.ready;
    const sq = a.src.createNode(null, "Apertura");
    await a.src.flushed();

    const b = open(store, "b", member("u_bea", "Bea"));
    await b.src.ready;
    await b.src.flushed();
    expect(b.snap().nodes.map((x) => x.id)).toEqual([sq]);

    // Both edit while offline, then the sync client delivers the files.
    a.src.updateNode(sq, { title: "Apertura (A)" });
    b.src.updateNode(sq, { notes: "de B" });
    b.src.createNode(null, "Final");
    await Promise.all([a.src.flushed(), b.src.flushed()]);
    store.notify();
    await new Promise((r) => setTimeout(r, 0));

    expect(a.snap().nodes).toEqual(b.snap().nodes);
    expect(a.snap().nodes.find((x) => x.id === sq)).toMatchObject({ title: "Apertura (A)", notes: "de B" });
    expect(a.snap().members.map((m) => m.displayName).sort()).toEqual(["Ana", "Bea"]);
  });

  it("keeps working and retries when saving fails", async () => {
    const store = new MemoryLogStore();
    const flaky: LogStore = {
      label: store.label,
      readAll: () => store.readAll(),
      watch: (cb) => store.watch(cb),
      append: async () => {
        throw new Error("disco lleno");
      },
    };
    const errors = console.error;
    console.error = () => undefined;
    const { src, snap } = open(flaky, "a");
    try {
      await src.ready.catch(() => undefined);
      await src.flushed();
      expect(snap().mirror.status).toBe("offline");
      src.createNode(null, "Sigue");
      expect(snap().nodes.map((x) => x.title)).toEqual(["Sigue"]);
      await src.flushed();
      expect(snap().mirror).toMatchObject({ status: "offline", pending: 3 });
    } finally {
      console.error = errors;
      src.dispose();
    }
  });

  it("fails to open a folder without a production unless asked to create one", async () => {
    const src = new LocalSource({ store: new MemoryLogStore(), deviceId: "a", me: member("u", "U"), newId });
    await expect(src.ready).rejects.toThrow("ninguna producción");
  });
});
