/**
 * Each person connects their own Magnific account (docs/ARCHITECTURE.md §6,
 * decision 1): OAuth 2.0 with PKCE against Magnific's sign-in, the same one
 * its MCP server uses. No secret: Sweet Flow registers itself as a public
 * client the first time (dynamic client registration).
 *
 * The session stays in this browser (localStorage). The desktop app will keep
 * it encrypted (safeStorage) instead.
 */

const ISSUER = "https://auth.magnific.com/realms/mcp";
const AUTHORIZE = `${ISSUER}/protocol/openid-connect/auth`;
const TOKEN = `${ISSUER}/protocol/openid-connect/token`;
const REGISTER = `${ISSUER}/clients-registrations/openid-connect`;
const SCOPE = "openid profile email mcp:custom-audience";
export const CALLBACK_PATH = "/auth/magnific";

const KEY_CLIENT = "sweetflow:magnific:client";
const KEY_SESSION = "sweetflow:magnific:session";
const KEY_PENDING = "sweetflow:magnific:pending";

interface Session {
  accessToken: string;
  refreshToken?: string;
  /** Millis. */
  expiresAt: number;
}

const redirectUri = () => `${location.origin}${CALLBACK_PATH}`;

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export const isConnected = () => !!read<Session>(KEY_SESSION);

export function disconnect(): void {
  localStorage.removeItem(KEY_SESSION);
  notify();
}

/** Same client id for this browser and address; registered once. */
async function clientId(): Promise<string> {
  const known = read<{ id: string; redirect: string }>(KEY_CLIENT);
  if (known && known.redirect === redirectUri()) return known.id;
  const r = await fetch(REGISTER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Sweet Flow",
      redirect_uris: [redirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!r.ok) throw new Error(`Magnific no ha aceptado registrar Sweet Flow (${r.status}).`);
  const id = ((await r.json()) as { client_id: string }).client_id;
  localStorage.setItem(KEY_CLIENT, JSON.stringify({ id, redirect: redirectUri() }));
  return id;
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Opens Magnific's sign-in in a popup and resolves once connected. Call from
 * a click (popups need one). The popup comes back to CALLBACK_PATH, which
 * hands the code to this window (see `handleCallback`).
 */
export async function connect(): Promise<void> {
  // Open first, inside the click, or the browser blocks it.
  const popup = window.open("about:blank", "sf-magnific-login", "popup,width=520,height=720");
  if (!popup) throw new Error("El navegador ha bloqueado la ventana de inicio de sesión.");
  try {
    const id = await clientId();
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(KEY_PENDING, JSON.stringify({ verifier, state, id }));
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({
      client_id: id,
      response_type: "code",
      redirect_uri: redirectUri(),
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString();
    popup.location.href = url.toString();
  } catch (err) {
    popup.close();
    throw err;
  }

  await new Promise<void>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ type?: string; code?: string; state?: string; error?: string }>) => {
      if (e.origin !== location.origin || e.data?.type !== "sf-magnific-callback") return;
      cleanup();
      if (e.data.error || !e.data.code) return reject(new Error(e.data.error || "No se ha completado el inicio de sesión."));
      exchange(e.data.code, e.data.state ?? "").then(resolve, reject);
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

async function exchange(code: string, state: string): Promise<void> {
  const pending = read<{ verifier: string; state: string; id: string }>(KEY_PENDING);
  localStorage.removeItem(KEY_PENDING);
  if (!pending || pending.state !== state) throw new Error("La respuesta de Magnific no corresponde a este inicio de sesión.");
  await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: pending.id, code_verifier: pending.verifier });
}

async function token(params: Record<string, string>): Promise<Session> {
  const r = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  if (!r.ok) throw new Error(`Magnific no ha dado acceso (${r.status}).`);
  const t = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const s: Session = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
  localStorage.setItem(KEY_SESSION, JSON.stringify(s));
  notify();
  return s;
}

let refreshing: Promise<Session> | null = null;

/** A valid access token, refreshed when about to expire. Throws when not connected. */
export async function accessToken(): Promise<string> {
  const s = read<Session>(KEY_SESSION);
  if (!s) throw new NotConnected();
  if (s.expiresAt - Date.now() > 60_000) return s.accessToken;
  const client = read<{ id: string }>(KEY_CLIENT);
  if (!s.refreshToken || !client) {
    disconnect();
    throw new NotConnected();
  }
  refreshing ??= token({ grant_type: "refresh_token", refresh_token: s.refreshToken, client_id: client.id }).finally(() => (refreshing = null));
  try {
    return (await refreshing).accessToken;
  } catch {
    disconnect();
    throw new NotConnected();
  }
}

export class NotConnected extends Error {
  constructor() {
    super("Conecta tu cuenta de Magnific en Ajustes › Integraciones.");
  }
}

/**
 * In the popup: Magnific came back here with a code. Hand it to the window
 * that opened the sign-in and close. Returns true when this page is the callback.
 */
export function handleCallback(): boolean {
  if (location.pathname !== CALLBACK_PATH) return false;
  const q = new URLSearchParams(location.search);
  window.opener?.postMessage({ type: "sf-magnific-callback", code: q.get("code"), state: q.get("state"), error: q.get("error_description") ?? q.get("error") }, location.origin);
  window.close();
  return true;
}

// ---------- change notifications (Settings, the generate box) ----------

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}
export function onConnectionChange(cb: () => void): () => void {
  listeners.add(cb);
  const h = (e: StorageEvent) => e.key === KEY_SESSION && cb();
  window.addEventListener("storage", h);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", h);
  };
}
