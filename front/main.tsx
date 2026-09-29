// Entry point: bundles the whole stylesheet set (self-hosted fonts first,
// then chrome, board, cards and modals) and mounts the App. Data loading,
// error screens and all state live in App/useBoardStore — this file only
// binds React to #root.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/sidebar.css";
import "./styles/board.css";
import "./styles/lens.css";
import "./styles/cards.css";
import "./styles/modal.css";
import "./styles/admin.css";
import "./styles/metrics.css";
// Proposition de passe graphique v13 (branche proposition-design) : chargée
// en dernier, elle ne fait que surcharger ; retirer cette ligne rend le
// tableau d'avant.
import "./styles/design-v13.css";

const root = document.getElementById("root");
if (!root) throw new Error("élément #root introuvable");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
