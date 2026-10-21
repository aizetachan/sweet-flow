// Modals are native <dialog> elements. Any [data-open="<id>"] button opens
// `#modal-<id>`; [data-close] buttons, Escape and a click on the backdrop close
// it. Each modal has [data-state] panels (idle / success); opening it resets
// to idle so the form can be used again.

export type ModalState = "idle" | "success";

export function setState(dialog: HTMLDialogElement, state: ModalState): void {
  for (const panel of dialog.querySelectorAll<HTMLElement>("[data-state]")) {
    panel.hidden = panel.dataset["state"] !== state;
  }
}

export function openModal(dialog: HTMLDialogElement): void {
  setState(dialog, "idle");
  for (const form of dialog.querySelectorAll("form")) form.reset();
  for (const err of dialog.querySelectorAll<HTMLElement>("[data-error]")) err.textContent = "";
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLElement>("input:not([tabindex='-1']), textarea")?.focus();
}

export function closeModal(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close();
}

export function initModals(root: ParentNode = document): void {
  for (const btn of root.querySelectorAll<HTMLElement>("[data-open]")) {
    btn.addEventListener("click", () => {
      const dialog = document.getElementById(`modal-${btn.dataset["open"]}`);
      if (dialog instanceof HTMLDialogElement) openModal(dialog);
    });
  }
  for (const dialog of root.querySelectorAll<HTMLDialogElement>("dialog.modal")) {
    for (const btn of dialog.querySelectorAll<HTMLElement>("[data-close]")) {
      btn.addEventListener("click", () => closeModal(dialog));
    }
    // A click on the backdrop (the dialog itself, outside its card) closes it.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeModal(dialog);
    });
  }
}
