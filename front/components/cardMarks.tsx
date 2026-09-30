// Ticket marks: the pause in force on a card in Pause (ADR 052 — only the
// pause shows on the board: « D4 », or « T » / « P » when its kind is said,
// ringed in red once its review date is past, a dashed « ? » while it is not
// traced) and the « ∅ » of a card absent from the last import (ADR 026). One
// signal per information, after the criticality picto.

import type { BoardConfig, CardState } from "../../core/types.ts";
import { pauseStatus } from "../../core/decisions.ts";
import { PAUSE_DECISION_ID } from "../../core/gesture.ts";

function frDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * The pause mark of a ticket in Pause.
 * Inputs: the card, the config (the pause decision's color and code), now
 * (ms — read at the day). Output: the pill, or null out of Pause.
 * Failure: none.
 */
export function DecisionMark({ card, config, now }: { card: CardState; config: BoardConfig; now: number }) {
  const status = pauseStatus(card, new Date(now));
  if (status === null) return null;
  const { entry, overdue } = status;
  if (entry === null) {
    return <span className="dec-pill untraced" title="Pause non tracée — ouvrir la fiche pour la tracer">?</span>;
  }
  const decision = config.decisions.find((d) => d.id === PAUSE_DECISION_ID);
  const code = entry.pauseKind === "tactique" ? "T" : entry.pauseKind === "parking" ? "P" : (decision?.short ?? entry.decisionId);
  const review = entry.reviewDate === null ? "" : ` · réexamen le ${frDay(entry.reviewDate)}${overdue ? " (dépassé)" : ""}`;
  const title = entry.pauseKind === "tactique" ? `Pause tactique${review}`
    : entry.pauseKind === "parking" ? `Pause parking depuis le ${frDay(entry.ts.slice(0, 10))}`
    : `${decision?.name ?? "Mettre en pause"}${review}`;
  return (
    <span className={"dec-pill" + (overdue ? " overdue" : "")} style={{ background: decision?.color ?? "#7c3aed" }} title={title}>
      {code}
    </span>
  );
}

/**
 * The « ∅ » of a card the last import did not list (ADR 026).
 * Input: the card. Output: the mark or null. Failure: none.
 */
export function AbsentMark({ card }: { card: CardState }) {
  if (card.absentFromLastImport === null) return null;
  return (
    <span className="absent-pill" title={`Absente du dernier import (${new Date(card.absentFromLastImport).toLocaleDateString("fr-FR")})`}>∅</span>
  );
}
