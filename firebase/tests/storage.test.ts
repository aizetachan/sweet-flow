import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createEnv, OUTSIDER, prodPath, seedFirestore } from "./setup";

let env: RulesTestEnvironment;
const storage = (uid: string) => env.authenticatedContext(uid).storage();
const bytes = new Uint8Array([1, 2, 3]);
const original = prodPath("media/m1/original.png");
/** UploadTask is thenable but not a Promise. */
const put = (uid: string, path: string) => Promise.resolve(storage(uid).ref(path).put(bytes));

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await seedFirestore(env);
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(original).put(bytes);
  });
});
afterAll(() => env.cleanup());

describe("storage", () => {
  it("members read production files", async () => {
    await assertSucceeds(storage("viewer").ref(original).getMetadata());
  });

  it("outsiders read nothing", async () => {
    await assertFails(storage(OUTSIDER).ref(original).getMetadata());
  });

  it("generated media is written by the server only", async () => {
    await assertFails(put("owner", prodPath("media/m2/original.png")));
  });

  it("artists upload into their own staging area", async () => {
    await assertSucceeds(put("artist", prodPath("uploads/artist/clip.mp4")));
    await assertFails(put("artist", prodPath("uploads/admin/clip.mp4")));
  });

  it("viewers can't upload", async () => {
    await assertFails(put("viewer", prodPath("uploads/viewer/clip.mp4")));
  });
});
