import { ApiRequestError, errorMessage, joinWaitlist, sendContact } from "./api";
import { setState } from "./modals";

type Submit = (fields: Record<string, string>) => Promise<string | null>;

// Each form's submit: returns the success text to show (or null to keep the
// default one), and throws ApiRequestError on failure.
const SUBMITS: Record<string, Submit> = {
  waitlist: async (f) => {
    const r = await joinWaitlist({ name: f["name"] ?? "", email: f["email"] ?? "", website: f["website"] ?? "" });
    return r.already ? "Ya estabas apuntado. Te escribiremos en cuanto esté disponible." : null;
  },
  contact: async (f) => {
    await sendContact({
      name: f["name"] ?? "",
      email: f["email"] ?? "",
      message: f["message"] ?? "",
      website: f["website"] ?? "",
    });
    return null;
  },
};

function fieldsOf(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new FormData(form)) if (typeof v === "string") out[k] = v;
  return out;
}

// Same rule as functions/src/validate.ts: the browser's own `type=email`
// check accepts "ana@mal", the server would not.
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

function isInvalid(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el.name === "website") return false;
  if (!el.checkValidity()) return true;
  return el.name === "email" && !EMAIL_RE.test(el.value.trim());
}

/** Browser-side check before the request; mirrors the server's rules. */
function localError(form: HTMLFormElement): string | null {
  const first = Array.from(form.elements).find(
    (el): el is HTMLInputElement | HTMLTextAreaElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && isInvalid(el),
  );
  if (!first) return null;
  if (first.name === "email") return errorMessage("invalid_email");
  if (first.name === "message") return errorMessage("invalid_message");
  return errorMessage("invalid_name");
}

export function initForms(root: ParentNode = document): void {
  for (const form of root.querySelectorAll<HTMLFormElement>("form[data-form]")) {
    const kind = form.dataset["form"] ?? "";
    const submit = SUBMITS[kind];
    if (!submit) continue;
    const dialog = form.closest("dialog");
    const errorEl = form.querySelector<HTMLElement>("[data-error]");
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (errorEl) errorEl.textContent = "";
      const invalid = localError(form);
      if (invalid) {
        if (errorEl) errorEl.textContent = invalid;
        return;
      }
      form.classList.add("is-sending");
      if (button) button.disabled = true;
      try {
        const successText = await submit(fieldsOf(form));
        if (dialog instanceof HTMLDialogElement) {
          const textEl = dialog.querySelector<HTMLElement>("[data-state='success'] [data-success-text]");
          if (textEl && successText) textEl.textContent = successText;
          setState(dialog, "success");
          dialog.querySelector<HTMLElement>("[data-state='success'] [data-close]")?.focus();
        }
        form.reset();
      } catch (err) {
        const code = err instanceof ApiRequestError ? err.code : "unknown";
        if (errorEl) errorEl.textContent = errorMessage(code);
      } finally {
        form.classList.remove("is-sending");
        if (button) button.disabled = false;
      }
    });
  }
}
