// The readable import report (ADR 055) as compact French text for the
// import CLI: the files taken, the perimeter and what it left out, the
// counts, the projects entering / leaving / back with their reasons, the
// refreshed values grouped by fact, the facts kept from the board, the
// hand-made cards the export adopts (ADR 059 — two cards become one: each
// is said with both titles), the cards deleted on the board it skips and
// the identity questions, the hand corrections and placements a NEW export
// value took back (ADR 060) and the cards left in Pause. The same
// ImportChanges object the tool shows; only the wording lives here — plus
// the load summary of --charger (loadText, from the load plan).

import type { BoardConfig } from "../core/types.ts";
import type { ImportChanges, ImportKeptFact, ImportLeft } from "../core/import-types.ts";
import type { CardChange } from "../core/snapshot-diff.ts";
import { FIGURE_FACTS } from "../core/snapshot-diff.ts";
import { domainName } from "../core/domain-check.ts";
import type { LoadPlan } from "../adapters/csv-import/index.ts";

/** The longest list printed in full; beyond, the rest is counted. */
const CAP = 25;

function capped(lines: string[]): string[] {
  return lines.length <= CAP ? lines : [...lines.slice(0, CAP), `  … (+${lines.length - CAP})`];
}

function num(value: number | null): string {
  return value === null ? "—" : String(Math.round(value * 100) / 100).replace(".", ",");
}

function signed(value: number | null): string {
  if (value === null) return "";
  return ` (${value > 0 ? "+" : ""}${num(value)})`;
}

function named(entry: { code: string | null; title: string }): string {
  return entry.code === null ? `« ${entry.title} »` : `${entry.code} « ${entry.title} »`;
}

// Ids into the config's words: « Actifs · Projets », a domain, a type.
function words(config: BoardConfig, change: CardChange, value: string | null): string {
  // A domain "" is a card without domain (ADR 061): « Sans domaine », not a dash.
  if (change.kind === "domain" && value !== null) return domainName(config, value);
  if (value === null || value === "") return "—";
  if (change.kind === "type") return config.types.find((t) => t.id === value)?.name ?? value;
  if (change.kind !== "moved") return value;
  const [columnId, laneId] = value.split("|");
  const column = config.columns.find((c) => c.id === columnId)?.name ?? columnId ?? "?";
  return laneId === undefined ? column : `${column} · ${config.lanes.find((l) => l.id === laneId)?.name ?? laneId}`;
}

const FACT_WORDS: Partial<Record<CardChange["kind"], string>> = {
  moved: "position", domain: "domaine", type: "type", title: "titre", owner: "chef de projet",
  dateRdr: "date RDR", plan: "plan de charge j.h", archived: "archivées", unarchived: "désarchivées",
};

// The group a change is read under, and its one line.
function factOf(change: CardChange): string {
  if (change.kind !== "figure") return FACT_WORDS[change.kind] ?? change.kind;
  const spec = FIGURE_FACTS.find((f) => f.fact === change.figure.fact);
  return `${spec?.label ?? change.figure.fact} ${change.figure.unit}`;
}

function changeLine(config: BoardConfig, change: CardChange): string {
  const who = named({ code: change.codename, title: change.title });
  if (change.kind === "figure") return `${who} : ${num(change.figure.before)} → ${num(change.figure.after)}${signed(change.figure.delta)}`;
  if (change.kind === "plan") {
    const { before, after } = change.plan;
    const metiers = change.plan.profiles.map((p) => `${config.profiles.find((x) => x.id === p.profileId)?.name ?? p.profileId} RAF ${num(p.before.raf)} → ${num(p.after.raf)}`);
    return `${who} : prévu ${num(before.planned)} → ${num(after.planned)} · fait ${num(before.done)} → ${num(after.done)}` +
      ` · RAF ${num(before.raf)} → ${num(after.raf)}${signed(after.raf - before.raf)} [${metiers.join(" ; ")}]`;
  }
  if (change.from === null && change.to === null) return who;
  return `${who} : ${words(config, change, change.from)} → ${words(config, change, change.to)}`;
}

/** The kinds the entered / left / back lists already say. */
const LISTED: ReadonlySet<CardChange["kind"]> = new Set(["added", "absent", "back", "removed"]);

function byFact(config: BoardConfig, changes: CardChange[]): string[] {
  const groups = new Map<string, string[]>();
  for (const change of changes) {
    if (LISTED.has(change.kind)) continue;
    const fact = factOf(change);
    groups.set(fact, [...(groups.get(fact) ?? []), `    ${changeLine(config, change)}`]);
  }
  return [...groups].flatMap(([fact, lines]) => [`  ${fact} (${lines.length}) :`, ...capped(lines)]);
}

