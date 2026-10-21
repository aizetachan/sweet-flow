// Header: adds .is-floating once the page is scrolled, with a little
// hysteresis so it does not flicker around the threshold. CSS does the morph.

export function initNav(root: ParentNode = document): void {
  const nav = root.querySelector<HTMLElement>(".nav");
  if (!nav) return;
  let floating = false;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    if (!floating && y > 48) {
      floating = true;
      nav.classList.add("is-floating");
    } else if (floating && y < 16) {
      floating = false;
      nav.classList.remove("is-floating");
    }
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}
