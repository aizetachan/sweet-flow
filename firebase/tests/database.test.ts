import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createEnv, OUTSIDER, PROD } from "./setup";

let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).database();

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearDatabase();
  // Written by the onProductionMemberWritten Function in production.
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`access/${PROD}`).set({ artist: "artist", viewer: "viewer" }));
});
afterAll(() => env.cleanup());

describe("presence", () => {
  it("members write their own presence", async () => {
    await assertSucceeds(db("artist").ref(`presence/${PROD}/artist`).set({ at: Date.now(), nodeId: "n1" }));
    await assertSucceeds(db("artist").ref(`presence/${PROD}/artist`).remove());
  });

  it("nobody writes someone else's presence", async () => {
    await assertFails(db("viewer").ref(`presence/${PROD}/artist`).set({ at: Date.now() }));
  });

  it("outsiders can't announce themselves", async () => {
    await assertFails(db(OUTSIDER).ref(`presence/${PROD}/${OUTSIDER}`).set({ at: Date.now() }));
  });

  it("members read the production's presence; outsiders don't", async () => {
    await assertSucceeds(db("viewer").ref(`presence/${PROD}`).get());
    await assertFails(db(OUTSIDER).ref(`presence/${PROD}`).get());
  });

  it("rejects malformed entries", async () => {
    await assertFails(db("artist").ref(`presence/${PROD}/artist`).set({ nodeId: "n1" }));
    await assertFails(db("artist").ref(`presence/${PROD}/artist`).set({ at: Date.now(), extra: true }));
  });

  it("the access list is server-only", async () => {
    await assertFails(db(OUTSIDER).ref(`access/${PROD}/${OUTSIDER}`).set("owner"));
  });
});
