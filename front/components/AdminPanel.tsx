// The board-configuration panel (admin-only by intent, design/admin.jsx).
// Edits a DRAFT of the board config; nothing applies until « Appliquer ».
// Topology/vocabulary only — behavior is never configurable (ADR 013).

import { useState } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { CategoriesTab, FieldsTab, StructureTab } from "./adminTabs.tsx";
import { ExerciseTab } from "./adminExercise.tsx";
import { SnapshotsTab } from "./adminSnapshots.tsx";

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
  /** Every folded card (the Exercice tab announces what the switch will do). */
  cards: CardState[];
  /** « Passer à l'exercice suivant » (ADR 035/038) — same contract as onApply. */
  onSwitch: (year: number) => Promise<string | null>;
  /** « Prendre un instantané » (ADR 042) — same contract; the panel stays open. */
  onTakeSnapshot: (label: string) => Promise<string | null>;
  /** « Restaurer » an instantané (ADR 042) — same contract as onApply. */
  onRestoreSnapshot: (id: string) => Promise<string | null>;
  onClose: () => void;
}

type TabId = "structure" | "categories" | "champs" | "exercice" | "instantanes";

const TABS: [TabId, string][] = [
  ["structure", "Structure"],
  ["categories", "Catégories"],
  ["champs", "Champs de carte"],
  ["exercice", "Exercice"],
  ["instantanes", "Instantanés"],
];

interface TabBodyProps {
  tab: TabId;
  draft: BoardConfig;
  patch: (part: Partial<BoardConfig>) => void;
  config: BoardConfig;
  cards: CardState[];
  /** Shows a write's failure under the tabs (null clears it). */
  setError: (failure: string | null) => void;
  onSwitch: AdminPanelProps["onSwitch"];
  onTakeSnapshot: AdminPanelProps["onTakeSnapshot"];
  onRestoreSnapshot: AdminPanelProps["onRestoreSnapshot"];
}

// The open tab: the draft editors, or the server-side actions (each
// failure noted on the panel's error line).
function TabBody({ tab, draft, patch, config, cards, setError, onSwitch, onTakeSnapshot, onRestoreSnapshot }: TabBodyProps) {
  const noting = (write: Promise<string | null>) => write.then((failure) => { setError(failure); return failure; });
  switch (tab) {
    case "structure": return <StructureTab draft={draft} patch={patch} />;
    case "categories": return <CategoriesTab draft={draft} patch={patch} />;
    case "champs": return <FieldsTab draft={draft} patch={patch} />;
    case "exercice": return <ExerciseTab config={config} cards={cards} onSwitch={(year) => noting(onSwitch(year))} />;
    default: return <SnapshotsTab onTake={(label) => noting(onTakeSnapshot(label))} onRestore={(id) => noting(onRestoreSnapshot(id))} />;
  }
}

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
export function AdminPanel({ config, onApply, onReset, cards, onSwitch, onTakeSnapshot, onRestoreSnapshot, onClose }: AdminPanelProps) {
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
          <TabBody tab={tab} draft={draft} patch={patch} config={config} cards={cards} setError={setError}
            onSwitch={onSwitch} onTakeSnapshot={onTakeSnapshot} onRestoreSnapshot={onRestoreSnapshot} />
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
