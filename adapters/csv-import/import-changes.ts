// The readable import report (ADR 055, author 2026-09-30: « les valeurs
// qui sont actualisées, je dois pouvoir les voir rapidement à un endroit
// et savoir vraiment ce qu'il a pris » ; « il ne faudrait pas qu'il y ait
// deux modes d'import »): ONE object for the audit and the load — the
// files taken, the perimeter's verdicts, the board now against the board
// after the load (a fold dry run read by the change engine of
// core/snapshot-diff.ts), the projects that enter, leave or come back with
// the rule behind each, and the facts kept from the board (ADR 054) —
// since ADR 058/059 also the hand-made cards adopted, the cards deleted on
// the board that the files still carry (skipped) and the identity doubts;
// since ADR 060 the hand corrections a NEW export value took back and the
// hand placements a new jalon went past.
// Nothing is written. Pure: the caller passes the stored cards and log.

import type { BoardConfig, Card, CardEvent, CardState } from "../../core/types.ts";
import type {
  ImportAdopted, ImportAdvanced, ImportCardRef, ImportChangeCounts, ImportChanges, ImportEntered, ImportExcluded, ImportKeptFact, ImportLeft,
} from "../../core/import-types.ts";
import type { CardChange } from "../../core/snapshot-diff.ts";
import { diffBoards } from "../../core/snapshot-diff.ts";
import { foldEvents } from "../../core/state.ts";
import { cardsOfExercise } from "../../core/exercise.ts";
import { eventSequence } from "../../core/event-sequence.ts";
import { normalizeLabel } from "./normalize.ts";
import type { AuditResult } from "./orchestrate.ts";
import type { PerimeterVerdict } from "./projets-types.ts";
import type { LoadPlan } from "./to-cards.ts";
import { importFiles } from "./import-files.ts";

/** What the report is built from. */
export interface ChangesInput {
  audit: AuditResult;
  /** The runtime config the plan was built with. */
  config: BoardConfig;
  /** The exercise loaded (ADR 035). */
  year: number;
  /** The load plan; null when no deck assembled (nothing would be written). */
  plan: LoadPlan | null;
  /** The stored base cards and the whole log the plan was built against. */
  baseCards: Card[];
  events: CardEvent[];
}

/** The change kinds that say a card's VALUES were refreshed. */
const VALUE_KINDS: ReadonlySet<CardChange["kind"]> = new Set(["domain", "type", "title", "owner", "figure", "dateRdr", "plan"]);

interface Perimeter {
  /** « COUT PREV » / « Projets », null without a perimeter. */
  source: string | null;
  file: string | null;
  verdicts: PerimeterVerdict[];
  /** normalized code → the first verdict read for it. */
  byCode: Map<string, PerimeterVerdict>;
}

function perimeterOf(audit: AuditResult): Perimeter {
  const table = audit.couts ?? audit.projets;
  const source = audit.couts !== null ? "COUT PREV" : audit.projets !== null ? "Projets" : null;
  const verdicts = table?.verdicts ?? [];
  const byCode = new Map<string, PerimeterVerdict>();
  for (const verdict of verdicts) {
    const key = normalizeLabel(verdict.code);
    if (key !== "" && !byCode.has(key)) byCode.set(key, verdict);
  }
  return { source, file: table?.fileName ?? null, verdicts, byCode };
}

// The board after the load, as the fold will read it: the plan's cards
// upserted over the stored ones, its events appended with the next
// sequence numbers (the store assigns the same order).
function boardAfter(input: ChangesInput, plan: LoadPlan): CardState[] {
  const cards = new Map(input.baseCards.map((card) => [card.id, card]));
  for (const card of plan.cards) cards.set(card.id, card);
  const last = input.events.reduce((max, event) => Math.max(max, eventSequence(event.id)), 0);
  const appended = plan.events.map((event, index): CardEvent => ({ ...event, id: `evt-${last + index + 1}` }));
  return foldEvents([...cards.values()], [...input.events, ...appended]);
}

