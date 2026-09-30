// Ticket marks of ADR 026: the last decision's code (colored pill, ringed
// in red when its review date is past) and the « ∅ » of a card absent from
// the last import; since ADR 061 the « ? » of a domain to assign or to
// verify. One signal per information, after the criticality picto.

import type { BoardConfig, CardState } from "../../core/types.ts";
import { decisionStatus } from "../../core/decisions.ts";
import { domainIssue } from "../../core/domain-check.ts";
import { domainIssueText } from "../domainMark.ts";

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
 * The static « ? » of a card without domain (filled) or with a domain to
 * verify (outlined) — ADR 061: the problem is signalled on the card, in
 * its own sign (the red wash stays the blocked card's alone).
 * Input: the card. Output: the mark or null. Failure: none.
 */
export function DomainMark({ card }: { card: Pick<CardState, "domain" | "domainUnresolved"> }) {
  const issue = domainIssue(card);
  if (issue === null) return null;
  const text = domainIssueText(issue);
  return <span className={"dom-issue " + issue} role="img" aria-label={text} title={text}>?</span>;
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
