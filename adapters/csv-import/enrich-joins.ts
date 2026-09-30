// The joins of the assembly (split from enrich.ts, 300-line cap): a card
// finds its ProjetsJalons and SP rows by Id, then by name, then (SP) by
// the PE code in the name — the name only when the card found no row by
// its Id, the key is carried by one row only, and that row carries no
// OTHER Id (ADR 058). ADR 062: what ADR 058 refuses or cannot settle is a
// « Doute à trancher » — a namesake row of another Id (attach it or not),
// a name several Ids carry (none, or one of them), an SP row by Id and
// another by name (which one) — and an ambiguous SP figure (« 1,035 »:
// French or English reading). The tool's proposal is ADR 058's. Pure.

import { tallyInto } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { ProjetEntry } from "./projets.ts";
import type { JalonEntry, JalonsTable } from "./jalons.ts";
import type { SpEntry, SpTable } from "./sp.ts";
import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook, DoubtOptionSpec } from "./doubt-book.ts";

/** What the joins read and count. */
export interface JoinState {
  jalons: JalonsTable | null;
  sp: SpTable | null;
  columnNames: Map<string, string>;
  entryColumnId: string;
  consumedJalons: Set<JalonEntry>;
  consumedSp: Set<SpEntry>;
  stats: { withoutJalons: number; positioned: number; stageCounts: Map<JalonEntry["stage"], number>; spById: number; spByName: number; spByCode: number; withoutSp: number };
  tallies: Map<string, Tally>;
  book: DoubtBook | undefined;
}

type Row = { id: string | null; name: string };

const NO = "non";
const idOf = (row: Row): string => (row.id === null || row.id === "" ? "sans-id" : row.id);
const figure = (n: number | null): string => (n === null ? "—" : String(n).replace(".", ","));

function spWords(hit: SpEntry | undefined): string {
  return hit === undefined ? "aucun coût SP pour la carte" : `estimé ${figure(hit.budgetEstimated)} k€, réalisé ${figure(hit.budgetConsumed)} k€`;
}

// One join doubt: « ne pas rattacher » (or the Id row) against the rows found by name.
function askJoin<T extends Row>(state: JoinState, entry: ProjetEntry, detail: string, why: string, rows: readonly T[], words: (row: T | undefined) => string, proposedRow?: T): T | undefined {
  const byOption = new Map<string, T>(rows.map((row) => [`id:${idOf(row)}`, row]));
  const options: DoubtOptionSpec[] = [
    ...(proposedRow === undefined ? [{ id: NO, label: "Ne pas rattacher", consequence: words(undefined) }] : []),
    ...[...byOption].map(([id, row]) => ({
      id, label: `${row === proposedRow ? "La ligne à l'Id de la carte" : "Rattacher la ligne"} « ${row.name} » (Id ${idOf(row)})`, consequence: words(row),
    })),
  ];
  const proposed = proposedRow === undefined ? NO : `id:${idOf(proposedRow)}`;
  const applied = askOrPropose(state.book, {
    kind: "join", detail, code: entry.codename, name: entry.normalizedName, title: entry.title, why, options, proposed,
  });
  return applied === NO ? undefined : byOption.get(applied);
}

// A fallback hit (by name, by code) that carries another Id than the
// card's is another project (ADR 058): refused and said — unless the PMO
// attaches it (ADR 062).
function sameProject<T extends Row>(
  state: JoinState, entry: ProjetEntry, hit: T | undefined, what: string, detail: string, words: (row: T | undefined) => string,
): T | undefined {
  if (hit === undefined || entry.id === "" || hit.id === null || hit.id === "" || hit.id === entry.id) return hit;
  tallyInto(state.tallies, `${what} : le nom désigne un autre Id (${hit.id}) — pas de jointure, rien d'emprunté`, entry.ref.line);
  return askJoin(state, entry, detail,
    `La carte (Id « ${entry.id} ») n'a pas de ligne ${what} à son Id ; la ligne à son nom porte un autre Id (« ${hit.id} »). ` +
      "L'outil ne la rattache pas (un autre projet ?).", [hit], words);
}

function jalonWords(state: JoinState, finished: boolean): (row: JalonEntry | undefined) => string {
  return (row) => {
    if (row === undefined) return finished ? "carte placée par l'état du projet" : "carte en colonne d'entrée";
    return `carte en « ${state.columnNames.get(row.columnId) ?? row.columnId} »`;
  };
}

/**
 * ProjetsJalons by Id, then by name; a hit counts the stage it implies.
 * Inputs: the join state, the perimeter entry, whether its process state
 * already places it (done state, ADR 043). Output: the row or null.
 * Failure modes: none.
 */
export function joinJalons(state: JoinState, entry: ProjetEntry, finished: boolean): JalonEntry | null {
  if (state.jalons === null) return null;
  const words = jalonWords(state, finished);
  const byId = entry.id === "" ? undefined : state.jalons.byId.get(entry.id);
  const ambiguous = byId === undefined ? state.jalons.ambiguousByName.get(entry.normalizedName) : undefined;
  const hit = byId ?? (ambiguous === undefined
    ? sameProject(state, entry, state.jalons.byName.get(entry.normalizedName), "ProjetsJalons", "jalons-nom", words)
    : askJoin(state, entry, "jalons-nom-ambigu", `La carte n'a pas de ligne ProjetsJalons à son Id ; son nom est porté par ${ambiguous.length} Id ` +
      `(${ambiguous.map(idOf).join(", ")}). L'outil n'en rattache aucune.`, ambiguous, words));
  if (hit === undefined) {
    state.stats.withoutJalons++;
    tallyInto(state.tallies, `carte sans ligne dans ProjetsJalons — ${finished ? "placée par l'état du projet" : "colonne d'entrée"}`, entry.ref.line);
    return null;
  }
  state.consumedJalons.add(hit);
  state.stats.positioned++;
  state.stats.stageCounts.set(hit.stage, (state.stats.stageCounts.get(hit.stage) ?? 0) + 1);
  return hit;
}

