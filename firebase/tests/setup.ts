/**
 * Shared fixture for the rules suites: one production with a member of each
 * role, plus an outsider. Hosts/ports come from the FIREBASE_*_EMULATOR_HOST
 * variables that `firebase emulators:exec` sets.
 */

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

export const PROJECT_ID = "demo-sweetflow";
export const WS = "ws1";
export const PROD = "p1";
export const ROLES = ["owner", "admin", "supervisor", "artist", "viewer"] as const;
export type TestRole = (typeof ROLES)[number];
/** Signed in, but not a member of anything. */
export const OUTSIDER = "outsider";

export function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: read("firestore.rules") },
    database: { rules: read("database.rules.json") },
    storage: { rules: read("storage.rules") },
  });
}

export const prodPath = (sub = "") => `productions/${PROD}${sub ? `/${sub}` : ""}`;

export const STATUSES = [
  { id: "st_todo", name: "Pendiente", color: "#737373", category: "todo", order: 0 },
  { id: "st_review", name: "En revisión", color: "#6f8bf7", category: "review", order: 1 },
  { id: "st_done", name: "Aprobado", color: "#3cd39f", category: "done", order: 2 },
];

export const LEVELS = [
  { id: "lv_sq", name: "Secuencia", prefix: "SQ", step: 10, pad: 3, canGenerate: false, maxVideoSec: 30 },
  { id: "lv_sh", name: "Plano", prefix: "SH", step: 10, pad: 4, canGenerate: true, maxVideoSec: 15 },
];

export function node(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    productionId: PROD,
    parentId: null,
    levelId: "lv_sq",
    number: 10,
    title: "Apertura",
    notes: "",
    statusId: "st_todo",
    assigneeIds: [] as string[],
    assetIds: [] as string[],
    updatedAt: 1,
    updatedBy: "owner",
    ...extra,
  };
}

/** Seeds Firestore with rules disabled. */
export async function seedFirestore(env: RulesTestEnvironment): Promise<void> {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`workspaces/${WS}`).set({ id: WS, name: "Estudio", createdAt: 1 });
    await db.doc(prodPath()).set({ id: PROD, workspaceId: WS, name: "Mareas", levels: LEVELS, statuses: STATUSES, createdAt: 1, updatedAt: 1 });
    for (const role of ROLES) {
      await db.doc(`workspaces/${WS}/members/${role}`).set({ uid: role, role, email: `${role}@x.test`, displayName: role, magnificConnected: false });
      await db.doc(prodPath(`members/${role}`)).set({ uid: role, role });
    }
    await db.doc(prodPath("nodes/n1")).set(node("n1"));
    await db.doc(prodPath("nodes/n2")).set(node("n2", { number: 20, assigneeIds: ["artist"] }));
    await db.doc(prodPath("media/m1")).set({ id: "m1", productionId: PROD, nodeId: "n1", kind: "image", version: 1, origin: "generated", status: "ready", progress: 100, archived: false, createdBy: "artist", createdAt: 1 });
    await db.doc(prodPath("comments/c1")).set({ id: "c1", productionId: PROD, nodeId: "n1", text: "Más luz", authorId: "viewer", resolved: false, createdAt: 1 });
    await db.doc(prodPath("activity/a1")).set({ id: "a1", productionId: PROD, kind: "status", actorId: "owner", text: "x", at: 1 });
  });
}
