// Bootstrap: fetch the topology from the API, validate it, then render the
// board. A failed fetch or a broken config renders a readable French error
// instead of a blank page.

import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { validateBoardConfig } from "../core/config.ts";
import { fetchConfig } from "./api.ts";
import { App } from "./App.tsx";
import "./styles.css";
import "./sidebar.css";
import "./modal.css";
import "./metrics.css";

const root = document.getElementById("root");
if (!root) throw new Error("élément #root introuvable");
const reactRoot = createRoot(root);

function renderError(message: string): void {
  reactRoot.render(
    <div className="config-error">
      <h1>Tableau indisponible</h1>
      <p>{message}</p>
    </div>,
  );
}

async function bootstrap(target: Root): Promise<void> {
  try {
    const config = validateBoardConfig(await fetchConfig());
    target.render(
      <StrictMode>
        <App config={config} />
      </StrictMode>,
    );
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

void bootstrap(reactRoot);
