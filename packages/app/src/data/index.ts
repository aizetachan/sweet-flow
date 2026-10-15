/**
 * Picks the DataSource implementation (see docs/DEVELOPMENT.md):
 * - default: in-memory demo, so the UI runs with zero configuration;
 * - VITE_DATA_SOURCE=local, or `vite --mode local` (`pnpm dev:local`): event
 *   log in the browser's localStorage (each tab acts as a device);
 * - VITE_DATA_SOURCE=firebase: Firebase. Its SDK is loaded lazily, so the
 *   other builds don't ship it.
 */

import { defaultLevels, defaultStatuses, type Member } from "@sweetflow/domain";
import { LocalSource } from "./local/LocalSource";
import { BrowserLogStore } from "./local/store";
import { MockSource } from "./mock/MockSource";
import type { DataSource, Snapshot } from "./source";

export function createSource(): DataSource {
  const kind = import.meta.env.VITE_DATA_SOURCE || (import.meta.env.MODE === "local" ? "local" : "");
  switch (kind) {
    case "firebase":
      return deferred(() => import("./firebase/FirebaseSource").then((m) => new m.FirebaseSource()));
    case "local":
      return browserLocalSource();
    default:
      return new MockSource();
  }
}

/** LocalSource on localStorage: one user per browser, one device per tab. */
function browserLocalSource(): DataSource {
  const remembered = (storage: Storage, key: string) => {
    let v = storage.getItem(key);
    if (!v) storage.setItem(key, (v = crypto.randomUUID().slice(0, 8)));
    return v;
  };
  const uid = `u_${remembered(localStorage, "sweetflow:uid")}`;
  const deviceId = `tab-${remembered(sessionStorage, "sweetflow:device")}`;
  const me: Member = { uid, email: "", displayName: `Usuario ${uid.slice(2, 6)}`, role: "owner", magnificConnected: false };
  const newId = (p: string) => `${p}_${crypto.randomUUID()}`;
  const src = new LocalSource({
    store: new BrowserLogStore("prueba"),
    deviceId,
    me,
    create: { id: newId("p"), name: "Producción de prueba", levels: defaultLevels(newId), statuses: defaultStatuses(newId) },
  });
  src.ready.catch((err) => console.error("[data] no se pudo abrir la producción local", err));
  return src;
}

/**
 * A DataSource usable before its implementation has loaded. Subscriptions
 * attach as soon as it is ready; intents need it loaded, which is always the
 * case in practice because the UI only acts after the first Snapshot.
 */
function deferred(load: () => Promise<DataSource>): DataSource {
  let inner: DataSource | null = null;
  const subs = new Map<(s: Snapshot) => void, () => void>();

  load()
    .then((src) => {
      inner = src;
      for (const cb of subs.keys()) subs.set(cb, src.subscribe(cb));
    })
    .catch((err) => console.error("[data] no se pudo cargar la fuente de datos", err));

  const subscribe = (cb: (s: Snapshot) => void) => {
    subs.set(cb, inner ? inner.subscribe(cb) : () => undefined);
    return () => {
      subs.get(cb)?.();
      subs.delete(cb);
    };
  };

  return new Proxy({ subscribe } as DataSource, {
    get(target, prop: keyof DataSource) {
      if (prop === "subscribe") return target.subscribe;
      return (...args: unknown[]) => {
        if (!inner) throw new Error("La fuente de datos aún se está cargando.");
        return (inner[prop] as (...a: unknown[]) => unknown).apply(inner, args);
      };
    },
  });
}
