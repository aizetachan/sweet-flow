import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_MAX,
  NAME_MAX,
  isHoneypotTripped,
  normalizeEmail,
  parseContact,
  parseWaitlist,
} from "./validate.js";

test("waitlist: trims, collapses spaces and lowercases the e-mail", () => {
  const r = parseWaitlist({ name: "  Ana   García ", email: " Ana@Example.COM " });
  assert.deepEqual(r, { ok: true, value: { name: "Ana García", email: "ana@example.com" } });
});

test("waitlist: rejects a missing name or a bad e-mail", () => {
  assert.deepEqual(parseWaitlist({ email: "a@b.co" }), { ok: false, error: "invalid_name" });
  assert.deepEqual(parseWaitlist({ name: "x".repeat(NAME_MAX + 1), email: "a@b.co" }), {
    ok: false,
    error: "invalid_name",
  });
  assert.deepEqual(parseWaitlist({ name: "Ana", email: "ana" }), { ok: false, error: "invalid_email" });
  assert.deepEqual(parseWaitlist({ name: "Ana", email: "ana@example" }), { ok: false, error: "invalid_email" });
  assert.deepEqual(parseWaitlist(null), { ok: false, error: "invalid_name" });
  assert.deepEqual(parseWaitlist("nope"), { ok: false, error: "invalid_name" });
});

test("contact: needs a message of a sensible length", () => {
  assert.deepEqual(parseContact({ name: "Ana", email: "a@b.co", message: "corto" }), {
    ok: false,
    error: "invalid_message",
  });
  assert.deepEqual(parseContact({ name: "Ana", email: "a@b.co", message: "x".repeat(MESSAGE_MAX + 1) }), {
    ok: false,
    error: "invalid_message",
  });
  const ok = parseContact({ name: "Ana", email: "a@b.co", message: "  Me interesa para una serie.  " });
  assert.deepEqual(ok, {
    ok: true,
    value: { name: "Ana", email: "a@b.co", message: "Me interesa para una serie." },
  });
});

test("e-mail normalisation never produces a Firestore-unsafe id", () => {
  assert.equal(normalizeEmail("a/b@example.com"), null);
  assert.equal(normalizeEmail("Ana+tag@Example.com"), "ana+tag@example.com");
});

test("honeypot: any text in `website` marks the submission as a bot", () => {
  assert.equal(isHoneypotTripped({ website: "http://spam" }), true);
  assert.equal(isHoneypotTripped({ website: "  " }), false);
  assert.equal(isHoneypotTripped({}), false);
  assert.equal(isHoneypotTripped(null), false);
});
