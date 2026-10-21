import { initForms } from "./forms";
import { initModals } from "./modals";

initModals();
initForms();

for (const el of document.querySelectorAll("[data-year]")) el.textContent = String(new Date().getFullYear());
