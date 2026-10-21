// Background videos of the "For teams" section. They are decorative and cheap
// on purpose: nothing downloads until the section is near the viewport, hidden
// tiles (mobile) never load, playback pauses when the section scrolls away,
// and users who prefer reduced motion only get the poster frame.

export function initBackgroundVideos(root: ParentNode = document): void {
  const wrap = root.querySelector<HTMLElement>("[data-bg-videos]");
  if (!wrap) return;
  const videos = Array.from(wrap.querySelectorAll<HTMLVideoElement>("video[data-src]"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  const visible = (v: HTMLVideoElement) => v.offsetParent !== null; // display:none on narrow screens

  const load = (v: HTMLVideoElement) => {
    if (!v.src && v.dataset["src"]) v.src = v.dataset["src"];
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          for (const v of videos) {
            if (!visible(v)) continue;
            load(v);
            v.play().catch(() => {});
          }
        } else {
          for (const v of videos) v.pause();
        }
      }
    },
    { rootMargin: "300px 0px" },
  );
  io.observe(wrap);
}
