// Import from the tool (ADR 027): the audit and the load of a PMO export
// set over HTTP. Unauthenticated like the rest of the write API until RP3
// (author's decision, 2026-09-08: network access to the VM is the barrier;
// a shared secret was too technical for the handover). The files travel
// base64-encoded in JSON; the middle runs the same audit and load as
// sync/import.ts (adapters/csv-import), so the report the PMO reads in the
// tool is the report the CLI writes. The import targets ONE exercise
// (ADR 035) and the audit lists the domain conflicts a load would raise
// (ADR 036): the load carries the PMO's decisions, one per conflict, and
// is refused while one is missing. Both return the readable report of
// ADR 055 (`changes`): the audit says what the load WOULD change on the
// board and why, the load what it DID — one import mode. Loads run one
// at a time, queued with every other board write (ADR 058: two concurrent
// loads would both read the board before either wrote, and both create
// every card). ADR 062: both routes take the PMO's answers to the
// « Doutes à trancher » (import-choices.ts) and return every decidable
// doubt; the memory of the choices is the log, read BEFORE the audit so
// the load applies them to the same deck the audit showed; the load
// traces each answer sent (a `settled` event) in its own batch. Logs
// carry counts only.

import { win32 } from "node:path";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig, Card, CardEvent } from "../core/types.ts";
import type { DomainDecision, ImportAuditResult, ImportChoice, ImportDoubt, ImportLoadResult, ImportSummary } from "../core/import-types.ts";
import {
  bookInput, checkChoices, createDoubtBook, importChanges, keepStoredCapacity, loadRefusal, planLoad, renderReport, runImportAudit,
  settledEvents, withEventReasons, withLegacyIds,
} from "../adapters/csv-import/index.ts";
import type { AuditResult, DoubtBook, EnrichedCard, InputFile, LoadPlan } from "../adapters/csv-import/index.ts";
import { BadRequest } from "./errors.ts";
import { exerciseOrCurrent } from "./validation.ts";
import { SERVER_ACTOR, serializedWrite } from "./api.ts";

/** What a load lets the caller do around its write. */
export interface LoadHooks {
  /** Runs once the load is accepted (audit read, conflicts decided), right before anything is written — the automatic snapshot (ADR 042). */
  beforeWrite?: () => Promise<void>;
}

const MAX_FILES = 12;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NAME = 200;

// One file entry of the body: a safe name (no path — both separators are
// stripped whatever the server OS, browsers on Windows may send one) and
// decoded bytes.
function parseFile(raw: unknown, index: number): InputFile {
  if (typeof raw !== "object" || raw === null) throw new BadRequest(`Fichier ${index + 1} invalide.`);
  const { name, base64 } = raw as { name?: unknown; base64?: unknown };
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_NAME) {
    throw new BadRequest(`Fichier ${index + 1} : nom manquant ou trop long.`);
  }
  if (typeof base64 !== "string") throw new BadRequest(`Fichier ${index + 1} : contenu manquant.`);
  if (base64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) {
    throw new BadRequest(`Fichier « ${win32.basename(name)} » trop volumineux (20 Mo max).`);
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new BadRequest(`Fichier « ${win32.basename(name)} » vide ou illisible.`);
  return { name: win32.basename(name.trim()), bytes: new Uint8Array(bytes) };
}

/**
 * Parses the request body into the audit's input files.
 * Input: the JSON body ({ files: [{ name, base64 }] }). Output: the files.
 * Failure: BadRequest (French) on a missing list, too many files, a bad
 * entry, an oversized or empty file.
 */
export function parseFiles(body: unknown): InputFile[] {
  const files = typeof body === "object" && body !== null ? (body as { files?: unknown }).files : undefined;
  if (!Array.isArray(files) || files.length === 0) throw new BadRequest("Aucun fichier reçu.");
  if (files.length > MAX_FILES) throw new BadRequest(`Trop de fichiers (${MAX_FILES} max).`);
  return files.map(parseFile);
}

/**
 * The exercise year an import request names (`exercise` in the body), or
 * the current one when absent (ADR 035).
 * Inputs: the JSON body, the runtime config. Output: the year.
 * Failure: BadRequest (French) when the value is not a whole year.
 */
