// Header tied to the scroll position: --p goes from 0 (top of the page, full
// bar) to 1 (scrolled, floating pill) over the first RANGE pixels, and the CSS
// interpolates every dimension from it. Scrolling back up widens it again.
// A light smoothing keeps it liquid without detaching it from the scroll.

const RANGE = 220;

export function initNav(root: ParentNode = document): void {
  const nav = root.querySelector<HTMLElement>(".nav");
  if (!nav) return;
  let shown = -1;
  let current = 0;
  let raf = 0;

  const tick = () => {
    const target = Math.min(1, Math.max(0, window.scrollY / RANGE));
    current += (target - current) * 0.25;
    if (Math.abs(target - current) < 0.002) current = target;
    const p = Math.round(current * 1000) / 1000;
    if (p !== shown) {
      shown = p;
      nav.style.setProperty("--p", String(p));
    }
    raf = current === target ? 0 : requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  schedule();
}
