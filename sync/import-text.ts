// The readable import report (ADR 055) as compact French text for the
// import CLI: the files taken, the perimeter and what it left out, the
// counts, the projects entering / leaving / back with their reasons, the
// refreshed values grouped by fact, the facts kept from the board. The
// same ImportChanges object the tool shows; only the wording lives here.

import type { BoardConfig } from "../core/types.ts";
import type { ImportChanges, ImportLeft } from "../core/import-types.ts";
import type { CardChange } from "../core/snapshot-diff.ts";
import { FIGURE_FACTS } from "../core/snapshot-diff.ts";

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
  if (value === null || value === "") return "—";
  if (change.kind === "domain") return config.domains.find((d) => d.id === value)?.name ?? value;
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

/**
 * What the load changes (or changed) on the board, from the changes.
 * Inputs: the changes, the config (column, domain, type, métier names).
 * Output: the text lines (French). Failure: none.
 */
export function boardText(changes: ImportChanges, config: BoardConfig): string[] {
  const c = changes.counts;
  const head = `Bilan : ${c.created} créée(s) · ${c.updated} relue(s) · ${c.absent} absente(s) · ${c.back} de retour` +
    ` · ${c.moved} déplacée(s) · ${c.divergences} divergence(s) · ${c.valuesChanged} carte(s) aux valeurs changées` +
    ` · ${c.valuesKept} aux valeurs gardées du tableau`;
  const entered = changes.entered.map((e) => `  + ${named(e)} — ${e.reason}${e.domainWarning === null ? "" : ` ⚠ ${e.domainWarning}`}`);
  const kept = changes.kept.map((k) => `  ${k.label} (${k.cards.length}) : ${k.cards.slice(0, CAP).map((card) => card.code ?? card.title).join(", ")}` +
    (k.cards.length > CAP ? ` … (+${k.cards.length - CAP})` : ""));
  return [
    head,
    ...section("Entrent :", entered),
    ...section("Sortent (marquées absentes, jamais supprimées) :", reasonLines("−", changes.left)),
    ...section("De retour :", reasonLines("↺", changes.back)),
    ...(changes.cardChanges.some((x) => !LISTED.has(x.kind)) ? ["Changements, fait par fait :", ...byFact(config, changes.cardChanges)] : []),
    ...(kept.length === 0 ? [] : ["Absents des fichiers, gardés du tableau (ADR 054) :", ...kept]),
  ];
}
