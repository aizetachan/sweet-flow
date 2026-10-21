// Cards carry a still frame of the fluid as texture (see fluid.ts, CSS var
// --fluid-tex). They only react when the cursor is over them: the glow
// follows the pointer (--mx/--my) and the texture drifts a little towards it.

export function initCards(root: ParentNode = document): void {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  for (const card of root.querySelectorAll<HTMLElement>(".card")) {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      card.style.setProperty("--tx", `${((x - 0.5) * -14).toFixed(1)}px`);
      card.style.setProperty("--ty", `${((y - 0.5) * -10).toFixed(1)}px`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tx", "0px");
      card.style.setProperty("--ty", "0px");
    });
  }
}
