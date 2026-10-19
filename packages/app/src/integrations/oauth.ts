/**
 * Signing in to the services that hold the team folder (Dropbox, Google
 * Drive; docs/ARCHITECTURE.md §2.2): OAuth 2.0 with PKCE in a popup, which
 * comes back to `/auth/<provider>` on this address and hands the code to the
 * window that opened it. Each person signs in with their own account; the
 * session stays in this browser (the desktop app will keep it encrypted).
 *
 * The app's id at each service comes from the build (VITE_DROPBOX_APP_KEY,
 * VITE_GOOGLE_CLIENT_ID; docs/DEVELOPMENT.md). Google also wants the app's
 * secret to hand out tokens: the dev server adds it (`/google/token`), so it
 * never reaches the page.
 */

export type CloudProvider = "dropbox" | "google";

interface ProviderConfig {
  name: string;
  clientId: string | undefined;
  authorize: string;
  token: string;
  scope?: string;
  /** Extra parameters of the sign-in page. */
  extra: Record<string, string>;
}

const CONFIG: Record<CloudProvider, ProviderConfig> = {
  dropbox: {
    name: "Dropbox",
    clientId: import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined,
    authorize: "https://www.dropbox.com/oauth2/authorize",
    token: "https://api.dropboxapi.com/oauth2/token",
    // A refresh token, so the connection lasts.
    extra: { token_access_type: "offline" },
  },
  google: {
    name: "Google Drive",
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "/google/token",
    // The whole Drive: the team folder already exists and is shared (§2.2).
    scope: "https://www.googleapis.com/auth/drive openid email profile",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
};

/** Whether this build knows the app's id at the service. */
export const cloudConfigured = (p: CloudProvider) => !!CONFIG[p].clientId;
export const cloudName = (p: CloudProvider) => CONFIG[p].name;

interface Session {
  accessToken: string;
  refreshToken?: string;
  /** Millis. */
  expiresAt: number;
}

const sessionKey = (p: CloudProvider) => `sweetflow:${p}:session`;
const pendingKey = (p: CloudProvider) => `sweetflow:${p}:pending`;
const redirectUri = (p: CloudProvider) => `${location.origin}/auth/${p}`;

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export const isCloudConnected = (p: CloudProvider) => !!read<Session>(sessionKey(p));

export function disconnectCloud(p: CloudProvider): void {
  localStorage.removeItem(sessionKey(p));
  notify();
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Opens the service's sign-in in a popup and resolves once connected. Call from a click. */
export async function connectCloud(p: CloudProvider): Promise<void> {
  const c = CONFIG[p];
  if (!c.clientId) throw new Error(`Falta configurar la app de ${c.name} en esta instalación.`);
  // Open first, inside the click, or the browser blocks it.
  const popup = window.open("about:blank", `sf-${p}-login`, "popup,width=560,height=720");
  if (!popup) throw new Error("El navegador ha bloqueado la ventana de inicio de sesión.");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(pendingKey(p), JSON.stringify({ verifier, state }));
  const url = new URL(c.authorize);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: redirectUri(p),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    ...(c.scope ? { scope: c.scope } : {}),
    ...c.extra,
  }).toString();
  popup.location.href = url.toString();

  await new Promise<void>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ type?: string; code?: string; state?: string; error?: string }>) => {
      if (e.origin !== location.origin || e.data?.type !== `sf-${p}-callback`) return;
      cleanup();
      if (e.data.error || !e.data.code) return reject(new Error(e.data.error || "No se ha completado el inicio de sesión."));
      exchange(p, e.data.code, e.data.state ?? "").then(resolve, reject);
    };
    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Se ha cerrado la ventana antes de terminar."));
      }
    }, 600);
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
    window.addEventListener("message", onMessage);
  });
}

async function exchange(p: CloudProvider, code: string, state: string): Promise<void> {
  const pending = read<{ verifier: string; state: string }>(pendingKey(p));
  localStorage.removeItem(pendingKey(p));
  if (!pending || pending.state !== state) throw new Error(`La respuesta de ${CONFIG[p].name} no corresponde a este inicio de sesión.`);
  await token(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p), code_verifier: pending.verifier });
}

async function token(p: CloudProvider, params: Record<string, string>): Promise<Session> {
  const c = CONFIG[p];
  const r = await fetch(c.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: c.clientId ?? "" }),
  });
  if (!r.ok) throw new Error(`${c.name} no ha dado acceso (${r.status}).`);
  const t = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  const old = read<Session>(sessionKey(p));
  const s: Session = {
    accessToken: t.access_token,
    // A refresh does not always bring a new refresh token: keep the one we had.
    refreshToken: t.refresh_token ?? old?.refreshToken,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
  };
  localStorage.setItem(sessionKey(p), JSON.stringify(s));
  notify();
  return s;
}

const refreshing = new Map<CloudProvider, Promise<Session>>();

/** A valid access token, refreshed when about to expire. Throws CloudNotConnected otherwise. */
export async function cloudToken(p: CloudProvider, force = false): Promise<string> {
  const s = read<Session>(sessionKey(p));
  if (!s) throw new CloudNotConnected(p);
  if (!force && s.expiresAt - Date.now() > 60_000) return s.accessToken;
  if (!s.refreshToken) {
    disconnectCloud(p);
    throw new CloudNotConnected(p);
  }
  let run = refreshing.get(p);
  if (!run) {
    run = token(p, { grant_type: "refresh_token", refresh_token: s.refreshToken }).finally(() => refreshing.delete(p));
    refreshing.set(p, run);
  }
  try {
    return (await run).accessToken;
  } catch {
    disconnectCloud(p);
    throw new CloudNotConnected(p);
  }
}

export class CloudNotConnected extends Error {
  constructor(p: CloudProvider) {
    super(`Vuelve a conectar ${CONFIG[p].name} en Ajustes › Almacenamiento.`);
  }
}

/**
 * In the popup: the service came back here with a code. Hand it to the window
 * that opened the sign-in and close. Returns true when this page is a callback.
 */
export function handleCloudCallback(): boolean {
  const m = /^\/auth\/(dropbox|google)$/.exec(location.pathname);
  if (!m) return false;
  const q = new URLSearchParams(location.search);
  window.opener?.postMessage({ type: `sf-${m[1]}-callback`, code: q.get("code"), state: q.get("state"), error: q.get("error_description") ?? q.get("error") }, location.origin);
  window.close();
  return true;
}

// ---------- change notifications (Settings) ----------

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}
export function onCloudChange(cb: () => void): () => void {
  listeners.add(cb);
  const h = (e: StorageEvent) => e.key?.endsWith(":session") && cb();
  window.addEventListener("storage", h);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", h);
  };
}
