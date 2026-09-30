// The domain lines of the fiche's Historique (author, 2026-09-30: « une
// ligne dans la fiche Historique quand quelqu'un assigne ou change un
// domaine à la main, oui, complètement »). Every `edited` event whose patch
// carries a domain is narrated: a hand assignment or change (the ADR 061
// banner, « Modifier », « Confirmer ce domaine ») reads « Domaine : Sans
// domaine → INFRA », a confirmation of the same domain « Domaine confirmé :
// INFRA »; an ADR 036 import decision says so (« Domaine remplacé par
// l'export (décision à l'import) : A&D → INFRA », « Domaine gardé
// (décision à l'import) : A&D »), and the import filling a card that had
// none (ADR 061 « fill », author 2026-09-30) « Domaine donné par l'export :
// Sans domaine → INFRA ». Names come from the config; an empty or
// undeclared domain reads « Sans domaine », a sub-domain « INFRA · Réseau ».
// « Confirmé » compares the domain ids, not the names; when a board.json
// change removed a domain or a sub-domain and both sides would read the
// same, the removed one is named by its id, « retiré du modèle ».
//
// The « from » is the domain the card had just before the event: the one
// the event itself recorded (`previous`, written by the middle since this
// change; `board` on an ADR 036 decision), else the value the card's
// earlier domain events left, walked in the fold order. The base card
// cannot be the start: each load rewrites its domain with the folded one,
// so after a reload it already holds the hand's value. A first domain
// event of an older log that recorded nothing reads « Domaine fixé : X ».
// Pure.

import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import type { DomainRef } from "./import-types.ts";
import { IMPORT_ACTOR } from "./gesture.ts";

/** The parts of an event the domain lines read (a stored event, or one a load is about to write). */
type EventParts = Pick<CardEvent, "type" | "actor" | "payload">;

/** One narrated domain line: the text, and a note (what the export proposed on a « garder »). */
export interface DomainLine {
  text: string;
  note: string | null;
}

const NO_DOMAIN = "Sans domaine";

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function refOf(value: unknown): DomainRef | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { domain, subDomain } = value as { domain?: unknown; subDomain?: unknown };
  if (typeof domain !== "string") return null;
  return { domain, subDomain: typeof subDomain === "string" ? subDomain : null };
}

function patchOf(event: EventParts): Record<string, unknown> | null {
  if (event.type !== "edited") return null;
  const patch = event.payload["patch"];
  return typeof patch === "object" && patch !== null && !Array.isArray(patch) ? (patch as Record<string, unknown>) : null;
}

// The domain the fold accepts from a patch (core/state.ts): a non-empty string.
function patchedDomain(patch: Record<string, unknown>): string | null {
  const value = patch["domain"];
  return hasOwn(patch, "domain") && typeof value === "string" && value.length > 0 ? value : null;
}

// The card's domain after a patch, as the fold applies it: the domain and
// the sub-domain each replaced only when the patch carries an accepted one.
function applied(current: DomainRef | null, patch: Record<string, unknown>): DomainRef | null {
  const domain = patchedDomain(patch) ?? current?.domain;
  if (domain === undefined) return null;
  const sub = patch["subDomain"];
  const subDomain = hasOwn(patch, "subDomain") && (typeof sub === "string" || sub === null) ? sub : (current?.subDomain ?? null);
  return { domain, subDomain };
}

/**
 * A domain as the fiche names it: the config's name, then « · » and the
 * sub-domain's name when that domain declares it; an empty or undeclared
 * domain is « Sans domaine » (ADR 061).
 * Inputs: the config, the domain reference. Output: the label. Failure: none.
 */
export function domainLabel(config: BoardConfig, ref: DomainRef): string {
  const domain = ref.domain === "" ? undefined : config.domains.find((entry) => entry.id === ref.domain);
  if (domain === undefined) return NO_DOMAIN;
  const sub = domain.subDomains?.find((entry) => entry.id === ref.subDomain);
  return sub === undefined ? domain.name : `${domain.name} · ${sub.name}`;
}

/**
 * Whether an event is the import filling the domain of a card that had
 * none (ADR 061 « fill »: the export resolves a domain, nothing to
 * arbitrate): an `edited` event of the import actor whose patch carries a
 * domain, with reason « export » and no ADR 036 decision. It is no human
 * decision — the ADR 036 reading of the log skips it.
 * Input: the event. Output: the answer. Failure modes: none.
 */
export function isDomainFill(event: EventParts): boolean {
  if (event.type !== "edited" || event.actor !== IMPORT_ACTOR || event.payload["reason"] !== "export") return false;
  const decision = event.payload["decision"];
  const patch = patchOf(event);
  return decision !== "garder" && decision !== "remplacer" && patch !== null && patchedDomain(patch) !== null;
}

// Where the event itself says the card stood: `previous` (a hand edit
// written since 2026-09-30, an import fill), `board` (an ADR 036
// decision); else null.
function recordedFrom(event: EventParts): DomainRef | null {
  const decision = event.payload["decision"];
  const isDecision = decision === "garder" || decision === "remplacer";
  return refOf(event.payload["previous"]) ?? (isDecision ? refOf(event.payload["board"]) : null);
}

