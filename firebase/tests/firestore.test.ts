import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createEnv, OUTSIDER, PROD, prodPath, seedFirestore, STATUSES, WS, type TestRole } from "./setup";

let env: RulesTestEnvironment;

const as = (uid: TestRole | typeof OUTSIDER) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(() => seedFirestore(env));
afterAll(() => env.cleanup());

describe("reading", () => {
  it("members of any role read the production and its collections", async () => {
    for (const path of ["", "nodes/n1", "media/m1", "comments/c1", "members/artist", "activity/a1"]) {
      await assertSucceeds(as("viewer").doc(prodPath(path)).get());
    }
  });

  it("outsiders and anonymous users read nothing", async () => {
    await assertFails(as(OUTSIDER).doc(prodPath()).get());
    await assertFails(as(OUTSIDER).doc(prodPath("nodes/n1")).get());
    await assertFails(anon().doc(prodPath()).get());
    await assertFails(as(OUTSIDER).doc(`workspaces/${WS}`).get());
  });

  it("a user finds their productions with a collection-group query on their uid", async () => {
    await assertSucceeds(as("artist").collectionGroup("members").where("uid", "==", "artist").get());
    await assertFails(as("artist").collectionGroup("members").get());
  });
});

describe("production settings", () => {
  it("admins edit name and statuses", async () => {
    const statuses = [...STATUSES, { id: "st_retake", name: "Retake", color: "#ec6a6a", category: "active", order: 3 }];
    await assertSucceeds(as("admin").doc(prodPath()).update({ name: "Mareas T1", statuses, updatedAt: 2 }));
  });

  it("statuses can be archived but not removed", async () => {
    await assertFails(as("admin").doc(prodPath()).update({ statuses: STATUSES.slice(1) }));
    const archived = STATUSES.map((s, i) => (i === 0 ? { ...s, archived: true } : s));
    await assertSucceeds(as("admin").doc(prodPath()).update({ statuses: archived }));
  });

  it("levels only change through Functions, even for the owner", async () => {
    await assertFails(as("owner").doc(prodPath()).update({ levels: [] }));
  });

  it("supervisors and below can't edit settings", async () => {
    await assertFails(as("supervisor").doc(prodPath()).update({ name: "X" }));
  });

  it("nobody creates or deletes productions from the client", async () => {
    await assertFails(as("owner").doc("productions/p2").set({ workspaceId: WS, name: "Nueva" }));
    await assertFails(as("owner").doc(prodPath()).delete());
  });
});

describe("nodes", () => {
  const edit = (uid: TestRole, id: string, patch: Record<string, unknown>) =>
    as(uid).doc(prodPath(`nodes/${id}`)).update({ ...patch, updatedAt: 2, updatedBy: uid });

  it("artists edit content fields", async () => {
    await assertSucceeds(edit("artist", "n1", { title: "Apertura en el puerto", notes: "Amanecer" }));
  });

  it("viewers can't edit nodes", async () => {
    await assertFails(edit("viewer", "n1", { title: "X" }));
  });

  it("updatedBy must be the caller", async () => {
    await assertFails(as("artist").doc(prodPath("nodes/n1")).update({ title: "X", updatedBy: "owner" }));
  });

  it("artists change status only on nodes assigned to them", async () => {
    await assertFails(edit("artist", "n1", { statusId: "st_review" }));
    await assertSucceeds(edit("artist", "n2", { statusId: "st_review" }));
  });

  it("supervisors change status and assign", async () => {
    await assertSucceeds(edit("supervisor", "n1", { statusId: "st_done", assigneeIds: ["artist"] }));
  });

  it("artists can't assign", async () => {
    await assertFails(edit("artist", "n2", { assigneeIds: ["artist", "supervisor"] }));
  });

  it("structural fields are server-only, even for the owner", async () => {
    await assertFails(edit("owner", "n1", { number: 15 }));
    await assertFails(edit("owner", "n1", { parentId: "n2" }));
    await assertFails(edit("owner", "n1", { code: "SQ015" }));
  });

  it("nodes are never created or deleted from the client", async () => {
    await assertFails(as("owner").doc(prodPath("nodes/n9")).set({ title: "X" }));
    await assertFails(as("owner").doc(prodPath("nodes/n1")).delete());
  });
});

describe("media", () => {
  it("artists archive and restore", async () => {
    await assertSucceeds(as("artist").doc(prodPath("media/m1")).update({ archived: true }));
  });

  it("viewers can't archive", async () => {
    await assertFails(as("viewer").doc(prodPath("media/m1")).update({ archived: true }));
  });

  it("other media fields and creation are server-only", async () => {
    await assertFails(as("owner").doc(prodPath("media/m1")).update({ version: 9 }));
    await assertFails(as("owner").doc(prodPath("media/m2")).set({ productionId: PROD, nodeId: "n1" }));
  });
});

