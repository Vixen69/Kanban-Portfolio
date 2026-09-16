// « Changer d'année en cours » (ADR 035/038, author 2026-09-16: « l'année
// dernière est archivée, on passe d'année »). The tab says what the switch
// will do on THIS board, asks for an explicit confirmation, then posts it;
// the server writes the events in one batch and records the new current
// exercise. Nothing is deleted: every step is an event in the Historique.

import { useState } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { exerciseOf } from "../../core/exercise.ts";

/** Props of the exercise tab. */
export interface ExerciseTabProps {
  config: BoardConfig;
  /** Every folded card (archived included) — the counts the switch announces. */
  cards: CardState[];
  /** Posts the switch; resolves null on success, the French message otherwise. */
  onSwitch: (year: number) => Promise<string | null>;
}

/**
 * The « Exercice » tab of the admin panel.
 * Inputs: ExerciseTabProps. Output: the tab DOM. Failure modes: none — a
 * refused switch shows its message through the panel's error line.
 */
export function ExerciseTab({ config, cards, onSwitch }: ExerciseTabProps) {
  const current = config.exercise.year;
  const next = current + 1;
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pinned = cards.filter((card) => card.exercise === undefined).length;
  const archived = cards.filter((card) => exerciseOf(card, current) === current && !card.archived).length;
  const activated = cards.filter((card) => exerciseOf(card, current) === next).length;
  const run = () => {
    setBusy(true);
    void onSwitch(next).finally(() => setBusy(false));
  };
  return (
    <div className="a-exercise">
      <div className="a-ex-row"><span className="field-label">Exercice en cours</span><b>{current}</b></div>
      <div className="a-ex-row"><span className="field-label">Exercice suivant</span><b>{next}</b></div>
      <div className="import-note">
        La bascule fait de {next} l’année en cours, en un seul lot : les <b>{pinned}</b> carte(s) sans année sont épinglées
        sur {current} ; les <b>{archived}</b> carte(s) actives de {current} sont archivées (le tableau {current} reste
        lisible, clos) ; l’horloge des <b>{activated}</b> carte(s) de {next} démarre aujourd’hui. Rien n’est supprimé,
        chaque geste est un évènement dans l’Historique. Importer {next} avant la bascule, c’est mieux : ses cartes
        existent alors et démarrent ensemble.
      </div>
      <label className="dec-opt">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Je confirme : {current} se clôt, {next} devient l’année en cours.
      </label>
      <div className="import-actions">
        <button className="btn primary" disabled={!confirmed || busy} onClick={run}>Passer à l’exercice {next}</button>
        {busy && <span className="m2-note">Bascule en cours…</span>}
      </div>
    </div>
  );
}
