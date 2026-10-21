/**
 * Undo and redo (docs/INTERFAZ.md §2.9): every source records what people do
 * by hand, one entry per intent (an intent made of several writes is one
 * step). Generations, uploads and deleting for good from the trash are not
 * steps; neither is what other people or devices do.
 */

import type { Id } from "@sweetflow/domain";

/** The intents that can be undone. */
export const UNDOABLE = [
  "createNode", "insertAfter", "moveNode", "moveNodes", "setNodeNumber", "trashNode", "restoreNode",
  "groupShots", "placeInRow", "ungroupShots", "dissolveGroup", "renameGroup", "updateNode",
  "createLibGroup", "placeLibMedia", "moveToLib", "setChosen", "setLibType", "setLibraryShare", "setForClient",
  "renameProduction", "updateLevels", "updateStatuses", "setArchived", "placeTakes", "selectTake", "removeTake",
  "splitIntoShots", "extractToRow", "splitTakeShot", "shotsFromEdited", "unshelveNode",
  "addComment", "setCommentResolved", "moveCommentToVersion", "moveCommentMark", "deleteComment",
  "saveEdits", "setEditFormat",
] as const;

/** What each step is called in the notice («Deshecho: mover a la papelera»). */
export const STEP_LABEL: Record<(typeof UNDOABLE)[number], string> = {
  createNode: "crear", insertAfter: "crear", moveNode: "mover", moveNodes: "mover", setNodeNumber: "cambiar el código",
  trashNode: "mover a la papelera", restoreNode: "restaurar", groupShots: "agrupar", placeInRow: "mover",
  ungroupShots: "sacar del grupo", dissolveGroup: "deshacer el grupo", renameGroup: "renombrar el grupo", updateNode: "editar",
  createLibGroup: "crear un grupo", placeLibMedia: "mover una imagen", moveToLib: "mover a la biblioteca", setChosen: "favorita",
  setLibType: "cambiar el tipo", setLibraryShare: "compartir la biblioteca", setForClient: "mostrar al cliente",
  renameProduction: "renombrar la producción", updateLevels: "cambiar los niveles", updateStatuses: "cambiar los estados",
  setArchived: "quitar de la galería", placeTakes: "colocar tramos", selectTake: "elegir versión", removeTake: "quitar un tramo",
  splitIntoShots: "cortar en planos", extractToRow: "sacar a la fila", splitTakeShot: "cortar", shotsFromEdited: "planos del vídeo editado",
  unshelveNode: "devolver al tablero", addComment: "comentar", setCommentResolved: "resolver el comentario",
  moveCommentToVersion: "mover el comentario", moveCommentMark: "mover la marca", deleteComment: "borrar el comentario",
  saveEdits: "editar el montaje", setEditFormat: "cambiar el formato del montaje",
};

/** Steps kept per production open. */
export const MAX_STEPS = 100;

/**
 * Wraps the intents of `source` so `begin`/`end` mark each outermost call (an
 * intent calling another is still one step).
 */
export function recordIntents(source: object, begin: (label: string) => void, end: () => void): void {
  let depth = 0;
  const target = source as Record<string, unknown>;
  for (const name of UNDOABLE) {
    const fn = target[name];
    if (typeof fn !== "function") continue;
    target[name] = (...args: unknown[]) => {
      if (depth++ === 0) begin(STEP_LABEL[name]);
      try {
        return (fn as (...a: unknown[]) => unknown).apply(source, args);
      } finally {
        if (--depth === 0) end();
      }
    };
  }
}

export interface Step<T> {
  /** What puts things back as they were. */
  undo: T;
  /** A few words for the notice. */
  label: string;
}

/** The two stacks: a new step clears what could be redone. */
export class History<T> {
  private back: Step<T>[] = [];
  private ahead: Step<T>[] = [];

  push(step: Step<T>): void {
    this.back.push(step);
    if (this.back.length > MAX_STEPS) this.back.shift();
    this.ahead = [];
  }

  /** Runs `apply` with the last step; it returns the step that redoes it. */
  undo(apply: (s: Step<T>) => Step<T>): string | null {
    const s = this.back.pop();
    if (!s) return null;
    this.ahead.push(apply(s));
    return s.label;
  }

  redo(apply: (s: Step<T>) => Step<T>): string | null {
    const s = this.ahead.pop();
    if (!s) return null;
    this.back.push(apply(s));
    return s.label;
  }
}

export type { Id };
