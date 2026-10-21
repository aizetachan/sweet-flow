import { ApiRequestError, joinWaitlist, sendContact } from "./api.ts";
import { t } from "./i18n.ts";
import { setState } from "./modals.ts";

type Submit = (fields: Record<string, string>) => Promise<string | null>;

// Each form's submit: returns the success text to show (or null to keep the
// default one), and throws ApiRequestError on failure. Validation happens
// inside joinWaitlist / sendContact (src/validate.ts).
const SUBMITS: Record<string, Submit> = {
  waitlist: async (f) => {
    const r = await joinWaitlist(f);
    return r.already ? t("already") : null;
  },
  contact: async (f) => {
    await sendContact(f);
    return null;
  },
};

function fieldsOf(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new FormData(form)) if (typeof v === "string") out[k] = v;
  return out;
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
        if (errorEl) errorEl.textContent = t(code);
      } finally {
        form.classList.remove("is-sending");
        if (button) button.disabled = false;
      }
    });
  }
}
