/**
 * «Mostrar en la carpeta» (docs/INTERFAZ.md §1, §2): opens a production's or
 * a folder's folder in Finder / Explorer.
 *
 * - Desktop app: the shell reveals it. The team folder is reached through the
 *   browser's folder access, which never tells its full path, so the first
 *   time the user locates it once with the native picker; it is remembered on
 *   this computer.
 * - Browser: it cannot open Finder. The path is copied instead.
 * - Browser storage: there is no folder on disk to show.
 */

import { useStore } from "../state/store";

const KEY = (label: string) => `sweetflow:teamFolderPath:${label}`;

function rememberedRoot(label: string): string | null {
  try {
    return localStorage.getItem(KEY(label));
  } catch {
    return null;
  }
}

function remember(label: string, path: string): void {
  try {
    localStorage.setItem(KEY(label), path);
  } catch {
    // Only a convenience: it will be asked again.
  }
}

/**
 * The team folder's full path on this computer (desktop app), asking the user
 * to locate it once if it is not known yet; calls `use` with it.
 */
export function withTeamRoot(use: (root: string) => void): void {
  const { lib, notify, set } = useStore.getState();
  const desktop = window.sweetflow;
  if (!desktop || lib?.storage.kind !== "folder") return;
  const label = lib.storage.name;
  const root = rememberedRoot(label);
  if (root) return use(root);
  notify(`Localiza una vez la carpeta «${label}» en este ordenador para poder abrirla.`, {
    label: "Localizar",
    run: () => {
      set({ notice: null });
      void desktop.pickFolder().then((picked) => {
        if (!picked) return;
        const name = picked.split(/[\\/]/).filter(Boolean).pop();
        if (name !== label) notify(`Esa carpeta se llama «${name}», no «${label}». La uso igualmente; puedes cambiarla en Ajustes.`);
        remember(label, picked);
        use(picked);
      });
    },
  });
}

/** Shows `entryId`'s folder (a production or a dashboard folder; null: the team folder itself). */
export async function revealEntry(entryId: string | null): Promise<void> {
  const { library, lib, notify } = useStore.getState();
  const storage = lib?.storage;
  if (!storage || storage.kind !== "folder") {
    notify("Se guarda en este navegador: no hay carpeta en el ordenador. Elige una en Ajustes › Almacenamiento.");
    return;
  }
  const rel = entryId ? library.pathOf?.(entryId) ?? null : "";
  if (rel === null) return notify("Esa carpeta aún no está en el disco.");
  const desktop = window.sweetflow;
  if (!desktop) {
    const path = [storage.name, rel].filter(Boolean).join("/");
    void navigator.clipboard?.writeText(path);
    notify(`El navegador no puede abrir el Finder: ruta copiada («${path}»). En la app de escritorio se abre directamente.`);
    return;
  }
  withTeamRoot((root) => {
    desktop.revealInFolder([root, rel].filter(Boolean).join("/")).catch((err) => notify(`No se ha podido abrir: ${err instanceof Error ? err.message : String(err)}`));
  });
}
