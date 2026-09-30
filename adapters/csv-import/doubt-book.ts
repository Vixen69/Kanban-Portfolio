// The book of the « Doutes à trancher » (ADR 062): every reader that meets
// a decidable doubt asks the book which option to apply, and the book
// answers — the PMO's choice sent with this request, else a choice
// remembered with « ne plus me demander » while the doubt is the same
// (same project, same kind, same competing values: the fingerprint), else
// the tool's own proposal (today's behaviour). The book records each
// doubt with its options and how it was settled; the audit returns them,
// the load traces the choices (doubt-memory.ts). One book per audit or
// load, so the same files and the same choices always give the same deck.
// Pure.

import type { ImportDoubt, ImportDoubtHow, ImportDoubtKind, ImportDoubtOption } from "../../core/import-doubts.ts";
import { fnv1a } from "./hash.ts";
import { projectInstanceId } from "./card-identity.ts";
import { normalizeLabel } from "./normalize.ts";

/** One option as a reader proposes it. */
export interface DoubtOptionSpec {
  /** Stable, content-derived (never a line number). */
  id: string;
  label: string;
  consequence?: string | null;
  /** The words written in the log for this option, when the label carries a person's name (ADR 062: names never enter the log). */
  trace?: string;
}

/** A doubt as a reader raises it. */
export interface DoubtSpec {
  kind: ImportDoubtKind;
  /** What the doubt is on, inside the project: the fact, the file, the column. */
  detail: string;
  code: string | null;
  /** The project's normalized name: its key when it has no code. */
  name: string;
  title: string;
  why: string;
  options: DoubtOptionSpec[];
  proposed: string;
  /** The board card, when the reader knows it (identity doubts); else the would-be « code@année ». */
  cardId?: string;
  /** Extra material of the fingerprint: what makes the doubt « the same » beyond its options (the raw cell, the titles). */
  evidence?: readonly string[];
  /**
   * Set on the doubts of a side file (Jalons, SP, CdP duplicates): the
   * codes and names the row answers to — the doubt is kept only when a
   * card of the deck carries one of them (keepSideDoubts).
   */
  joinKeys?: readonly string[];
}

/** A choice the log remembers for a doubt (doubt-memory.ts). */
export interface RememberedChoice {
  option: string;
  sticky: boolean;
  fingerprint: string;
  ts: string;
  /** Who wrote the choice (the `settled` event's actor). */
  actor: string;
}

/** What a book starts from. */
export interface BookInput {
  year: number;
  /** The request's choices: doubt id → option id. */
  choices?: ReadonlyMap<string, string>;
  /** The doubts the request asks to ask again (« Redemander »): their memory is ignored. */
  forgotten?: ReadonlySet<string>;
  /** The log's last word per doubt (doubt-memory.ts rememberedChoices). */
  memory?: ReadonlyMap<string, RememberedChoice>;
}

/** The book of one audit or load. */
export interface DoubtBook {
  readonly year: number;
  /** Records the doubt (once per id) and returns the option to apply. */
  ask(spec: DoubtSpec): string;
  /** The doubts recorded, sorted by kind, code, id; the proposed option first in each. */
  list(): ImportDoubt[];
  /** Drops the side-file doubts no deck card answers to (keys normalized like normalizeLabel). */
  keepSideDoubts(keys: ReadonlySet<string>): void;
  /** Maps the would-be card ids onto the board ids the load chose (plan.aliases). */
  remapCards(aliases: ReadonlyMap<string, string>): void;
  /** The words the log keeps for one option of one doubt (its trace, else its label). */
  traceLabel(doubtId: string, optionId: string): string;
}

const KIND_ORDER: readonly ImportDoubtKind[] = ["couts-fact", "me-unreadable", "duplicate-row", "join", "figure", "identity"];

interface Entry {
  doubt: ImportDoubt;
  joinKeys: string[] | null;
  traces: Map<string, string>;
}

/**
 * A doubt's id, stable across imports: kind, exercise, project key (the
 * code, else « nom:<normalized name> »), detail.
 * Inputs: the spec, the year. Output: the id. Failure modes: none.
 */
export function doubtId(spec: Pick<DoubtSpec, "kind" | "code" | "name" | "detail">, year: number): string {
  return `${spec.kind}|${year}|${spec.code ?? `nom:${spec.name}`}|${spec.detail}`;
}

/**
 * The fingerprint of a doubt: its kind, id, sorted option ids and
 * evidence — the same competing values give the same fingerprint, a
 * changed doubt another (a remembered choice then no longer applies).
 * Inputs: the id, the spec. Output: 8 hex digits. Failure modes: none.
 */
