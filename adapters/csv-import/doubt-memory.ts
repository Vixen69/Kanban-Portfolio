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

/**
 * Why a request's choices cannot be applied, in plain French, or null:
 * a doubt these files do not raise, or an option the doubt does not
 * offer (the files or the board changed since the audit).
 * Inputs: the doubts of the audit / load, the request's choices.
 * Output: the message or null. Failure modes: none.
 */
export function choiceProblem(doubts: readonly ImportDoubt[], request: ReadonlyMap<string, ImportChoice>): string | null {
  const byId = new Map(doubts.map((d) => [d.id, d]));
  for (const [id, choice] of request) {
    const doubt = byId.get(id);
    if (doubt === undefined) return `Doute inconnu « ${id} » : les fichiers ou le tableau ont changé depuis l'analyse — relancer l'analyse.`;
    if ("forget" in choice || doubt.options.some((o) => o.id === choice.option)) continue;
    return `Choix « ${choice.option} » inconnu pour « ${doubt.title} » (${doubt.why}) — relancer l'analyse.`;
  }
  return null;
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
 * an unknown doubt is skipped (choiceProblem refused it before).
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
 * The doubts settled otherwise than by the proposal, for the change
 * report (ADR 055/062). Input: the doubts. Output: ImportSettled[], in
 * doubt order. Failure modes: none.
 */
export function settledOf(doubts: readonly ImportDoubt[]): ImportSettled[] {
  return doubts.flatMap((d): ImportSettled[] => {
    if (d.how === "proposé") return [];
    const option = d.options.find((o) => o.id === d.applied)?.label ?? d.applied;
    return [{ cardId: d.cardId, code: d.code, title: d.title, kind: d.kind, why: d.why, option, how: d.how }];
  });
}
