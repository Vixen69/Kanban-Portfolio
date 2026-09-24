// The board-configuration panel (admin-only by intent, design/admin.jsx).
// Edits a DRAFT of the board config; nothing applies until « Appliquer ».
// Locked to what the importer does not depend on (ADR 046, author
// 2026-09-24): the WIP limits per cell, the labels and colours of the
// categories, the custom fields. Columns, canals, domains and types
// themselves are the versioned model's. The panel also hosts the import,
// the year switch and the snapshots — the gestures that go together.

import { useState } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import type { AdminTab } from "../useInteractions.ts";
import { CategoriesTab, FieldsTab } from "./adminTabs.tsx";
import { WipTab } from "./adminWip.tsx";
import { ExerciseTab } from "./adminExercise.tsx";
import { SnapshotsTab } from "./adminSnapshots.tsx";
import { ImportPanel } from "./ImportView.tsx";

/** Props of the admin configuration modal. */
export interface AdminPanelProps {
  /** The current runtime config (override if present, else defaults). */
  config: BoardConfig;
  /** The tab the panel opens on (the ⋯ menu's « Importer » lands on the import). */
  initialTab: AdminTab;
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
  /** After a successful import load: the board and the capacity refetch. */
  onImported: () => void;
  /** The exercise shown, preselected by the import when it is not closed (ADR 035). */
  defaultYear: number;
  onClose: () => void;
}

const TABS: [AdminTab, string][] = [
  ["wip", "Limites WIP"],
  ["categories", "Catégories"],
  ["champs", "Champs de carte"],
  ["importer", "Importer"],
  ["exercice", "Exercice"],
  ["instantanes", "Instantanés"],
];

/** The tabs that edit the draft: the only ones with « Appliquer ». */
const DRAFT_TABS: ReadonlySet<AdminTab> = new Set<AdminTab>(["wip", "categories", "champs"]);

interface TabBodyProps {
  tab: AdminTab;
  draft: BoardConfig;
  patch: (part: Partial<BoardConfig>) => void;
  /** Shows a write's failure under the tabs (null clears it). */
  setError: (failure: string | null) => void;
  panel: AdminPanelProps;
}

// The open tab: the draft editors, or the server-side actions (each
// failure noted on the panel's error line).
function TabBody({ tab, draft, patch, setError, panel }: TabBodyProps) {
  const noting = (write: Promise<string | null>) => write.then((failure) => { setError(failure); return failure; });
  switch (tab) {
    case "wip": return <WipTab draft={draft} patch={patch} />;
    case "categories": return <CategoriesTab draft={draft} patch={patch} />;
    case "champs": return <FieldsTab draft={draft} patch={patch} />;
    case "importer": return <ImportPanel config={panel.config} onLoaded={panel.onImported} defaultYear={panel.defaultYear} />;
    case "exercice": return <ExerciseTab config={panel.config} cards={panel.cards} onSwitch={(year) => noting(panel.onSwitch(year))} />;
    default: return <SnapshotsTab onTake={(label) => noting(panel.onTakeSnapshot(label))} onRestore={(id) => noting(panel.onRestoreSnapshot(id))} />;
  }
}

const RESET_CONFIRM =
  "Revenir au modèle d’origine ? Les limites WIP, les libellés et couleurs des catégories et les champs personnalisés seront réinitialisés.";

// The draft's footer — reset, cancel, apply — on the tabs that edit it.
function DraftActions({ onReset, onClose, onApply }: { onReset: () => void; onClose: () => void; onApply: () => void }) {
  return (
    <div className="modal-actions">
      <button className="btn danger" title="Revenir au modèle d’origine (limites, libellés, champs)" onClick={onReset}>Réinitialiser le modèle</button>
      <span style={{ flex: 1 }} />
      <button className="btn ghost" onClick={onClose}>Annuler</button>
      <button className="btn primary" onClick={onApply}>Appliquer</button>
    </div>
  );
}

/**
 * Admin configuration modal: edits a draft of the runtime board config
 * (WIP limits, categories, custom fields) and applies it as a whole; hosts
 * the import, the year switch and the snapshots.
 * Inputs: AdminPanelProps — current config, the opening tab, the write
 * callbacks, close. Output: the modal DOM (wider on the import tab).
 * Failure modes: a refused apply/reset (server-side validateBoardConfig on
 * PUT /api/config, or an unreachable server) shows its French message under
 * the tabs and keeps the panel open with the draft intact; « Réinitialiser
 * le modèle » is guarded by window.confirm.
 */
export function AdminPanel(props: AdminPanelProps) {
  const { config, onClose } = props;
  const [draft, setDraft] = useState<BoardConfig>(() => JSON.parse(JSON.stringify(config)) as BoardConfig);
  const [tab, setTab] = useState<AdminTab>(props.initialTab);
  const [error, setError] = useState<string | null>(null);
  const patch = (part: Partial<BoardConfig>) => setDraft((current) => ({ ...current, ...part }));
  const apply = () => void props.onApply(draft).then(setError);
  const reset = () => {
    if (window.confirm(RESET_CONFIRM)) void props.onReset().then(setError);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className={"modal admin-modal" + (tab === "importer" ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
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
          <TabBody tab={tab} draft={draft} patch={patch} setError={setError} panel={props} />
          {error !== null && <div className="a-error" role="alert">{error}</div>}
          {DRAFT_TABS.has(tab) && <DraftActions onReset={reset} onClose={onClose} onApply={apply} />}
        </div>
      </div>
    </div>
  );
}
