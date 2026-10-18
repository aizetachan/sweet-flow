/**
 * How things are named on screen (docs/INTERFAZ.md §2): by their title, or
 * by their code (SQ010, SH0020…) when «Mostrar códigos» is on in Ajustes.
 * The codes still name folders and files on disk; this is only what people see.
 */

import { codeOf, type ProdNode, type Production } from "@sweetflow/domain";
import { useStore } from "./store";

export const UNTITLED = "Sin título";

/** The name of a node in texts (notices, menus, labels): its code if codes are shown, otherwise its title. */
export function nameOf(p: Production, n: Pick<ProdNode, "levelId" | "number" | "title">): string {
  return useStore.getState().showCodes ? codeOf(p, n as ProdNode) : n.title.trim() || UNTITLED;
}

/** Whether codes are shown, for components (re-render when it changes). */
export const useShowCodes = () => useStore((s) => s.showCodes);
