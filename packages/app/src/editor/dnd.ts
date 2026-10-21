/**
 * Dragging from the editor's panel to the timeline (docs/INTERFAZ.md §4):
 * shots, and levels (scenes, sequences) to place as blocks. The browser
 * hides what is dragged until the drop: the timeline reads it here to show
 * where it would go.
 */

import type { Id } from "@sweetflow/domain";

export const EDIT_DRAG = "application/x-sweetflow-edit";

let current: Id[] | null = null;

export function startDrag(e: React.DragEvent, nodeIds: Id[]): void {
  current = nodeIds;
  e.dataTransfer.setData(EDIT_DRAG, JSON.stringify(nodeIds));
  e.dataTransfer.effectAllowed = "copy";
}

export const dragged = () => current;
export const endDrag = () => {
  current = null;
};
