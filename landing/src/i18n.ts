// Runtime side of the two-language setup. The page itself is generated per
// language (scripts/build-pages.mjs); this module covers what JavaScript
// produces at runtime (form messages) and the ES/EN switch.

export type Lang = "es" | "en";

export function currentLang(): Lang {
  return document.documentElement.lang === "es" ? "es" : "en";
}

const MESSAGES: Record<Lang, Record<string, string>> = {
  es: {
    invalid_name: "Escribe tu nombre.",
    invalid_email: "Revisa el correo: no parece válido.",
    invalid_message: "El mensaje debe tener entre 10 y 4000 caracteres.",
    network: "No hay conexión. Inténtalo de nuevo.",
    not_configured: "El formulario aún no está conectado. Vuelve a intentarlo más tarde.",
    unknown: "No se ha podido enviar. Inténtalo de nuevo en un momento.",
    already: "Ya estabas apuntado. Te escribiremos en cuanto esté disponible.",
  },
  en: {
    invalid_name: "Please enter your name.",
    invalid_email: "Check the email: it doesn't look valid.",
    invalid_message: "The message must be between 10 and 4000 characters.",
    network: "No connection. Please try again.",
    not_configured: "The form isn't connected yet. Please try again later.",
    unknown: "Couldn't send. Please try again in a moment.",
    already: "You were already on the list. We'll write to you as soon as it's available.",
  },
};

export function t(key: string): string {
  const m = MESSAGES[currentLang()];
  const k = key === "unavailable" ? "network" : key;
  return m[k] ?? m["unknown"] ?? key;
}

/**
 * ES/EN switch. In production Firebase Hosting chooses the language from the
 * `firebase-language-override` cookie (then Accept-Language), so we set the
 * cookie and go to the root. In development there is no Hosting: go to the
 * page's path directly.
 */
export function initLangSwitch(root: ParentNode = document): void {
  for (const btn of root.querySelectorAll<HTMLElement>("[data-lang-switch]")) {
    btn.addEventListener("click", () => {
      const lang = btn.dataset["langSwitch"] === "es" ? "es" : "en";
      const path = lang === "es" ? "/localized/es/" : "/";
      if (import.meta.env.DEV) {
        window.location.assign(path);
        return;
      }
      document.cookie = `firebase-language-override=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      // The cookie decides, but the explicit path works too and avoids any
      // cached copy of the other language.
      window.location.assign(path);
    });
  }
}
