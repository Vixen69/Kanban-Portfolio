// The state of the « Doutes à trancher » section of the import pane (ADR
// 062, author 2026-09-30: « quelle valeur on garde, quelle valeur on garde
// pas… est-ce qu'on le prend, est-ce qu'on le prend pas »): the PMO's
// answer per doubt (option + « ne plus me demander pour ce projet »), the
// doubts asked again with « Redemander », the rows to show (to decide /
// already settled), the choices a request sends, and whether the report on
// screen already follows the answers. Pure; no React.

import type { ImportAuditResult, ImportChoice, ImportDoubt, ImportDoubtKind, ImportSettled } from "../core/import-types.ts";
import { displayActor } from "./lookup.ts";
import type { ImportPhase } from "./components/ImportOutcome.tsx";

/** The PMO's answer to one doubt: the option, and « ne plus me demander pour ce projet ». */
export interface DoubtAnswer {
  option: string;
  sticky: boolean;
}

/** What the section holds between an audit and the load. */
export interface DoubtState {
  /** By doubt id; a doubt without entry keeps the tool's choice. */
  answers: Readonly<Record<string, DoubtAnswer>>;
  /** The remembered doubts the PMO asked again (« Redemander »), by id. */
  forgotten: readonly string[];
}

/** No answer yet: every doubt keeps the tool's choice. */
export const EMPTY_DOUBT_STATE: DoubtState = { answers: {}, forgotten: [] };

/**
 * Whether a doubt is already settled by a remembered choice (« Déjà
 * tranchés »), i.e. remembered and not asked again in this session.
 * Inputs: the doubt, the state. Output: true when remembered. Failure: none.
 */
export function isRemembered(doubt: ImportDoubt, state: DoubtState): boolean {
  return doubt.remembered !== null && !state.forgotten.includes(doubt.id);
}

/**
 * The doubts to decide and the ones already settled by a remembered
 * choice, each in the audit's order (kind, code).
 * Inputs: the audit's doubts, the state. Output: { open, remembered }.
 * Failure: none.
 */
export function splitDoubts(doubts: readonly ImportDoubt[], state: DoubtState): { open: ImportDoubt[]; remembered: ImportDoubt[] } {
  return {
    open: doubts.filter((d) => !isRemembered(d, state)),
    remembered: doubts.filter((d) => isRemembered(d, state)),
  };
}

/**
 * The answer shown for a doubt: the PMO's, else the tool's choice, not
 * remembered. Inputs: the doubt, the state. Output: the answer. Failure:
 * none.
 */
export function answerOf(doubt: ImportDoubt, state: DoubtState): DoubtAnswer {
  return state.answers[doubt.id] ?? { option: doubt.proposed, sticky: false };
}

/**
 * The state after an audit: a fresh audit starts from the tool's choices;
 * a new audit « avec ces choix » keeps every answer and « Redemander »
 * whose doubt and option still exist (the files may have changed).
 * Inputs: the audit's doubts, the previous state (default: none).
 * Output: the new state. Failure: none.
 */
export function initialDoubtState(doubts: readonly ImportDoubt[], previous: DoubtState = EMPTY_DOUBT_STATE): DoubtState {
  const byId = new Map(doubts.map((d) => [d.id, d]));
  const answers: Record<string, DoubtAnswer> = {};
  for (const [id, answer] of Object.entries(previous.answers)) {
    if (byId.get(id)?.options.some((o) => o.id === answer.option) === true) answers[id] = answer;
  }
  return { answers, forgotten: previous.forgotten.filter((id) => byId.has(id)) };
}

/**
 * The state with one answer changed. Inputs: the state, the doubt id, the
 * answer. Output: the new state. Failure: none.
 */
export function withAnswer(state: DoubtState, id: string, answer: DoubtAnswer): DoubtState {
  return { ...state, answers: { ...state.answers, [id]: answer } };
}

/**
 * « Redemander »: the remembered doubt comes back among the doubts to
 * decide, on the tool's choice. Inputs: the state, the doubt. Output: the
 * new state. Failure: none.
 */
export function withForgotten(state: DoubtState, doubt: ImportDoubt): DoubtState {
  const forgotten = state.forgotten.includes(doubt.id) ? state.forgotten : [...state.forgotten, doubt.id];
  return { forgotten, answers: { ...state.answers, [doubt.id]: { option: doubt.proposed, sticky: false } } };
}

/**
 * The choices a request sends (`choices`, ADR 062), one per doubt the PMO
 * acted on: another option than the tool's, or « ne plus me demander »
 * (`{ option, sticky }`), or « Redemander » left on the tool's choice
 * (`{ forget: true }`). A doubt left on the tool's choice sends nothing:
 * the load applies that choice, writes nothing, and the question comes
 * back at the next import (« tant que tu n'as pas cliqué, on te
 * redemandera »); a remembered doubt sends nothing either — the memory
 * applies. Inputs: the audit's doubts, the state. Output: doubt id →
 * choice. Failure: none.
 */
export function choicesPayload(doubts: readonly ImportDoubt[], state: DoubtState): Record<string, ImportChoice> {
  const choices: Record<string, ImportChoice> = {};
  for (const doubt of doubts) {
    if (isRemembered(doubt, state)) continue;
    const answer = answerOf(doubt, state);
    const sticky = answer.sticky && doubt.askedEachTime !== true; // never remembered (ADR 062)
    if (answer.option !== doubt.proposed || sticky) choices[doubt.id] = { option: answer.option, sticky };
    else if (state.forgotten.includes(doubt.id)) choices[doubt.id] = { forget: true };
  }
  return choices;
}