function sameRef(a: DomainRef, b: DomainRef): boolean {
  return a.domain === b.domain && (a.subDomain ?? null) === (b.subDomain ?? null);
}

// A label that names what the model no longer declares: the raw id of a
// removed domain or sub-domain, said « retiré du modèle ». Used only where
// two different refs would otherwise read the same.
function qualifiedLabel(config: BoardConfig, ref: DomainRef): string {
  const domain = config.domains.find((entry) => entry.id === ref.domain);
  if (ref.domain === "") return NO_DOMAIN;
  if (domain === undefined) return `${NO_DOMAIN} (« ${ref.domain} », retiré du modèle)`;
  const declared = ref.subDomain === null || domain.subDomains?.some((entry) => entry.id === ref.subDomain) === true;
  return declared ? domainLabel(config, ref) : `${domain.name} · « ${ref.subDomain} » (retiré du modèle)`;
}

// The labels of a change: the config's names, qualified when two
// different refs would read the same (a config change removed one).
function changeLabels(config: BoardConfig, from: DomainRef, to: DomainRef): [string, string] {
  const source = domainLabel(config, from);
  const target = domainLabel(config, to);
  return source === target ? [qualifiedLabel(config, from), qualifiedLabel(config, to)] : [source, target];
}

// The sentence of an import fill: « Domaine donné par l’export : Sans domaine → INFRA ».
function fillText(config: BoardConfig, from: DomainRef | null, to: DomainRef): string {
  const [source, given] = from === null ? [NO_DOMAIN, domainLabel(config, to)] : changeLabels(config, from, to);
  return `Domaine donné par l’export : ${source} → ${given}`;
}

/**
 * The sentence of an import fill (ADR 061) as the fiche's Historique and
 * the import report say it: « Domaine donné par l’export : Sans domaine →
 * INFRA ». Inputs: the config (names), the event. Output: the sentence,
 * null when the event is not a fill (isDomainFill). Failure modes: none.
 */
export function domainFillText(config: BoardConfig, event: EventParts): string | null {
  const patch = isDomainFill(event) ? patchOf(event) : null;
  if (patch === null) return null;
  const from = recordedFrom(event);
  const to = applied(from, patch);
  return to === null ? null : fillText(config, from, to);
}

// The line of one domain event, from where the card stood (null = unknown).
// « Confirmé » is decided on the refs, never on the labels: an undeclared
// domain or sub-domain would make a real change read as a confirmation.
function lineOf(config: BoardConfig, event: CardEvent, from: DomainRef | null, to: DomainRef): DomainLine {
  const decision = event.payload["decision"];
  const target = domainLabel(config, to);
  if (isDomainFill(event)) return { text: fillText(config, from, to), note: null };
  if (decision === "garder") {
    const proposed = refOf(event.payload["proposed"]);
    return { text: `Domaine gardé (décision à l’import) : ${target}`, note: proposed === null ? null : `l’export proposait ${domainLabel(config, proposed)}` };
  }
  if (decision === "remplacer") {
    const [source, replaced] = from === null ? [NO_DOMAIN, target] : changeLabels(config, from, to);
    return { text: `Domaine remplacé par l’export (décision à l’import) : ${source} → ${replaced}`, note: null };
  }
  if (from === null) return { text: `Domaine fixé : ${target}`, note: null };
  if (sameRef(from, to)) return { text: `Domaine confirmé : ${target}`, note: null };
  const [source, changed] = changeLabels(config, from, to);
  return { text: `Domaine : ${source} → ${changed}`, note: null };
}

/**
 * The domain lines of ONE card's events. Every `edited` event whose patch
 * carries an accepted domain gets a line (hand assignment, change or
 * confirmation; ADR 036 « garder » / « remplacer »; an import fill of a
 * card without domain, ADR 061 « Domaine donné par l’export »); other events get
 * none, but a patch carrying only a sub-domain still moves the walk on.
 * Inputs: the card's events in the fold order, OLDEST first
 * (core/fold-order.ts), the config (names). Output: event -> its line.
 * Failure modes: none — malformed payloads are skipped as the fold skips them.
 */
export function domainLines(ordered: readonly CardEvent[], config: BoardConfig): Map<CardEvent, DomainLine> {
  const lines = new Map<CardEvent, DomainLine>();
  let current: DomainRef | null = null;
  for (const event of ordered) {
    const patch = patchOf(event);
    if (patch === null) continue;
    const from = recordedFrom(event) ?? current;
    const to = applied(from, patch);
    if (to === null) continue;
    if (patchedDomain(patch) !== null) lines.set(event, lineOf(config, event, from, to));
    current = to;
  }
  return lines;
}

/**
 * What a hand `edited` event records beside its patch so that the
 * Historique can say where the domain came from: `previous`, the card's
 * domain and sub-domain just before the edit — only when the patch
 * carries a domain or a sub-domain.
 * Inputs: the card as the server folds it now, the validated patch.
 * Output: `{ previous }` to spread into the payload, or `{}`. Failure: none.
 */
export function domainPrevious(
  state: Pick<CardState, "domain" | "subDomain">, patch: Record<string, unknown>,
): { previous?: DomainRef } {
  if (!hasOwn(patch, "domain") && !hasOwn(patch, "subDomain")) return {};
  return { previous: { domain: state.domain, subDomain: state.subDomain } };
}
