// The memory of the « Doutes à trancher » (ADR 062) is the log itself —
// the log is the truth (CLAUDE.md §1): every choice the PMO sends with a
// load is a `settled` event (who, when, which option, remembered or not).
// The importer reads the last one per doubt, through the restores (ADR
// 042: a choice written after the restored position is forgotten like any
// event). A choice is reapplied only when it was sticky (« ne plus me
// demander ») and the doubt is unchanged (fingerprint); « Redemander » is
// a later non-sticky event that supersedes it. The board fold ignores
// these events. Pure.

import type { CardEvent } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { effectiveEvents } from "../../core/restore.ts";
import { eventSequence } from "../../core/event-sequence.ts";
import type { ImportChoice, ImportDoubt, ImportSettled } from "../../core/import-doubts.ts";
import type { BookInput, DoubtBook, RememberedChoice } from "./doubt-book.ts";

/** The event type of a settled doubt. */
export const SETTLED = "settled";

function rememberedOf(event: CardEvent): [string, RememberedChoice] | null {
  const { doubtId, option, sticky, fingerprint } = event.payload;
  if (typeof doubtId !== "string" || typeof option !== "string" || typeof fingerprint !== "string") return null;
  return [doubtId, { option, sticky: sticky === true, fingerprint, ts: event.ts, actor: event.actor }];
}

/**
 * The log's last word on each doubt, read through the restores.
 * Input: the whole log (any order; the sequence decides — never the
 * timestamp). Output: doubt id → the last settled choice (sticky or not).
 * Failure modes: none — a malformed payload is skipped.
 */
export function rememberedChoices(events: readonly CardEvent[]): Map<string, RememberedChoice> {
  const last = new Map<string, { seq: number; choice: RememberedChoice }>();
  for (const event of effectiveEvents(events)) {
    if (event.type !== SETTLED) continue;
    const read = rememberedOf(event);
    if (read === null) continue;
    const seq = eventSequence(event.id);
    const seen = last.get(read[0]);
    if (seen === undefined || seq > seen.seq) last.set(read[0], { seq, choice: read[1] });
  }
  return new Map([...last].map(([id, { choice }]) => [id, choice]));
}

/**
 * The book input of a request: its choices, the doubts it asks again, the
 * log's memory.
 * Inputs: the year, the request's choices by doubt id, the log.
 * Output: the BookInput. Failure modes: none.
 */
export function bookInput(year: number, request: ReadonlyMap<string, ImportChoice>, events: readonly CardEvent[]): BookInput {
  const choices = new Map<string, string>();
  const forgotten = new Set<string>();
  for (const [id, choice] of request) {
    if ("forget" in choice) forgotten.add(id);
    else choices.set(id, choice.option);
  }
  return { year, choices, forgotten, memory: rememberedChoices(events) };
}

/** What checkChoices finds in a request's choices. */
export interface ChoiceCheck {
  /** Why the request is refused, plain French — an option its doubt does not offer; null when none. */
  problem: string | null;
  /**
   * The choices whose doubt this run does not raise, in request order:
   * another answer of the same request made it vanish (a project taken
   * out, another row read), or the files changed. Nothing is written for
   * them; the audit and the load return them (`ignoredChoices`).
   */
  ignored: string[];
}

/**
 * Checks a request's choices against the doubts this run raised (ADR
 * 062). Doubts depend on each other — « Budget présenté » takes a project
 * out and its ProjetsJalons doubt vanishes; the other SP row is read and
 * the « 1,035 » of the first one is no longer a doubt — so a choice whose
 * doubt is absent is ignored, never refused; only an option that a
 * present doubt does not offer is refused (the files or the board
 * changed since the audit).
 * Inputs: the doubts of the audit / load, the request's choices.
 * Output: the ChoiceCheck. Failure modes: none.
 */
export function checkChoices(doubts: readonly ImportDoubt[], request: ReadonlyMap<string, ImportChoice>): ChoiceCheck {
  const byId = new Map(doubts.map((d) => [d.id, d]));
  const ignored: string[] = [];
  for (const [id, choice] of request) {
    const doubt = byId.get(id);
    if (doubt === undefined) ignored.push(id);
    else if (!("forget" in choice) && !doubt.options.some((o) => o.id === choice.option)) {
      return { problem: `Choix « ${choice.option} » inconnu pour « ${doubt.title} » (${doubt.why}) — relancer l'analyse.`, ignored };
    }
  }
  return { problem: null, ignored };
}

/**
 * The `settled` events of a load: one per choice the request SENT (the
 * proposals left untouched write nothing — « tant que tu n'as pas
 * cliqué, on te redemandera »). Payload: doubt id, kind, fingerprint,
 * option applied, its label (never a person's name — the trace words),
 * the tool's proposal, sticky, and `forget: true` for a « Redemander ».
 * Inputs: the doubts (after the plan, card ids remapped), the request,
 * the book (trace words), the actor, the instant.
 * Output: the events, in doubt order. Failure modes: none — a choice on
 * a doubt this run does not raise writes nothing (checkChoices: ignored).
 */
export function settledEvents(
  doubts: readonly ImportDoubt[], request: ReadonlyMap<string, ImportChoice>, book: DoubtBook, actor: string, ts: string,
): CardEventInput[] {
  return doubts.flatMap((doubt) => {
    const choice = request.get(doubt.id);
    if (choice === undefined) return [];
    const forget = "forget" in choice;
    const payload: Record<string, unknown> = {
      doubtId: doubt.id, kind: doubt.kind, fingerprint: doubt.fingerprint, option: doubt.applied,
      label: book.traceLabel(doubt.id, doubt.applied), proposed: doubt.proposed, sticky: !forget && choice.sticky,
      ...(forget ? { forget: true } : {}),
    };
    return [lifecycleEvent(SETTLED, doubt.cardId, actor, ts, payload)];
  });
}

/**
 * The doubts whose applied option differs from the tool's proposal
 * (remembered or chosen), for the change report (ADR 055/062). A choice
 * that keeps the tool's option — « ne plus me demander » ticked alone —
 * is not « tranché autrement que par l'outil »: it is still traced in the
 * log and listed under « Déjà tranchés ». Input: the doubts. Output:
 * ImportSettled[], in doubt order. Failure modes: none.
 */
export function settledOf(doubts: readonly ImportDoubt[]): ImportSettled[] {
  return doubts.flatMap((d): ImportSettled[] => {
    if (d.how === "proposé" || d.applied === d.proposed) return [];
    const option = d.options.find((o) => o.id === d.applied)?.label ?? d.applied;
    return [{ cardId: d.cardId, code: d.code, title: d.title, kind: d.kind, why: d.why, option, how: d.how }];
  });
}
