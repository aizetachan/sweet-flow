// Pure validation of the two forms. No Firebase here, so it is unit-tested
// with node:test (see validate.test.ts).

export const NAME_MAX = 120;
export const EMAIL_MAX = 254;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 4000;

// Pragmatic e-mail check: one "@", no spaces, a dot in the domain. No "/"
// either: the e-mail is the Firestore document id of the waitlist entry.
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export type WaitlistInput = { name: string; email: string };
export type ContactInput = { name: string; email: string; message: string };

export type ErrorCode = "invalid_name" | "invalid_email" | "invalid_message";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseName(v: unknown): string | null {
  const s = str(v).replace(/\s+/g, " ");
  if (s.length === 0 || s.length > NAME_MAX) return null;
  return s;
}

export function normalizeEmail(v: unknown): string | null {
  const s = str(v).toLowerCase();
  if (s.length === 0 || s.length > EMAIL_MAX || !EMAIL_RE.test(s)) return null;
  return s;
}

function parseMessage(v: unknown): string | null {
  const s = str(v);
  if (s.length < MESSAGE_MIN || s.length > MESSAGE_MAX) return null;
  return s;
}

/** True when the honeypot field was filled: a bot, not a person. */
export function isHoneypotTripped(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const v = (body as Record<string, unknown>)["website"];
  return typeof v === "string" && v.trim().length > 0;
}

export function parseWaitlist(body: unknown): Parsed<WaitlistInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = parseName(b["name"]);
  if (!name) return { ok: false, error: "invalid_name" };
  const email = normalizeEmail(b["email"]);
  if (!email) return { ok: false, error: "invalid_email" };
  return { ok: true, value: { name, email } };
}

export function parseContact(body: unknown): Parsed<ContactInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = parseName(b["name"]);
  if (!name) return { ok: false, error: "invalid_name" };
  const email = normalizeEmail(b["email"]);
  if (!email) return { ok: false, error: "invalid_email" };
  const message = parseMessage(b["message"]);
  if (!message) return { ok: false, error: "invalid_message" };
  return { ok: true, value: { name, email, message } };
}
