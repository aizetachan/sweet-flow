/** Editor of the production (docs/INTERFAZ.md §2): still to be defined; a placeholder meanwhile. */

import { IconMovie } from "@tabler/icons-react";

export function EditorView() {
  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Editor</h1>
        </div>
      </div>
      <div className="dash__empty">
        <IconMovie size={30} stroke={1.3} className="sf-faint" />
        <p>Próximamente.</p>
      </div>
    </main>
  );
}
