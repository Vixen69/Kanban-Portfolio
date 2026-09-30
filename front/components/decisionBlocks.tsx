// The blocks of the fiche « Décision et Raison » (ADR 052), numbered as on
// the paper V0.1: 1 instance, 3 the reason, 4 what the decision frees, 5 the
// pause, 6 the requalification (block 2, the decision itself, is the
// gesture — shown in the head). Controlled inputs over one FicheDraft.

import { useState } from "react";
import type { BoardConfig, DecisionFrees, PauseKind } from "../../core/types.ts";
import type { FicheDraft } from "../decisionDraft.ts";

/** Props shared by every block: the draft and its patch. */
export interface BlockProps {
  draft: FicheDraft;
  set: (patch: Partial<FicheDraft>) => void;
}

function Section({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <section className="fd-sec">
      <div className="fd-sec-head"><span className="fd-num">{num}</span>{title}</div>
      {children}
    </section>
  );
}

/**
 * Block 1 — where the decision is taken (optional), and the day it was
 * taken when a paper decision is traced afterwards.
 * Inputs: BlockProps, trace. Output: the section. Failure: none.
 */
export function InstanceBlock({ draft, set, trace }: BlockProps & { trace: boolean }) {
  const pill = (value: "revue" | "synchro", label: string) => (
    <button type="button" className={"fd-pill" + (draft.instance === value ? " on" : "")} aria-pressed={draft.instance === value}
      onClick={() => set({ instance: draft.instance === value ? null : value })}>{label}</button>
  );
  return (
    <Section num={1} title="Instance">
      <div className="fd-row">
        {pill("revue", "Revue Stratégique")}
        {pill("synchro", "Synchro")}
        {trace && (
          <label className="fd-inline">Décidée le
            <input type="date" className="inp fd-date" value={draft.decidedOn} max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => set({ decidedOn: event.target.value })} />
          </label>
        )}
      </div>
    </Section>
  );
}

/**
 * Block 3 — the reason: the grid's pause terms (for a pause) and the
 * sentence written to be understood in six months.
 * Inputs: BlockProps, the config (grid terms), whether the pause is decided.
 * Output: the section. Failure: none.
 */
export function ReasonBlock({ draft, set, config, pause }: BlockProps & { config: BoardConfig; pause: boolean }) {
  const toggle = (id: string) => set({ grounds: draft.grounds.includes(id) ? draft.grounds.filter((g) => g !== id) : [...draft.grounds, id] });
  return (
    <Section num={3} title="La raison">
      {pause && (
        <div className="fd-grounds">
          <span className="field-label">Dans les termes de la grille</span>
          {config.decisionGrounds.filter((ground) => ground.family === "pause").map((ground) => (
            <label key={ground.id} className={"dec-opt" + (draft.grounds.includes(ground.id) ? " on" : "")}>
              <input type="checkbox" checked={draft.grounds.includes(ground.id)} onChange={() => toggle(ground.id)} />
              {ground.name}
            </label>
          ))}
        </div>
      )}
      <textarea className="inp" rows={3} value={draft.reason} autoFocus={pause}
        placeholder="En clair, en deux ou trois phrases : ce qui a été constaté, et pourquoi cela conduit à cette décision."
        onChange={(event) => set({ reason: event.target.value })} />
      <div className="fd-hint">Écrite pour être comprise dans six mois par quelqu’un qui n’était pas dans la salle.</div>
    </Section>
  );
}

const KINDS: Array<[PauseKind | null, string]> = [[null, "Non précisé"], ["tactique", "Tactique · synchro suivante"], ["parking", "Parking · plus tard"]];

/**
 * Block 5 — the pause: its kind (optional), the review date (none for a
 * parking), what is expected to lift it.
 * Inputs: BlockProps, the default review day. Output: the section.
 * Failure: none.
 */
export function PauseBlock({ draft, set, defaultReview }: BlockProps & { defaultReview: string }) {
  const pick = (kind: PauseKind | null) => set({
    pauseKind: kind,
    reviewDate: kind === "parking" ? "" : draft.reviewDate === "" ? defaultReview : draft.reviewDate,
  });
  return (
    <Section num={5} title="Pause">
      <div className="fd-row" role="radiogroup" aria-label="Type de pause">
        {KINDS.map(([kind, label]) => (
          <button key={label} type="button" role="radio" aria-checked={draft.pauseKind === kind}
            className={"fd-pill" + (draft.pauseKind === kind ? " on" : "")} onClick={() => pick(kind)}>{label}</button>
        ))}
      </div>
      <div className="fd-row">
        <label className="fd-inline">Échéance du réexamen
          <input type="date" className="inp fd-date" value={draft.reviewDate} disabled={draft.pauseKind === "parking"}
            onChange={(event) => set({ reviewDate: event.target.value })} />
        </label>
      </div>
      <input className="inp" value={draft.liftCondition} placeholder="Ce qui est attendu pour la lever"
        onChange={(event) => set({ liftCondition: event.target.value })} />
      <div className="fd-hint">Le réexamen a lieu à l’échéance. Prolonger est une décision : nouvelle fiche.</div>
    </Section>
  );
}

/**
 * Block 6 — the requalification: what changed in the subject's nature
 * (required) and the architect's validation.
 * Inputs: BlockProps, the canal words (« Projets → Petits Projets »),
 * autoFocus. Output: the section. Failure: none.
 */
export function RequalifyBlock({ draft, set, canals, focus }: BlockProps & { canals: string; focus: boolean }) {
  return (
    <Section num={6} title={`Requalification · ${canals}`}>
      <textarea className="inp" rows={2} value={draft.natureChange} autoFocus={focus}
        placeholder="Ce qui a changé dans la nature du sujet"
        onChange={(event) => set({ natureChange: event.target.value })} />
      <label className="fd-check">
        <input type="checkbox" checked={draft.architectValidated} onChange={(event) => set({ architectValidated: event.target.checked })} />
        Validée par un architecte
      </label>
    </Section>
  );
}

/**
 * The optional part, folded: the options set aside (block 3) and what the
 * decision frees or commits (block 4).
 * Inputs: BlockProps. Output: the fold. Failure: none.
 */
export function MoreBlock({ draft, set }: BlockProps) {
  const [open, setOpen] = useState(false);
  const free = (key: keyof DecisionFrees, label: string) => (
    <label className="fd-free">{label}
      <input className="inp" value={draft.frees[key]} onChange={(event) => set({ frees: { ...draft.frees, [key]: event.target.value } })} />
    </label>
  );
  return (
    <div className="fd-more">
      <button type="button" className="btn ghost sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Options écartées, ce que la décision libère (facultatif)
      </button>
      {open && (
        <>
          <textarea className="inp" rows={2} value={draft.options} placeholder="Les options écartées, et pourquoi"
            onChange={(event) => set({ options: event.target.value })} />
          <Section num={4} title="Ce que la décision libère ou engage">
            {free("people", "Personnes")}
            {free("budget", "Budget")}
            {free("capacity", "Capacité")}
          </Section>
        </>
      )}
    </div>
  );
}