// SP by name then by code when the Id found nothing: the unique row; when
// neither answers and the key is shared by several Ids, the PMO's pick.
function spFallback(state: JoinState, sp: SpTable, entry: ProjetEntry): { hit: SpEntry | undefined; via: "name" | "code" | null } {
  const byName = sameProject(state, entry, sp.byName.get(entry.normalizedName), "SP", "sp-nom", spWords);
  if (byName !== undefined) return { hit: byName, via: "name" };
  const byCode = entry.codename === null ? undefined : sameProject(state, entry, sp.byCode.get(entry.codename), "SP", "sp-code", spWords);
  if (byCode !== undefined) return { hit: byCode, via: "code" };
  const shared = sp.ambiguousEntries.get(entry.normalizedName) ?? (entry.codename === null ? undefined : sp.ambiguousEntries.get(entry.codename));
  if (shared === undefined) return { hit: undefined, via: null };
  const hit = askJoin(state, entry, "sp-nom-ambigu", `La carte n'a pas de ligne SP à son Id ; son nom (ou son code) est porté par ${shared.length} lignes ` +
    `(Id ${shared.map(idOf).join(", ")}). L'outil n'emprunte aucun coût.`, shared, spWords);
  return { hit, via: hit === undefined ? null : "name" };
}

// The Id row and the name row are two subjects: the Id row, unless the PMO takes the name row.
function idOrName(state: JoinState, sp: SpTable, entry: ProjetEntry, byId: SpEntry): SpEntry {
  const namesake = sp.byName.get(entry.normalizedName);
  if (namesake === undefined || namesake === byId) return byId;
  tallyInto(state.tallies, "SP : l'Id et le nom désignent deux sujets différents — Id retenu", entry.ref.line);
  return askJoin(state, entry, "sp-id-nom", `Dans SP, la ligne à l'Id « ${entry.id} » et la ligne au nom « ${namesake.name} » ` +
    `(Id ${idOf(namesake)}) sont deux sujets différents. L'outil prend la ligne à l'Id.`, [byId, namesake], spWords, byId) ?? byId;
}

/**
 * SP by Id, then by name, then by PE code; the key used is counted.
 * Inputs: the join state, the perimeter entry. Output: the row or null.
 * Failure modes: none.
 */
export function joinSp(state: JoinState, entry: ProjetEntry): SpEntry | null {
  const sp = state.sp;
  if (sp === null) return null;
  const byId = entry.id === "" ? undefined : sp.byId.get(entry.id);
  const fallback = byId === undefined ? spFallback(state, sp, entry) : { hit: idOrName(state, sp, entry, byId), via: null };
  const hit = fallback.hit;
  if (hit === undefined) {
    state.stats.withoutSp++;
    const ambiguous = sp.ambiguous.has(entry.normalizedName) || (entry.codename !== null && sp.ambiguous.has(entry.codename));
    tallyInto(state.tallies, ambiguous
      ? "carte sans ligne SP à son Id, et son nom (ou code) est porté par plusieurs Id — aucun coût emprunté"
      : "carte sans correspondance SP — coûts de l'exercice inconnus", entry.ref.line);
    return null;
  }
  if (byId !== undefined) state.stats.spById++;
  else if (fallback.via === "code") state.stats.spByCode++;
  else state.stats.spByName++;
  state.consumedSp.add(hit);
  return hit;
}

/**
 * The SP figures a card takes, each ambiguous cell (« 1,035 ») read the
 * way the PMO chose — French (the tool's proposal, ADR 056) or English.
 * Inputs: the join state, the perimeter entry, the SP row (null = none).
 * Output: the four k€ figures. Failure modes: none.
 */
export function spFigures(state: JoinState, entry: ProjetEntry, hit: SpEntry | null): Pick<SpEntry, "budgetRdli" | "budgetEstimated" | "budgetConsumed" | "budgetEngaged"> {
  const figures = {
    budgetRdli: hit?.budgetRdli ?? null, budgetEstimated: hit?.budgetEstimated ?? null,
    budgetConsumed: hit?.budgetConsumed ?? null, budgetEngaged: hit?.budgetEngaged ?? null,
  };
  for (const cell of hit?.ambiguousFigures ?? []) {
    const applied = askOrPropose(state.book, {
      kind: "figure", detail: cell.column, code: entry.codename, name: entry.normalizedName, title: entry.title,
      why: `« ${cell.raw} » dans la colonne « ${cell.column} » de SP (ligne ${hit?.ref.line ?? "?"}) : une virgule suivie de trois chiffres ` +
        "se lit à la française (virgule décimale) ou à l'anglaise (séparateur de milliers). L'outil lit à la française.",
      options: [
        { id: "fr", label: `Lecture française : ${figure(cell.french)} k€`, consequence: null },
        { id: "en", label: `Lecture anglaise : ${figure(cell.english)} k€`, consequence: null },
      ],
      proposed: "fr", evidence: [cell.raw],
    });
    if (applied === "en") figures[cell.field] = cell.english;
  }
  return figures;
}