export function parseExercise(body: unknown, config: BoardConfig): number {
  const raw = typeof body === "object" && body !== null ? (body as { exercise?: unknown }).exercise : undefined;
  return exerciseOrCurrent(raw, config);
}

/**
 * The PMO's domain decisions of a load request (`decisions` in the body:
 * card id -> « garder » | « remplacer », ADR 036); none when absent.
 * Inputs: the JSON body. Output: the decisions by card id.
 * Failure: BadRequest (French) on a value that is neither word.
 */
export function parseDecisions(body: unknown): Map<string, DomainDecision> {
  const raw = typeof body === "object" && body !== null ? (body as { decisions?: unknown }).decisions : undefined;
  const decisions = new Map<string, DomainDecision>();
  if (raw === undefined) return decisions;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new BadRequest("Décisions de domaine invalides.");
  for (const [cardId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value !== "garder" && value !== "remplacer") {
      throw new BadRequest(`Décision invalide pour « ${cardId} » (garder ou remplacer).`);
    }
    decisions.set(cardId, value);
  }
  return decisions;
}

// The cards a load may write, or the refusal (BadRequest, French) — the
// rule the audit previews with (loadRefusal).
function loadableDeck(audit: AuditResult, year: number, config: BoardConfig): EnrichedCard[] {
  const refusal = loadRefusal(audit, year, config.exercise.year);
  if (refusal !== null || audit.cards === null) throw new BadRequest(refusal ?? "Chargement refusé.");
  return audit.cards.cards;
}

function summarize(audit: AuditResult): ImportSummary {
  const { report } = audit;
  return {
    received: report.inventory.length,
    recognized: report.inventory.filter((f) => f.status === "recognized" || f.status === "recognized-with-deviations").length,
    taken: report.taken.length,
    discarded: report.discarded.length,
    doubtful: report.doubtful.length,
    warnings: report.warnings.length,
    missing: report.missingExpected.map((m) => m.name),
  };
}

/** The board as an import reads it: the log (its memory of the choices, ADR 062) and the base cards — read ONCE, before the audit. */
interface BoardRead {
  events: CardEvent[];
  baseCards: Card[];
}

async function readBoardOnce(storage: BoardStorage): Promise<BoardRead> {
  const [events, baseCards] = await Promise.all([storage.listEvents(), storage.listBaseCards()]);
  return { events, baseCards };
}

// The audit of the files with the request's choices and the log's memory
// (ADR 062): the same files, choices and log give the same deck.
function auditWith(
  files: InputFile[], config: BoardConfig, now: Date, year: number, choices: ReadonlyMap<string, ImportChoice>, board: BoardRead,
): AuditResult {
  return runImportAudit(files, config, now, year, createDoubtBook(bookInput(year, choices, board.events)));
}

// The doubts once the plan chose the board ids (aliases, adoptions); an
// option a doubt does not offer is a French 400, a choice whose doubt
// vanished (another answer took it away) is ignored and said (ADR 062).
function settledDoubts(book: DoubtBook, plan: LoadPlan | null, choices: ReadonlyMap<string, ImportChoice>): { doubts: ImportDoubt[]; ignored: string[] } {
  if (plan !== null) book.remapCards(plan.aliases);
  const doubts = book.list();
  const { problem, ignored } = checkChoices(doubts, choices);
  if (problem !== null) throw new BadRequest(problem);
  return { doubts, ignored };
}

// The conflicts a load would raise, the facts it would keep, what it
// would change and the doubts it would settle, read without writing: the
// audit is a dry run of the plan against the exercise's stored cards (ADR
// 036, 054, 055, 062). Files the load would refuse (loadRefusal) preview
// nothing: no card would be written, none marked absent.
function dryRun(
  config: BoardConfig, audit: AuditResult, now: Date, year: number, refused: boolean, board: BoardRead,
  choices: ReadonlyMap<string, ImportChoice>,
): Pick<ImportAuditResult, "conflicts" | "factsKept" | "changes" | "doubts" | "ignoredChoices"> {
  const { events, baseCards } = board;
  const plan = refused || audit.cards === null ? null : planLoad(audit.cards.cards, config, baseCards, events, now, year, new Map(), audit.book);
  const { doubts, ignored } = settledDoubts(audit.book, plan, choices);
  const changes = importChanges({ audit, config, year, plan, baseCards, events, doubts });
  const conflicts = plan === null ? [] : plan.domainConflicts.map(({ decision: _decision, ...conflict }) => conflict);
  return { conflicts, factsKept: plan?.factsKept ?? [], changes, doubts, ignoredChoices: ignored };
}

