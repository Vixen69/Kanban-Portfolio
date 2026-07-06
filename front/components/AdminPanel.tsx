// The board-configuration panel (admin-only by intent, design/admin.jsx).
// Edits a DRAFT of the board config; nothing applies until « Appliquer ».
// Topology/vocabulary only — behavior is never configurable (ADR 013).

import { useState } from "react";
import type { BoardConfig } from "../../core/types.ts";
import { CategoriesTab, FieldsTab, StructureTab } from "./adminTabs.tsx";

/** Props of the admin configuration modal. */
export interface AdminPanelProps {
  /** The current runtime config (override if present, else defaults). */
  config: BoardConfig;
  /**
   * Called with the whole next config (« Appliquer »). Resolves null on
   * success (the caller closes the panel) or the French failure message,
   * shown inline — the panel stays open and the draft is kept.
   */
  onApply: (next: BoardConfig) => Promise<string | null>;
  /** « Réinitialiser le modèle » — same contract as onApply. */
  onReset: () => Promise<string | null>;
  onClose: () => void;
}

type TabId = "structure" | "categories" | "champs";

const TABS: [TabId, string][] = [
  ["structure", "Structure"],
  ["categories", "Catégories"],
  ["champs", "Champs de carte"],
];

const RESET_CONFIRM =
  "Revenir au modèle NMO d’origine ? Les colonnes, canaux, domaines et champs personnalisés seront réinitialisés.";

/**
 * Admin configuration modal: edits a draft of the runtime board config
 * (structure, categories, custom fields) and applies it as a whole.
 * Inputs: AdminPanelProps — current config, apply/reset/close callbacks.
 * Output: the modal DOM.
 * Failure modes: a refused apply/reset (server-side validateBoardConfig on
 * PUT /api/config, or an unreachable server) shows its French message under
 * the tabs and keeps the panel open with the draft intact; « Réinitialiser
 * le modèle » is guarded by window.confirm.
 */
export function AdminPanel({ config, onApply, onReset, onClose }: AdminPanelProps) {
  const [draft, setDraft] = useState<BoardConfig>(() => JSON.parse(JSON.stringify(config)) as BoardConfig);
  const [tab, setTab] = useState<TabId>("structure");
  const [error, setError] = useState<string | null>(null);
  const patch = (part: Partial<BoardConfig>) => setDraft((current) => ({ ...current, ...part }));
  const apply = () => void onApply(draft).then(setError);
  const reset = () => {
    if (window.confirm(RESET_CONFIRM)) void onReset().then(setError);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
        <span className="modal-bar" style={{ background: "#1d4ed8" }} />
        <div className="modal-body">
          <div className="modal-top">
            <h2 className="modal-name">Configuration du tableau</h2>
            <button className="x" onClick={onClose}>✕</button>
          </div>
          <div className="atabs">
            {TABS.map(([id, label]) => (
              <button key={id} className={"atab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          {tab === "structure" && <StructureTab draft={draft} patch={patch} />}
          {tab === "categories" && <CategoriesTab draft={draft} patch={patch} />}
          {tab === "champs" && <FieldsTab draft={draft} patch={patch} />}
          {error !== null && <div className="a-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="btn danger" title="Revenir au modèle NMO d’origine (colonnes, canaux, domaines, champs)" onClick={reset}>Réinitialiser le modèle</button>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" onClick={apply}>Appliquer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
