/**
 * Libraries shared with the production open (docs/INTERFAZ.md §2.8.1): from
 * every production that shares its library with the whole team, or with a
 * dashboard folder this production is in. Each one is read from its own
 * production (read-only, always up to date); nothing is copied.
 */

import { useSyncExternalStore } from "react";
import type { Id, LibraryShare, Media, ProdNode } from "@sweetflow/domain";
import type { DataSource, Snapshot } from "../data/source";
import type { LibraryState } from "../data/library";
import { entryWithin } from "../data/folder/folderEntries";
import { useStore } from "../state/store";

export interface SharedLibrary {
  productionId: Id;
  name: string;
  share: LibraryShare;
  /** Its groups (not trashed) and their images, with URLs to show them. */
  groups: ProdNode[];
  media: Media[];
}

/** The productions whose library reaches `productionId`. */
export function sharingWith(lib: LibraryState, productionId: Id): Array<{ id: Id; name: string; share: LibraryShare }> {
  return lib.entries.flatMap((e) => {
    if (e.kind !== "production" || e.id === productionId || e.trashedAt) return [];
    const share = lib.summaries[e.id]?.libraryShare;
    if (!share) return [];
    if (share.scope === "folder" && !entryWithin(lib.entries, productionId, share.folderId)) return [];
    return [{ id: e.id, name: e.name, share }];
  });
}

// One set of readers for the production open; replaced when it changes.
let forProduction: Id | null = null;
const readers = new Map<Id, { src: DataSource; off: () => void; snap: Snapshot | null; name: string; share: LibraryShare }>();
let list: SharedLibrary[] = [];
const listeners = new Set<() => void>();

function rebuild(): void {
  list = [...readers.entries()].flatMap(([id, r]) => {
    if (!r.snap) return [];
    const groups = r.snap.library.filter((n) => n.lib?.kind === "card" && !n.trashedAt);
    const ids = new Set(groups.map((g) => g.id));
    return [{ productionId: id, name: r.name, share: r.share, groups, media: r.snap.media.filter((m) => ids.has(m.nodeId) && !m.archived) }];
  });
  for (const l of listeners) l();
}

/** Opens and closes readers so they match what is shared with the production open. */
function sync(): void {
  const { lib, library, productionId } = useStore.getState();
  if (productionId !== forProduction) {
    for (const r of readers.values()) (r.off(), r.src.dispose?.());
    readers.clear();
    forProduction = productionId;
  }
  const want = lib && productionId && library.openReadOnly ? sharingWith(lib, productionId) : [];
  const keep = new Set(want.map((w) => w.id));
  for (const [id, r] of readers) if (!keep.has(id)) (r.off(), r.src.dispose?.(), readers.delete(id));
  for (const w of want) {
    const cur = readers.get(w.id);
    if (cur) {
      cur.name = w.name;
      cur.share = w.share;
      continue;
    }
    const src = library.openReadOnly!(w.id);
    const entry: { src: DataSource; off: () => void; snap: Snapshot | null; name: string; share: LibraryShare } = { src, off: () => undefined, snap: null, name: w.name, share: w.share };
    readers.set(w.id, entry);
    entry.off = src.subscribe((s) => {
      entry.snap = s;
      rebuild();
    });
  }
  rebuild();
}

let watching = false;
function watch(): void {
  if (watching) return;
  watching = true;
  let last = "";
  useStore.subscribe((s) => {
    // Only when what is shared (or the production open) changes.
    const key = `${s.productionId}|${s.lib && s.productionId ? sharingWith(s.lib, s.productionId).map((w) => `${w.id}:${JSON.stringify(w.share)}:${w.name}`).join(",") : ""}`;
    if (key === last) return;
    last = key;
    sync();
  });
  sync();
}

/** The libraries shared with the production open, kept up to date. */
export function useSharedLibraries(): SharedLibrary[] {
  watch();
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, () => list);
}

/** A shared library's image, found by id (for drops and picks). */
export function sharedMedia(id: Id): { media: Media; library: SharedLibrary } | null {
  for (const l of list) {
    const media = l.media.find((m) => m.id === id);
    if (media) return { media, library: l };
  }
  return null;
}

/** A shared library's group, found by id. */
export function sharedGroup(id: Id): ProdNode | null {
  for (const l of list) {
    const g = l.groups.find((x) => x.id === id);
    if (g) return g;
  }
  return null;
}
