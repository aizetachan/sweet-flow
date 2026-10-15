import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@sweetflow/ui/tokens.css";
import "./styles/app.css";
import "./styles/splash.css";
import { initStorage } from "./data";

// The team folder (if any) must be open before the store creates the library.
void initStorage().then(async () => {
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
