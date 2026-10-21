// Cards carry two still frames of the fluid as texture (see fluid.ts, CSS
// vars --fluid-tex / --fluid-tex-2); the CSS drifts and cross-fades them so
// the surface deforms slowly on its own. The cursor only nudges the layers a
// few pixels towards itself while it is over the card; it is not followed.

export function initCards(root: ParentNode = document): void {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  for (const card of root.querySelectorAll<HTMLElement>(".card")) {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--tx", `${(x * 8).toFixed(1)}px`);
      card.style.setProperty("--ty", `${(y * 6).toFixed(1)}px`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tx", "0px");
      card.style.setProperty("--ty", "0px");
    });
  }
}