function section(title: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : [title, ...capped(lines)];
}

// One line per fact: its label, how many cards, the cards by code.
function factLines(facts: ImportKeptFact[]): string[] {
  return facts.map((k) => `  ${k.label} (${k.cards.length}) : ${k.cards.slice(0, CAP).map((card) => card.code ?? card.title).join(", ")}` +
    (k.cards.length > CAP ? ` … (+${k.cards.length - CAP})` : ""));
}

function columnName(config: BoardConfig, columnId: string): string {
  return config.columns.find((c) => c.id === columnId)?.name ?? columnId;
}

function reasonLines(mark: string, list: ImportLeft[]): string[] {
  return list.map((entry) => `  ${mark} ${named(entry)} — ${entry.reason}`);
}

/**
 * The files and the perimeter: what the audit read, whatever the board.
 * Input: the changes. Output: the text lines (French). Failure: none.
 */
export function filesText(changes: ImportChanges): string[] {
  const files = changes.files.map((f) =>
    `  ${f.status.padEnd(8)} ${f.label}${f.file === null ? "" : ` ← ${f.file}`}${f.consequence === null ? "" : ` — ${f.consequence}`}` +
    (f.others.length === 0 ? "" : ` (non lus : ${f.others.join(", ")})`));
  const unknown = changes.unrecognized.map((u) => `  inconnu  ${u.file} — ${u.detail}`);
  const p = changes.perimeter;
  const perimeter = p.source === null ? ["Périmètre : aucun fichier de périmètre"]
    : [`Périmètre ${p.source} (${p.file ?? "?"}) : ${p.retained} projet(s) retenu(s), ${p.excluded.length} écarté(s)`,
      ...capped(p.excluded.map((x) => `  écarté ${x.code} « ${x.name} » — ${x.reason}`))];
  return ["Fichiers :", ...files, ...unknown, ...perimeter];
}

/** How a card in Pause a jalon would move is said (ADR 060 amendment). */
const PAUSED_WORDS = "en pause — nouveau jalon non appliqué";

/** How a card a new Sciforma done state took out of Pause is said, card by card (ADR 060, 2026-09-30); the summary counts them « sortie(s) de Pause (état Sciforma terminé) », as the server log does. */
const UNPAUSED_WORDS = "sorti de Pause : état Sciforma terminé";

/** The load plan's parts the CLI's load summary reads (adapters/csv-import LoadPlan). */
export type LoadTextInput = Pick<LoadPlan,
  "created" | "updated" | "moved" | "advanced" | "paused" | "unpaused" | "replaced" | "unlisted" | "relisted" | "kept" |
  "domainReplaced" | "domainKept" | "divergences" | "factsKept" | "adopted" | "deletedSkipped" | "identityDoubts">;

// The divergences left in place, the cards in Pause said as such (ADR 060 amendment).
function divergenceLines(plan: LoadTextInput, config: BoardConfig): string[] {
  if (plan.divergences.length === 0) return [];
  const paused = (d: LoadTextInput["divergences"][number]): boolean =>
    plan.paused.some((p) => p.title === d.title && p.fromColumn === d.fromColumn && p.toColumn === d.toColumn);
  return [`Divergences non appliquées (cartes placées à la main, ou en pause) : ${plan.divergences.length}`,
    ...plan.divergences.slice(0, 5).map((d) =>
      `  · « ${d.title} » : tableau ${columnName(config, d.fromColumn)} / export ${columnName(config, d.toColumn)}` +
      (paused(d) ? ` — ${PAUSED_WORDS}` : ""))];
}

/**
 * The summary of what a load wrote (--charger), from its plan: the counts,
 * then the ADR 058/059/060 outcomes — adopted hand cards, deleted cards
 * skipped, identity doubts, hand corrections replaced, hand placements
 * overtaken, cards left in Pause or taken out of it by a Sciforma done
 * state — and the divergences.
 * Inputs: the plan, the config (column names). Output: the text lines
 * (French). Failure: none.
 */
