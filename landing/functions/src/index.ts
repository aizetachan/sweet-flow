// Sweet Flow landing — one HTTP function, `api`, behind the Hosting rewrite
// `/api/**` (firebase.json). Two routes:
//
//   POST /api/waitlist  { name, email }           → Firestore `waitlist/{email}`
//   POST /api/contact   { name, email, message }  → Firestore `contacts/{id}` + e-mail
//
// Both accept a hidden `website` field (honeypot): when a bot fills it the
// request is answered as if it succeeded but nothing is stored or sent.
//
// Responses are JSON: `{ ok: true, ... }` or `{ ok: false, error: <code> }`.

import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest, type Request, type Response } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { sendContactMail } from "./mail.js";
import { isHoneypotTripped, parseContact, parseWaitlist } from "./validate.js";

export const REGION = "europe-west1";
setGlobalOptions({ region: REGION, maxInstances: 5 });

initializeApp();
const db = getFirestore();

// Non-secret parameters live in `functions/.env` (see .env.example); the SMTP
// password is a Secret Manager secret (`firebase functions:secrets:set SMTP_PASS`).
const CONTACT_TO = defineString("CONTACT_TO");
const CONTACT_FROM = defineString("CONTACT_FROM");
const SMTP_HOST = defineString("SMTP_HOST", { default: "smtp.gmail.com" });
const SMTP_PORT = defineString("SMTP_PORT", { default: "465" });
const SMTP_USER = defineString("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

type Json = Record<string, unknown>;

function send(res: Response, status: number, body: Json): void {
  res.status(status).set("Cache-Control", "no-store").json(body);
}

function fail(res: Response, status: number, error: string): void {
  send(res, status, { ok: false, error });
}

/** The route without the `/api` prefix: Hosting passes the full path, the emulator does not. */
function routeOf(req: Request): string {
  return req.path.replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/";
}

async function handleWaitlist(req: Request, res: Response): Promise<void> {
  if (isHoneypotTripped(req.body)) {
    send(res, 200, { ok: true, already: false });
    return;
  }
  const parsed = parseWaitlist(req.body);
  if (!parsed.ok) {
    fail(res, 400, parsed.error);
    return;
  }
  const { name, email } = parsed.value;
  const ref = db.collection("waitlist").doc(email);
  const already = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      tx.update(ref, { name, updatedAt: FieldValue.serverTimestamp() });
      return true;
    }
    tx.set(ref, {
      name,
      email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "landing",
      userAgent: req.get("user-agent") ?? null,
    });
    return false;
  });
  logger.info("waitlist", { email, already });
  send(res, 200, { ok: true, already });
}

async function handleContact(req: Request, res: Response): Promise<void> {
  if (isHoneypotTripped(req.body)) {
    send(res, 200, { ok: true, delivered: true });
    return;
  }
  const parsed = parseContact(req.body);
  if (!parsed.ok) {
    fail(res, 400, parsed.error);
    return;
  }
  const input = parsed.value;
  // Stored first: if the e-mail fails the message is still in Firestore.
  const doc = await db.collection("contacts").add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    source: "landing",
    userAgent: req.get("user-agent") ?? null,
    delivered: false,
  });
  let delivered = false;
  try {
    await sendContactMail(
      {
        host: SMTP_HOST.value(),
        port: Number(SMTP_PORT.value()) || 465,
        user: SMTP_USER.value(),
        pass: SMTP_PASS.value(),
        from: CONTACT_FROM.value(),
        to: CONTACT_TO.value(),
      },
      input,
    );
    delivered = true;
    await doc.update({ delivered: true });
  } catch (err) {
    logger.error("contact mail failed", { id: doc.id, err: String(err) });
  }
  logger.info("contact", { id: doc.id, delivered });
  send(res, 200, { ok: true, delivered });
}

export const api = onRequest(
  { secrets: [SMTP_PASS], cors: false, timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      fail(res, 405, "method_not_allowed");
      return;
    }
    if (!req.is("application/json")) {
      fail(res, 415, "unsupported_media_type");
      return;
    }
    try {
      switch (routeOf(req)) {
        case "/waitlist":
          await handleWaitlist(req, res);
          return;
        case "/contact":
          await handleContact(req, res);
          return;
        default:
          fail(res, 404, "not_found");
      }
    } catch (err) {
      logger.error("api error", { path: req.path, err: String(err) });
      fail(res, 500, "internal");
    }
  },
);
