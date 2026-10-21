// The two forms write straight into Firestore (no server): `waitlist/{email}`
// and `contacts/{id}`. firestore.rules only allows creating documents with
// exactly these fields, so the browser cannot read, edit or delete anything.
import { FirebaseError } from "firebase/app";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { firestore } from "./firebase.ts";
import { isHoneypotTripped, parseContact, parseWaitlist } from "./validate.ts";

export type WaitlistResult = { ok: true; already: boolean };
export type ContactResult = { ok: true };

export class ApiRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function dbOrThrow() {
  const db = firestore();
  if (!db) throw new ApiRequestError("not_configured");
  return db;
}

function codeOf(err: unknown): string {
  if (err instanceof ApiRequestError) return err.code;
  if (err instanceof FirebaseError) return err.code.replace(/^firestore\//, "");
  if (err instanceof TypeError) return "network";
  return "unknown";
}

export async function joinWaitlist(fields: Record<string, string>): Promise<WaitlistResult> {
  if (isHoneypotTripped(fields)) return { ok: true, already: false };
  const parsed = parseWaitlist(fields);
  if (!parsed.ok) throw new ApiRequestError(parsed.error);
  const { name, email } = parsed.value;
  try {
    await setDoc(doc(dbOrThrow(), "waitlist", email), {
      name,
      email,
      createdAt: serverTimestamp(),
      source: "landing",
    });
    return { ok: true, already: false };
  } catch (err) {
    // Only `create` is allowed: writing over an existing entry is denied,
    // which is how we learn the e-mail was already on the list.
    if (codeOf(err) === "permission-denied") return { ok: true, already: true };
    throw new ApiRequestError(codeOf(err));
  }
}

export async function sendContact(fields: Record<string, string>): Promise<ContactResult> {
  if (isHoneypotTripped(fields)) return { ok: true };
  const parsed = parseContact(fields);
  if (!parsed.ok) throw new ApiRequestError(parsed.error);
  try {
    await addDoc(collection(dbOrThrow(), "contacts"), {
      ...parsed.value,
      createdAt: serverTimestamp(),
      source: "landing",
    });
    return { ok: true };
  } catch (err) {
    throw new ApiRequestError(codeOf(err));
  }
}

/** Spanish message for an error code. */
export function errorMessage(code: string): string {
  switch (code) {
    case "invalid_name":
      return "Escribe tu nombre.";
    case "invalid_email":
      return "Revisa el correo: no parece válido.";
    case "invalid_message":
      return "El mensaje debe tener entre 10 y 4000 caracteres.";
    case "network":
    case "unavailable":
      return "No hay conexión. Inténtalo de nuevo.";
    case "not_configured":
      return "El formulario aún no está conectado. Vuelve a intentarlo más tarde.";
    default:
      return "No se ha podido enviar. Inténtalo de nuevo en un momento.";
  }
}
