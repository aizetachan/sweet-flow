// The landing talks to one HTTP endpoint, `/api/*`, served by the Cloud
// Function `api` through the Hosting rewrite (in dev, through the Vite proxy).

export type ApiError = { ok: false; error: string };
export type WaitlistResult = { ok: true; already: boolean };
export type ContactResult = { ok: true; delivered: boolean };

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

async function post<T extends { ok: true }>(path: string, body: Record<string, string>): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError("network", 0);
  }
  let data: T | ApiError;
  try {
    data = (await res.json()) as T | ApiError;
  } catch {
    throw new ApiRequestError("bad_response", res.status);
  }
  if (!res.ok || !data.ok) {
    throw new ApiRequestError(data.ok ? "http_" + res.status : data.error, res.status);
  }
  return data;
}

export function joinWaitlist(input: { name: string; email: string; website: string }): Promise<WaitlistResult> {
  return post<WaitlistResult>("waitlist", input);
}

export function sendContact(input: {
  name: string;
  email: string;
  message: string;
  website: string;
}): Promise<ContactResult> {
  return post<ContactResult>("contact", input);
}

/** Spanish message for an error code returned by the API (or by `post`). */
export function errorMessage(code: string): string {
  switch (code) {
    case "invalid_name":
      return "Escribe tu nombre.";
    case "invalid_email":
      return "Revisa el correo: no parece válido.";
    case "invalid_message":
      return "El mensaje debe tener entre 10 y 4000 caracteres.";
    case "network":
      return "No hay conexión. Inténtalo de nuevo.";
    default:
      return "No se ha podido enviar. Inténtalo de nuevo en un momento.";
  }
}