export function doubtFingerprint(id: string, spec: Pick<DoubtSpec, "kind" | "options" | "evidence">): string {
  const options = spec.options.map((o) => o.id).sort();
  const evidence = [...(spec.evidence ?? [])].sort();
  return fnv1a([spec.kind, id, ...options, "\u001e", ...evidence].join("\u001f"));
}

/**
 * The option a reader applies: the book's answer, or the proposal when the
 * reader runs without a book (unit tests, callers that predate ADR 062).
 * Inputs: the book (optional), the spec. Output: an option id. Failure: none.
 */
export function askOrPropose(book: DoubtBook | undefined, spec: DoubtSpec): string {
  return book === undefined ? spec.proposed : book.ask(spec);
}

// The proposed option first, the others as the reader listed them, one per id.
function orderedOptions(spec: DoubtSpec): ImportDoubtOption[] {
  const seen = new Set<string>();
  const options: ImportDoubtOption[] = [];
  const first = spec.options.filter((o) => o.id === spec.proposed);
  for (const o of [...first, ...spec.options.filter((x) => x.id !== spec.proposed)]) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    options.push({ id: o.id, label: o.label, consequence: o.consequence ?? null });
  }
  return options;
}

// The applied option and how it came: the request, else the valid memory, else the proposal.
function settle(input: BookInput, id: string, fingerprint: string, ids: ReadonlySet<string>, proposed: string): Pick<ImportDoubt, "applied" | "how" | "remembered"> {
  const memory = input.forgotten?.has(id) === true ? undefined : input.memory?.get(id);
  const valid = memory !== undefined && memory.sticky && memory.fingerprint === fingerprint && ids.has(memory.option);
  const remembered = valid ? { option: memory.option, ts: memory.ts, actor: memory.actor } : null;
  const asked = input.choices?.get(id);
  if (asked !== undefined && ids.has(asked)) return { applied: asked, how: "choisi", remembered };
  if (remembered !== null) return { applied: remembered.option, how: "mémorisé", remembered };
  return { applied: proposed, how: "proposé" as ImportDoubtHow, remembered };
}

function compareDoubts(a: ImportDoubt, b: ImportDoubt): number {
  const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (kind !== 0) return kind;
  const code = (a.code ?? a.title).localeCompare(b.code ?? b.title, "fr");
  return code !== 0 ? code : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function record(input: BookInput, spec: DoubtSpec): Entry | null {
  const options = orderedOptions(spec);
  const ids = new Set(options.map((o) => o.id));
  if (options.length < 2 || !ids.has(spec.proposed)) return null; // nothing to decide
  const id = doubtId(spec, input.year);
  const fingerprint = doubtFingerprint(id, spec);
  const doubt: ImportDoubt = {
    id, kind: spec.kind, cardId: spec.cardId ?? projectInstanceId(spec.code, spec.name, input.year),
    code: spec.code, title: spec.title, why: spec.why, options, proposed: spec.proposed,
    ...settle(input, id, fingerprint, ids, spec.proposed), fingerprint,
  };
  const traces = new Map(spec.options.map((o) => [o.id, o.trace ?? o.label]));
  return { doubt, joinKeys: spec.joinKeys === undefined ? null : spec.joinKeys.map(normalizeLabel), traces };
}

/**
 * Creates the book of one audit or load.
 * Input: the year, the request's choices and forgotten doubts, the
 * remembered choices. Output: the DoubtBook. Failure modes: none — a
 * doubt with fewer than two options, or whose proposal is not one of
 * them, is not recorded (the proposal applies).
 */
export function createDoubtBook(input: BookInput): DoubtBook {
  const entries = new Map<string, Entry>();
  return {
    year: input.year,
    ask(spec) {
      const known = entries.get(doubtId(spec, input.year));
      if (known !== undefined) return known.doubt.applied;
      const entry = record(input, spec);
      if (entry === null) return spec.proposed;
      entries.set(entry.doubt.id, entry);
      return entry.doubt.applied;
    },
    list: () => [...entries.values()].map((e) => ({ ...e.doubt, options: [...e.doubt.options] })).sort(compareDoubts),
    keepSideDoubts(keys) {
      for (const [id, e] of entries) if (e.joinKeys !== null && !e.joinKeys.some((k) => keys.has(k))) entries.delete(id);
    },
    remapCards(aliases) {
      for (const e of entries.values()) e.doubt.cardId = aliases.get(e.doubt.cardId) ?? e.doubt.cardId;
    },
    traceLabel: (id, option) => entries.get(id)?.traces.get(option) ?? option,
  };
}
