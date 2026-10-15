/**
 * Picks the DataSource implementation. The in-memory demo is the default so
 * the UI runs with zero configuration; VITE_DATA_SOURCE=firebase switches to
 * Firebase (see docs/DEVELOPMENT.md). The Firebase SDK is loaded lazily, so
 * the demo build doesn't ship it.
 */

import { MockSource } from "./mock/MockSource";
import type { DataSource, Snapshot } from "./source";

export function createSource(): DataSource {
  if (import.meta.env.VITE_DATA_SOURCE !== "firebase") return new MockSource();
  return deferred(() => import("./firebase/FirebaseSource").then((m) => new m.FirebaseSource()));
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