/**
 * Runs the audit over the received files — nothing is written — and lists
 * the domain conflicts a load would raise against the board (ADR 036),
 * the readable report of what it would change (ADR 055) and the « Doutes
 * à trancher » with the choice each would take (ADR 062).
 * Inputs: the storage (read only), the runtime config, the files, now, the
 * exercise year read (default: the current one, ADR 035), the PMO's
 * choices to preview (default none: the remembered choices and the
 * proposals). Output: the rendered report (Markdown, French), its counts,
 * whether a load would be accepted and else why (loadRefusal — the load's
 * own rule), the conflicts, the facts kept, the changes, the doubts.
 * Failure: BadRequest (French) when a choice names an option its doubt
 * does not offer (a choice whose doubt vanished is ignored, listed in
 * `ignoredChoices`); every other anomaly lands in the report; storage
 * errors propagate (→ 500).
 */
export async function auditImport(
  storage: BoardStorage, config: BoardConfig, files: InputFile[], now: Date, year: number = config.exercise.year,
  choices: ReadonlyMap<string, ImportChoice> = new Map(),
): Promise<ImportAuditResult> {
  const board = await readBoardOnce(storage);
  const audit = auditWith(files, config, now, year, choices, board);
  const refusal = loadRefusal(audit, year, config.exercise.year);
  const dry = dryRun(config, audit, now, year, refusal !== null, board, choices);
  return {
    exercise: year, report: renderReport(audit.report, now), summary: summarize(audit),
    loadable: refusal === null, refusal, ...dry,
  };
}

// What the load wrote, for the response and the log.
function loadFigures(plan: LoadPlan, audit: AuditResult, settled: number): ImportLoadResult["load"] {
  return {
    created: plan.created, updated: plan.updated, moved: plan.moved,
    unlisted: plan.unlisted, relisted: plan.relisted,
    divergences: plan.divergences.length, kept: plan.kept, chargesWithoutProfile: plan.chargesWithoutProfile,
    domainReplaced: plan.domainReplaced, domainKept: plan.domainKept, domainKeptByPrior: plan.domainKeptByPrior,
    deletedSkipped: plan.deletedSkipped.length, adopted: plan.adopted.length,
    replaced: new Set(plan.replaced.flatMap((fact) => fact.cardIds)).size, advanced: plan.advanced.length, paused: plan.paused.length,
    settled,
    capacity: audit.capacity === null ? null
      : { persons: audit.capacity.snapshot.persons.length, assignments: audit.capacity.snapshot.assignments.length },
  };
}

/** What a load takes besides the files: the domain decisions (ADR 036) and the doubts' choices (ADR 062). */
export interface LoadAnswers {
  decisions?: ReadonlyMap<string, DomainDecision>;
  choices?: ReadonlyMap<string, ImportChoice>;
}

/**
 * Re-runs the audit and loads the assembled deck into ONE exercise's
 * board: cards and events in one batch — with one `settled` event per
 * doubt the request answered (ADR 062: who, when, which option, sticky or
 * not; the proposals left untouched write nothing) — then that year's
 * capacity snapshot when the files carried one. The other years' cards
 * are never read nor written (ADR 035). Every domain conflict must carry
 * a decision (ADR 036): the load is refused otherwise, before anything is
 * written. The doubts never block.
 * Inputs: the storage, the runtime config, the files, now, the exercise
 * year (default: the current one), the answers (domain decisions by card
 * id, choices by doubt id), the hooks.
 * Output: the audit result plus what the load wrote; `changes` says what
 * it changed on the board, card by card (ADR 055), `doubts` how each
 * doubt was settled.
 * The whole read-plan-write runs serialized with the other board writes
 * (serializedWrite, ADR 058): a second load reads what the first wrote.
 * Failure: BadRequest on a closed year (below the current one), when no
 * card assembled (no `projets` file), when no project is retained on that
 * year (the files of another exercise), when a conflict is undecided or
 * a choice names an option its doubt does not offer; storage errors propagate
 * (→ 500), nothing partially written for cards.
 */
