// Ticket marks of ADR 026: the last decision's code (colored pill, ringed
// in red when its review date is past) and the « ∅ » of a card absent from
// the last import. One signal per information, after the criticality picto.

import type { BoardConfig, CardState } from "../../core/types.ts";
import { decisionStatus } from "../../core/decisions.ts";

function frDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * The last decision's short code on a ticket.
 * Inputs: the card, the config (decision colors/names), now (ms).
 * Output: the pill, or null without decision. Failure: none — an unknown
 * decision id shows the raw id in grey.
 */
export function DecisionMark({ card, config, now }: { card: CardState; config: BoardConfig; now: number }) {
  const status = decisionStatus(card, config, new Date(now));
  if (status === null) return null;
  const { entry, decision, overdue } = status;
  const review = entry.reviewDate === null ? "" : ` · réexamen ${frDay(entry.reviewDate)}${overdue ? " (dépassé)" : ""}`;
  return (
    <span className={"dec-pill" + (overdue ? " overdue" : "")}
      style={{ background: decision?.color ?? "#94a3b8" }}
      title={`${decision?.name ?? entry.decisionId}${review}`}>
      {decision?.short ?? entry.decisionId}
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