function ref(card: CardState | Card): ImportCardRef {
  return { cardId: card.id, code: card.codename, title: card.title };
}

function verdictOf(perimeter: Perimeter, card: CardState | Card): PerimeterVerdict | undefined {
  return card.codename === null ? undefined : perimeter.byCode.get(normalizeLabel(card.codename));
}

function byTitle<T extends ImportCardRef>(list: T[]): T[] {
  return list.sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

// The ids the plan's events name, by event type, in plan order.
function idsOf(plan: LoadPlan, type: CardEvent["type"]): string[] {
  return plan.events.filter((event) => event.type === type).map((event) => event.cardId);
}

function enteredOf(input: ChangesInput, plan: LoadPlan, perimeter: Perimeter): ImportEntered[] {
  const planned = new Map(plan.cards.map((card) => [card.id, card]));
  const fallback = new Set(plan.domainFallback);
  const defaultName = input.config.domains[0]?.name ?? "aucun domaine";
  return byTitle(idsOf(plan, "imported").flatMap((id): ImportEntered[] => {
    const card = planned.get(id);
    if (card === undefined) return [];
    const verdict = verdictOf(perimeter, card);
    const why = verdict?.motive === "retained" ? ` — ${verdict.reason}` : "";
    return [{
      ...ref(card), reason: `nouveau dans le périmètre ${perimeter.source ?? ""}${why}`,
      domainWarning: fallback.has(id) ? `domaine non résolu → ${defaultName} par défaut, à corriger` : null,
    }];
  }));
}

// Why a card leaves: the perimeter's exclusion motive for its code, else
// its absence from the perimeter file.
function leftReason(perimeter: Perimeter, card: CardState): string {
  const verdict = verdictOf(perimeter, card);
  const file = `« ${perimeter.file ?? "?"} »`;
  if (verdict !== undefined && verdict.motive !== "retained") return `écarté du périmètre ${perimeter.source ?? ""} : ${verdict.reason}`;
  if (verdict !== undefined) return `présent dans ${file} sous une autre identité (code ou nom changé ?)`;
  return perimeter.source === "COUT PREV" ? `plus présent dans le fichier Coût ${file}` : `plus présent dans l’onglet Projets ${file}`;
}

function leftOf(plan: LoadPlan, perimeter: Perimeter, before: ReadonlyMap<string, CardState>): ImportLeft[] {
  return byTitle(idsOf(plan, "unlisted").flatMap((id): ImportLeft[] => {
    const card = before.get(id);
    return card === undefined ? [] : [{ ...ref(card), reason: leftReason(perimeter, card) }];
  }));
}

function backOf(plan: LoadPlan, perimeter: Perimeter, after: ReadonlyMap<string, CardState>): ImportLeft[] {
  return byTitle(idsOf(plan, "relisted").flatMap((id): ImportLeft[] => {
    const card = after.get(id);
    if (card === undefined) return [];
    const verdict = verdictOf(perimeter, card);
    const why = verdict?.motive === "retained" ? ` — ${verdict.reason}` : "";
    return [{ ...ref(card), reason: `de nouveau dans le périmètre ${perimeter.source ?? ""}${why}` }];
  }));
}

// The facts kept (ADR 054) or replaced (ADR 060), with the cards named.
function factCards(plan: LoadPlan, facts: LoadPlan["factsKeptCards"], after: ReadonlyMap<string, CardState>): ImportKeptFact[] {
  const planned = new Map(plan.cards.map((card) => [card.id, card]));
  return facts.map(({ label, cardIds }) => ({
    label,
    cards: cardIds.flatMap((id) => {
      const card = after.get(id) ?? planned.get(id);
      return card === undefined ? [] : [ref(card)];
    }),
  }));
}

// ADR 060: the hand placements a new jalon went past.
function advancedOf(plan: LoadPlan, after: ReadonlyMap<string, CardState>): ImportAdvanced[] {
  return byTitle(plan.advanced.map((a) => {
    const card = after.get(a.cardId);
    return { cardId: a.cardId, code: card?.codename ?? null, title: card?.title ?? a.title, fromColumn: a.fromColumn, toColumn: a.toColumn };
  }));
}

// ADR 059: the hand-made cards adopted, under the export's title.
function adoptedOf(plan: LoadPlan): ImportAdopted[] {
  return byTitle(plan.adopted.map((a) => ({ cardId: a.id, code: a.code, title: a.title, manualTitle: a.manualTitle })));
}

// ADR 058: the deck cards whose board card was deleted — named from the
// stored base card (the fold no longer shows it).
function deletedOf(input: ChangesInput, plan: LoadPlan): ImportCardRef[] {
  const stored = new Map(input.baseCards.map((card) => [card.id, card]));
  return byTitle(plan.deletedSkipped.map((id) => {
    const card = stored.get(id);
    return card === undefined ? { cardId: id, code: null, title: id } : ref(card);
  }));
}

function countsOf(plan: LoadPlan, cardChanges: CardChange[]): ImportChangeCounts {
  const changed = new Set(cardChanges.filter((c) => VALUE_KINDS.has(c.kind)).map((c) => c.cardId));
  const kept = new Set(plan.factsKeptCards.flatMap((fact) => fact.cardIds));
  const replaced = new Set(plan.replaced.flatMap((fact) => fact.cardIds));
  return {
    updated: plan.updated, created: plan.created, absent: plan.unlisted, back: plan.relisted, moved: plan.moved,
    divergences: plan.divergences.length, valuesChanged: changed.size, valuesKept: kept.size,
    replaced: replaced.size, advanced: plan.advanced.length,
  };
}

const NO_COUNTS: ImportChangeCounts = {
  updated: 0, created: 0, absent: 0, back: 0, moved: 0, divergences: 0, valuesChanged: 0, valuesKept: 0, replaced: 0, advanced: 0,
};

/**
 * The readable report of an audit or a load (ADR 055).
 * Input: the audit, the config, the year, the plan (null = nothing would
 * load), the stored base cards and log the plan was built against.
 * Output: ImportChanges — on an audit what the load WOULD change, on a
 * load what it DID (the same plan it wrote). Failure modes: none.
 */
export function importChanges(input: ChangesInput): ImportChanges {
  const { audit, plan, config, year } = input;
  const perimeter = perimeterOf(audit);
  const excluded = perimeter.verdicts
    .filter((verdict) => verdict.motive !== "retained")
    .map((verdict): ImportExcluded => ({ code: verdict.code, name: verdict.name, reason: verdict.reason }));
  const head = {
    ...importFiles(audit),
    perimeter: { source: perimeter.source, file: perimeter.file, retained: perimeter.verdicts.length - excluded.length, excluded },
  };
  if (plan === null) {
    return { ...head, counts: NO_COUNTS, entered: [], left: [], back: [], cardChanges: [], kept: [], replaced: [], advanced: [], adopted: [], deletedSkipped: [], identityDoubts: [] };
  }
  const exercise = (cards: CardState[]): CardState[] => cardsOfExercise(cards, year, config.exercise.year);
  const before = exercise(foldEvents(input.baseCards, input.events));
  const after = exercise(boardAfter(input, plan));
  const beforeById = new Map(before.map((card) => [card.id, card]));
  const afterById = new Map(after.map((card) => [card.id, card]));
  const cardChanges = diffBoards(config, before, after);
  return {
    ...head, counts: countsOf(plan, cardChanges),
    entered: enteredOf(input, plan, perimeter), left: leftOf(plan, perimeter, beforeById),
    back: backOf(plan, perimeter, afterById), cardChanges, kept: factCards(plan, plan.factsKeptCards, afterById),
    replaced: factCards(plan, plan.replaced, afterById), advanced: advancedOf(plan, afterById),
    adopted: adoptedOf(plan), deletedSkipped: deletedOf(input, plan), identityDoubts: plan.identityDoubts,
  };
}