export function loadImport(
  storage: BoardStorage, config: BoardConfig, files: InputFile[], now: Date,
  year: number = config.exercise.year, answers: LoadAnswers = {}, hooks: LoadHooks = {},
): Promise<ImportLoadResult> {
  return serializedWrite(() => loadNow(storage, config, files, now, year, answers, hooks));
}

// One load, alone on the board (the queue above).
async function loadNow(
  storage: BoardStorage, config: BoardConfig, files: InputFile[], now: Date, year: number, answers: LoadAnswers, hooks: LoadHooks,
): Promise<ImportLoadResult> {
  if (year < config.exercise.year) throw new BadRequest(`Exercice ${year} clos : chargement refusé.`); // before reading the files
  const choices = answers.choices ?? new Map<string, ImportChoice>();
  const board = await readBoardOnce(storage);
  const audit = auditWith(files, config, now, year, choices, board);
  const deck = loadableDeck(audit, year, config);
  const { events, baseCards } = board;
  const plan = planLoad(deck, config, baseCards, events, now, year, answers.decisions ?? new Map(), audit.book);
  const { doubts, ignored } = settledDoubts(audit.book, plan, choices);
  const changes = importChanges({ audit, config, year, plan, baseCards, events, doubts });
  if (plan.domainUndecided > 0) {
    throw new BadRequest(`Chargement refusé : ${plan.domainUndecided} conflit(s) de domaine sans décision (garder ou remplacer).`);
  }
  if (hooks.beforeWrite !== undefined) await hooks.beforeWrite();
  const settled = settledEvents(doubts, choices, audit.book, SERVER_ACTOR, now.toISOString());
  // Each entry, exit and return carries its reason into the log (the fiche's Historique); each answer to a doubt is traced.
  await storage.importCards(plan.cards, [...withEventReasons(plan.events, changes), ...settled]);
  if (audit.capacity !== null) {
    const fresh = withLegacyIds(audit.capacity.snapshot, plan.aliases);
    await storage.importCapacity(keepStoredCapacity(fresh, await storage.getCapacity(year)));
  }
  logLoad(now, year, plan, doubts.length, settled.length);
  return {
    exercise: year, report: renderReport(audit.report, now), summary: summarize(audit), loadable: true, refusal: null,
    conflicts: plan.domainConflicts, factsKept: plan.factsKept, changes, doubts, ignoredChoices: ignored, load: loadFigures(plan, audit, settled.length),
  };
}

// The load's console line: counts only, never a title nor a figure.
function logLoad(now: Date, year: number, plan: LoadPlan, doubts: number, settled: number): void {
  console.log(
    `${now.toISOString()} import (outil, exercice ${year}) : ${plan.created} créée(s), ${plan.updated} mise(s) à jour, ` +
      `${plan.moved} déplacée(s), ${plan.unlisted} absente(s), ${plan.relisted} de retour, ` +
      `domaines ${plan.domainReplaced} remplacé(s) / ${plan.domainKept} gardé(s), ` +
      `${plan.deletedSkipped.length} supprimée(s) du tableau ignorée(s), ${plan.adopted.length} adoptée(s), ` +
      `${new Set(plan.replaced.flatMap((fact) => fact.cardIds)).size} correction(s) manuelle(s) remplacée(s), ` +
      `${plan.advanced.length} placement(s) à la main dépassé(s) par un nouveau jalon, ${plan.paused.length} en pause (jalon non appliqué), ` +
      `${doubts} doute(s) à trancher dont ${settled} réponse(s) tracée(s)` +
      plan.factsKept.map((f) => ` · ${f.label} gardé (absent des fichiers) : ${f.cards}`).join(""),
  );
}
