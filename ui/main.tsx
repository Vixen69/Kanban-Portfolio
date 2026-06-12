// Bootstrap: validate the versioned topology, then render the board.
// A broken config renders a readable French error instead of a blank page.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import rawConfig from "../config/board.json";
import { validateBoardConfig } from "../core/config.ts";
import { App } from "./App.tsx";
import "./styles.css";
import "./sidebar.css";
import "./modal.css";
import "./metrics.css";

const root = document.getElementById("root");
if (!root) throw new Error("élément #root introuvable");

try {
  const config = validateBoardConfig(rawConfig);
  createRoot(root).render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  createRoot(root).render(
    <div className="config-error">
      <h1>Configuration invalide</h1>
      <p>config/board.json a été rejeté : {message}</p>
    </div>,
  );
}