/**
 * How many doubts to decide carry an option the report on screen did not
 * apply (the report was made before the PMO changed it, or before a
 * « Redemander »): the load waits for a new audit « avec ces choix » so
 * that what was read is what is loaded. The sticky flag alone changes
 * nothing in the report. Inputs: the audit's doubts, the state. Output:
 * the count, 0 when the report follows the answers. Failure: none.
 */
export function staleCount(doubts: readonly ImportDoubt[], state: DoubtState): number {
  return doubts.filter((d) => !isRemembered(d, state) && answerOf(d, state).option !== d.applied).length;
}

/**
 * The section's header line. Input: the number of doubts to decide.
 * Output: the French line. Failure: none.
 */
export function doubtsHeader(open: number): string {
  if (open === 0) return "Aucun doute à trancher.";
  return `${open} doute(s) — l’outil a pré-choisi ; changez ce qui ne va pas`;
}

const KIND_TITLES: Record<ImportDoubtKind, string> = {
  "couts-fact": "Coût (COUT PREV) : lignes du projet en désaccord",
  "me-unreadable": "Chiffre ME illisible",
  "duplicate-row": "Même Id sur plusieurs lignes",
  join: "Rattachement par le nom",
  figure: "Montant ambigu",
  identity: "Identité de la carte",
};

/** The doubts of one kind, as the section groups them. */
export interface DoubtGroup {
  kind: ImportDoubtKind;
  title: string;
  doubts: ImportDoubt[];
}

/**
 * The doubts grouped by kind, in the audit's order of kinds. Input: the
 * doubts (sorted by kind, as the audit returns them). Output: the
 * non-empty groups. Failure: none.
 */
export function groupDoubts(doubts: readonly ImportDoubt[]): DoubtGroup[] {
  const groups: DoubtGroup[] = [];
  for (const doubt of doubts) {
    const last = groups.at(-1);
    if (last !== undefined && last.kind === doubt.kind) last.doubts.push(doubt);
    else groups.push({ kind: doubt.kind, title: KIND_TITLES[doubt.kind], doubts: [doubt] });
  }
  return groups;
}

// The local day, as the fiche's Historique writes it (DetailSections).
function frenchDay(ts: string): string {
  return new Date(ts).toLocaleDateString("fr-FR");
}

/**
 * The line of a remembered doubt (« Déjà tranchés »): the option kept,
 * when (the local day) and by whom (« vous » until RP3, like the fiche).
 * Input: the doubt. Output: the French line; the bare option id when the
 * doubt no longer lists it. Failure: none.
 */
export function rememberedLine(doubt: ImportDoubt): string {
  const memo = doubt.remembered;
  if (memo === null) return "";
  const label = doubt.options.find((o) => o.id === memo.option)?.label ?? memo.option;
  return `Tranché : ${label} — le ${frenchDay(memo.ts)} par ${displayActor(memo.actor)}`;
}

/**
 * The label of « ne plus me demander », naming the question it keeps (a
 * project may raise several; each is remembered on its own). Input: the
 * doubt. Output: the French label. Failure: none.
 */
export function stickyLabel(doubt: ImportDoubt): string {
  return `Ne plus me demander pour ce projet (${doubt.subject})`;
}

/**
 * What replaces « ne plus me demander » on a doubt asked at each import
 * (ADR 062: its options differ only by columns the log never keeps — a
 * person's name, or a column not shown that may hold one — never
 * remembered, the log keeps the line number alone). Input: the doubt.
 * Output: the French note, null for a doubt that can be remembered.
 * Failure: none.
 */
export function askedEachTimeNote(doubt: ImportDoubt): string | null {
  if (doubt.askedEachTime !== true) return null;
  return "Question reposée à chaque import : ces lignes ne se distinguent que par des colonnes non retenues (noms de personnes ou colonnes non montrées) ; le journal ne garde que le numéro de ligne.";
}

/**
 * The accessible name of « Redemander »: the project and the question.
 * Input: the doubt. Output: the French name. Failure: none.
 */
export function askAgainLabel(doubt: ImportDoubt): string {
  return `Redemander : ${doubt.title} (${doubt.subject})`;
}

/**
 * The line saying that answers were ignored because their doubt vanished
 * with the other answers (ADR 062). Input: the ignored count. Output: the
 * French line, "" when none. Failure: none.
 */
export function ignoredLine(count: number): string {
  if (count === 0) return "";
  return `${count} choix sans objet : le doute a disparu avec vos autres choix (ignoré${count > 1 ? "s" : ""}, rien n’est écrit).`;
}

/**
 * The audit whose doubts, conflicts and load controls stay on screen: the
 * audit's, and the previous one while « Revoir le rapport avec ces choix »
 * runs — kept mounted, so the groups the PMO unfolded stay unfolded and
 * the page does not jump (a fresh « Auditer » starts over: none).
 * Input: the phase. Output: the audit result or null. Failure: none.
 */
export function auditedOnScreen(phase: ImportPhase): ImportAuditResult | null {
  if (phase.kind === "audited") return phase.result;
  return phase.kind === "busy" && phase.what === "preview" ? phase.previous : null;
}

/**
 * The reason shown for a doubt settled otherwise than by the tool, in the
 * readable report: the option applied and how. Input: the settled entry.
 * Output: the French reason. Failure: none.
 */
export function settledReason(entry: ImportSettled): string {
  return `${entry.option} (${entry.how === "mémorisé" ? "choix mémorisé" : "choisi à ce chargement"})`;
}