export function loadText(plan: LoadTextInput, config: BoardConfig): string[] {
  const replaced = new Set(plan.replaced.flatMap((f) => f.cardIds)).size;
  const head = `chargement : ${plan.created} carte(s) créée(s) · ${plan.updated} relue(s)` +
    ` · ${plan.moved} déplacée(s) par l'export (dont ${plan.advanced.length} placée(s) à la main, dépassée(s) par un nouveau jalon)` +
    ` · ${replaced} correction(s) manuelle(s) remplacée(s) par la nouvelle valeur de l'export` +
    ` · ${plan.unlisted} absente(s) de l'export (marquées, jamais supprimées) · ${plan.relisted} de retour` +
    ` · ${plan.kept} position(s) conservée(s) (export sans jalon)` +
    ` · domaines : ${plan.domainReplaced} remplacé(s), ${plan.domainKept} gardé(s)`;
  const outcomes = `adoptées (saisies à la main) : ${plan.adopted.length} · supprimées du tableau, ignorées : ${plan.deletedSkipped.length}` +
    ` · doutes d'identité : ${plan.identityDoubts.length} · en pause, jalon non appliqué : ${plan.paused.length}` +
    ` · sortie(s) de Pause (état Sciforma terminé) : ${plan.unpaused.length}`;
  const kept = plan.factsKept.length === 0 ? []
    : [`Absents des fichiers, gardés du tableau (ADR 054) : ${plan.factsKept.map((f) => `${f.label} ${f.cards} carte(s)`).join(" · ")}`];
  return [head, outcomes, ...divergenceLines(plan, config), ...kept];
}

// « from → to » in the config's column names.
function transition(config: BoardConfig, a: { fromColumn: string; toColumn: string }): string {
  return `${columnName(config, a.fromColumn)} → ${columnName(config, a.toColumn)}`;
}

/**
 * What the load changes (or changed) on the board, from the changes.
 * Inputs: the changes, the config (column, domain, type, métier names).
 * Output: the text lines (French). Failure: none.
 */
export function boardText(changes: ImportChanges, config: BoardConfig): string[] {
  const c = changes.counts;
  const head = `Bilan : ${c.created} créée(s) · ${c.updated} relue(s) · ${c.absent} absente(s) · ${c.back} de retour` +
    ` · ${c.moved} déplacée(s) (dont ${c.advanced ?? 0} placée(s) à la main, dépassée(s) par un nouveau jalon)` +
    ` · ${c.divergences} divergence(s) · ${c.valuesChanged} carte(s) aux valeurs changées` +
    ` · ${c.valuesKept} aux valeurs gardées du tableau` +
    ` · ${c.replaced ?? 0} aux corrections manuelles remplacées par l’export` +
    ` · ${changes.adopted.length} adoptée(s) · ${changes.deletedSkipped.length} supprimée(s) ignorée(s)` +
    ` · ${changes.identityDoubts.length} doute(s) d’identité`;
  const entered = changes.entered.map((e) => `  + ${named(e)} — ${e.reason}${e.domainWarning === null ? "" : ` ⚠ ${e.domainWarning}`}`);
  const kept = factLines(changes.kept);
  const replaced = factLines(changes.replaced);
  const advanced = changes.advanced.map((a) => `  ${named(a)} : ${transition(config, a)}`);
  const paused = (changes.paused ?? []).map((a) => `  ‖ ${named(a)} : reste en Pause (export : ${transition(config, a)})`);
  const unpaused = (changes.unpaused ?? []).map((a) => `  ▸ ${named(a)} : ${UNPAUSED_WORDS} (${transition(config, a)})`);
  const adopted = changes.adopted.map((a) => `  ⇄ ${a.code ?? "?"} : « ${a.manualTitle} » (${a.cardId}, saisie à la main) → « ${a.title} »`);
  return [
    head,
    ...section("Entrent :", entered),
    ...section("Sortent (marquées absentes, jamais supprimées) :", reasonLines("−", changes.left)),
    ...section("De retour :", reasonLines("↺", changes.back)),
    ...(changes.cardChanges.some((x) => !LISTED.has(x.kind)) ? ["Changements, fait par fait :", ...byFact(config, changes.cardChanges)] : []),
    ...(kept.length === 0 ? [] : ["Absents des fichiers, gardés du tableau (ADR 054) :", ...kept]),
    ...(replaced.length === 0 ? [] : ["Correction manuelle remplacée par la nouvelle valeur de l’export (ADR 060) :", ...replaced]),
    ...section("Placement à la main dépassé par un nouveau jalon (ADR 060) :", advanced),
    ...section("En pause — nouveau jalon non appliqué (ADR 060) :", paused),
    ...section("Sortis de Pause — état Sciforma terminé (ADR 060) :", unpaused),
    ...section("Cartes saisies à la main adoptées par l’export — même code (ADR 059), vérifier que c’est bien le même projet :", adopted),
    ...section("Supprimées du tableau, non recréées (ADR 058) :", changes.deletedSkipped.map((d) => `  ✕ ${named(d)}`)),
    ...section("Doutes d’identité :", changes.identityDoubts.map((q) => `  ⚠ ${q}`)),
    ...section("Domaine à vérifier — l’export n’en donne pas (ADR 061) :", reasonLines("?", changes.domainToCheck ?? [])),
  ];
}
