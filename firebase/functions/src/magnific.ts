/**
 * Per-user Magnific connection: OAuth 2.0 + PKCE (docs/ARCHITECTURE.md §6).
 *
 * Every member links their own account and each generation spends the
 * credits of whoever launches it. Tokens never reach the client: they are
 * stored encrypted server-side and refreshed by the worker.
 *
 * Phase 0: the flow's shape only. The real endpoints, client id/secret and
 * token storage come in phase 2.
 */

import { createHash, randomBytes } from "node:crypto";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { MagnificAuthStartResponse } from "./api";
import { db } from "./shared";

const AUTHORIZE_URL = defineString("MAGNIFIC_OAUTH_AUTHORIZE_URL", { default: "https://example.invalid/oauth/authorize" });
const CLIENT_ID = defineString("MAGNIFIC_OAUTH_CLIENT_ID", { default: "sweetflow-dev" });
const REDIRECT_URI = defineString("MAGNIFIC_OAUTH_REDIRECT_URI", { default: "http://127.0.0.1:5001/sweetflow-dev/europe-west1/magnificAuthCallback" });
const CLIENT_SECRET = defineSecret("MAGNIFIC_OAUTH_CLIENT_SECRET");

/** Server-only collection: no client rule matches it, so clients can't read it. */
const oauthStates = () => db.collection("_oauthStates");

const base64url = (b: Buffer) => b.toString("base64url");

/** Starts the flow for the caller: returns the URL to open in the browser. */
export const magnificAuthStart = onCall<void, Promise<MagnificAuthStartResponse>>(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");

  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  await oauthStates().doc(state).set({ uid, verifier, createdAt: Date.now() });

  const url = new URL(AUTHORIZE_URL.value());
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID.value(),
    redirect_uri: REDIRECT_URI.value(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    // TODO(fase 2): scopes required by the generation API.
  }).toString();
  return { authorizeUrl: url.toString() };
});

/** Redirect target registered with Magnific. */
export const magnificAuthCallback = onRequest({ secrets: [CLIENT_SECRET] }, async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!code || !state) {
    res.status(400).send("Solicitud no válida.");
    return;
  }
  const stateRef = oauthStates().doc(state);
  const saved = await stateRef.get();
  if (!saved.exists) {
    res.status(400).send("La conexión ha caducado. Vuelve a intentarlo desde Ajustes.");
    return;
  }
  await stateRef.delete();

  // TODO(fase 2, §6):
  //  1. Exchange `code` + saved verifier (+ CLIENT_SECRET) for access/refresh tokens.
  //  2. Encrypt and store them server-side (Secret Manager / KMS-wrapped doc)
  //     keyed by uid — never readable by clients.
  //  3. Set workspaces/*/members/{uid}.magnificConnected = true and fetch credits.
  //  4. Redirect to the app (sweetflow:// deep link) instead of a static page.
  res.status(501).send("La conexión con Magnific llegará en la fase 2.");
});
