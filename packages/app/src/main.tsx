import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@sweetflow/ui/tokens.css";
import "./styles/app.css";
import "./styles/splash.css";
import { initStorage } from "./data";
import { handleCallback } from "./integrations/magnific/auth";
import { handleCloudCallback } from "./integrations/oauth";
import { isDesktop } from "./platform";

// The Mac app draws its own title bar: room for the window buttons and a strip to drag the window.
if (isDesktop() && window.sweetflow?.platform === "darwin") document.documentElement.classList.add("is-mac-app");
// The main window has a tab bar as its title bar (popped-out windows do not).
if (isDesktop() && !/^#\/ventana\//.test(location.hash)) document.documentElement.classList.add("has-tabbar");

// Magnific's sign-in comes back to this page in a popup: hand over and close.
if (handleCallback() || handleCloudCallback()) {
  document.body.textContent = "Puedes cerrar esta ventana.";
} else {
  // The team folder (if any) must be open before the store creates the library.
  void initStorage().then(async () => {
  const { App } = await import("./App");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