describe("takes", () => {
  const take = (uid: string, extra: Record<string, unknown> = {}) => ({
    id: "t1", productionId: PROD, nodeId: "n1", mediaId: "m1", inSec: 0, outSec: 4.2, createdBy: uid, createdAt: 1, ...extra,
  });

  it("artists place, adjust and remove takes", async () => {
    const ref = as("artist").doc(prodPath("takes/t1"));
    await assertSucceeds(ref.set(take("artist")));
    await assertSucceeds(ref.update({ inSec: 1, outSec: 3 }));
    await assertSucceeds(ref.delete());
  });

  it("rejects empty or inverted cuts", async () => {
    await assertFails(as("artist").doc(prodPath("takes/t1")).set(take("artist", { inSec: 5, outSec: 2 })));
  });

  it("viewers can't place takes", async () => {
    await assertFails(as("viewer").doc(prodPath("takes/t1")).set(take("viewer")));
  });
});

describe("comments", () => {
  const comment = (uid: string, extra: Record<string, unknown> = {}) => ({
    id: "c2", productionId: PROD, nodeId: "n1", text: "Cortar antes", authorId: uid, resolved: false, createdAt: 2, ...extra,
  });

  it("viewers (clients) comment", async () => {
    await assertSucceeds(as("viewer").doc(prodPath("comments/c2")).set(comment("viewer")));
  });

  it("can't comment on behalf of someone else or pre-resolved", async () => {
    await assertFails(as("viewer").doc(prodPath("comments/c2")).set(comment("artist")));
    await assertFails(as("viewer").doc(prodPath("comments/c2")).set(comment("viewer", { resolved: true })));
  });

  it("the author edits the text; others can't", async () => {
    await assertSucceeds(as("viewer").doc(prodPath("comments/c1")).update({ text: "Bastante más luz" }));
    await assertFails(as("artist").doc(prodPath("comments/c1")).update({ text: "No" }));
  });

  it("artists+ and the author resolve", async () => {
    await assertSucceeds(as("artist").doc(prodPath("comments/c1")).update({ resolved: true }));
    await assertSucceeds(as("viewer").doc(prodPath("comments/c1")).update({ resolved: false }));
  });

  it("a viewer can't resolve someone else's comment", async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(prodPath("comments/c3")).set(comment("artist", { id: "c3" })));
    await assertFails(as("viewer").doc(prodPath("comments/c3")).update({ resolved: true }));
  });
});

describe("jobs", () => {
  const job = (uid: string, extra: Record<string, unknown> = {}) => ({
    id: "j1", productionId: PROD, nodeId: "n1", type: "generate", status: "requested", mediaId: "m9",
    input: { kind: "image", prompt: "Puerto al amanecer", model: "auto" }, createdBy: uid, createdAt: 1, ...extra,
  });

  it("artists request jobs", async () => {
    await assertSucceeds(as("artist").doc(prodPath("jobs/j1")).set(job("artist")));
  });

  it("viewers can't generate", async () => {
    await assertFails(as("viewer").doc(prodPath("jobs/j1")).set(job("viewer")));
  });

  it("jobs start as requested and are paid by the requester", async () => {
    await assertFails(as("artist").doc(prodPath("jobs/j1")).set(job("artist", { status: "queued" })));
    await assertFails(as("artist").doc(prodPath("jobs/j1")).set(job("supervisor")));
  });

  it("job state belongs to the server", async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(prodPath("jobs/j1")).set(job("artist")));
    await assertFails(as("artist").doc(prodPath("jobs/j1")).update({ status: "done" }));
  });
});

describe("members", () => {
  const member = (uid: string, role: string) => ({ uid, role });

  it("admins add and change members", async () => {
    await assertSucceeds(as("admin").doc(prodPath("members/new")).set(member("new", "artist")));
    await assertSucceeds(as("admin").doc(prodPath("members/artist")).update({ role: "supervisor" }));
  });

  it("only owners grant or revoke owner", async () => {
    await assertFails(as("admin").doc(prodPath("members/new")).set(member("new", "owner")));
    await assertFails(as("admin").doc(prodPath("members/owner")).delete());
    await assertSucceeds(as("owner").doc(prodPath("members/new")).set(member("new", "owner")));
  });

  it("non-admins can't manage members or promote themselves", async () => {
    await assertFails(as("supervisor").doc(prodPath("members/new")).set(member("new", "artist")));
    await assertFails(as("artist").doc(prodPath("members/artist")).update({ role: "admin" }));
  });

  it("rejects unknown roles and mismatched uids", async () => {
    await assertFails(as("admin").doc(prodPath("members/new")).set(member("new", "god")));
    await assertFails(as("admin").doc(prodPath("members/new")).set(member("other", "artist")));
  });

  it("workspace members edit their own profile but not their Magnific link", async () => {
    const ref = as("artist").doc(`workspaces/${WS}/members/artist`);
    await assertSucceeds(ref.update({ displayName: "Laura" }));
    await assertFails(ref.update({ magnificConnected: true }));
  });
});

describe("activity", () => {
  it("members append their own events", async () => {
    await assertSucceeds(as("viewer").doc(prodPath("activity/a2")).set({ id: "a2", productionId: PROD, kind: "comment", actorId: "viewer", text: "comentó", at: 2 }));
  });

  it("can't impersonate, edit or delete events", async () => {
    await assertFails(as("viewer").doc(prodPath("activity/a2")).set({ id: "a2", productionId: PROD, kind: "comment", actorId: "owner", text: "x", at: 2 }));
    await assertFails(as("owner").doc(prodPath("activity/a1")).update({ text: "y" }));
    await assertFails(as("owner").doc(prodPath("activity/a1")).delete());
  });
});
