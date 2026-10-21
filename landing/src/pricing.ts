// Monthly / yearly toggle in the pricing section. The page carries both
// prices on each element (data-monthly / data-yearly, per language); the
// toggle just swaps them. Monthly is the default, as in the design.

export function initPricing(root: ParentNode = document): void {
  const toggle = root.querySelector<HTMLElement>("[data-period-toggle]");
  if (!toggle) return;
  const options = Array.from(toggle.querySelectorAll<HTMLButtonElement>("[data-period]"));
  const prices = Array.from(root.querySelectorAll<HTMLElement>("[data-price], [data-price-sub]"));

  function apply(period: "monthly" | "yearly"): void {
    for (const opt of options) {
      const on = opt.dataset["period"] === period;
      opt.classList.toggle("is-on", on);
      opt.setAttribute("aria-pressed", String(on));
    }
    for (const el of prices) {
      const next = el.dataset[period];
      if (next !== undefined) el.textContent = next;
    }
  }

  for (const opt of options) {
    opt.addEventListener("click", () => apply(opt.dataset["period"] === "yearly" ? "yearly" : "monthly"));
  }
}
