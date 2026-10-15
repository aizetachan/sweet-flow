/** Admin SDK handles and guards shared by every Function. */

import { can, type Id, type Production, type Role } from "@sweetflow/domain";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { NodeDoc } from "./api";

initializeApp();

export const db = getFirestore();
export const rtdb = () => getDatabase();

export const prodRef = (prodId: Id) => db.collection("productions").doc(prodId);
export const nodesCol = (prodId: Id) => prodRef(prodId).collection("nodes");
export const nodeRef = (prodId: Id, nodeId: Id) => nodesCol(prodId).doc(nodeId) as DocumentReference<NodeDoc>;

export type Ability = keyof typeof can;

/**
 * Resolves the caller's role in the production and checks it allows
 * `ability` (same rules as the UI, from @sweetflow/domain). Returns the uid.
 */
export async function requireRole(req: CallableRequest, prodId: unknown, ability: Ability): Promise<Id> {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  if (typeof prodId !== "string" || !prodId) throw new HttpsError("invalid-argument", "productionId es obligatorio.");
  const member = await prodRef(prodId).collection("members").doc(uid).get();
  const role = member.get("role") as Role | undefined;
  if (!role || !can[ability](role)) throw new HttpsError("permission-denied", "Tu rol no permite esta operación.");
  return uid;
}

export async function loadProduction(prodId: Id): Promise<Production> {
  const snap = await prodRef(prodId).get();
  if (!snap.exists) throw new HttpsError("not-found", "La producción no existe.");
  return { ...(snap.data() as Omit<Production, "id">), id: snap.id };
}

export function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || !v) throw new HttpsError("invalid-argument", `${name} es obligatorio.`);
  return v;
}
