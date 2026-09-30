// Synthetic export files for the importer's tests (ADR 062 « Doutes à
// trancher » first): each builder writes rows on the header of the
// synthetic fixture of its kind (fixtures/import/), a column absent from
// the given values left empty. Test support only — never imported by the
// application; synthetic data only (CLAUDE.md §7).

import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import type { InputFile } from "./identify.ts";

/** The versioned board model the tests import with. */
export const SAMPLE_CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;

// The fixture's lines above and including its header (a preamble line for
// ProjetsJalons and SP), and the header's columns.
function head(fixture: string, headerLine: number): { lines: string[]; columns: string[] } {
  const all = readFileSync(new URL(`../../fixtures/import/${fixture}`, import.meta.url), "utf8").split(/\r?\n/);
  return { lines: all.slice(0, headerLine + 1), columns: (all[headerLine] ?? "").split(";") };
}

/** One row: column label → cell (absent columns are empty). */
export type SampleRow = Record<string, string>;

function file(name: string, fixture: string, headerLine: number, rows: readonly SampleRow[]): InputFile {
  const { lines, columns } = head(fixture, headerLine);
  const body = rows.map((row) => columns.map((column) => row[column] ?? "").join(";"));
  return { name, bytes: new Uint8Array(Buffer.from([...lines, ...body].join("\n"), "utf8")) };
}

/** A COUT PREV row with the usual retained defaults (2026, « Budget validé », « Etude », Infra, a ME figure). */
export function coutsRow(id: string, name: string, over: SampleRow = {}): SampleRow {
  return {
    "Fichier": "Coût prévisionnel", "Année": "2026", "Type de centre de coût": "Prestation", "Coût final ME (Res ouTrans)": "1 000,00 €",
    "Projet. Id": id, "Projet. Nom": name, "Projet.Portefeuille": "DSI NEXTER.INFRASTRUCTURE OPE", "Projet.Type": "Etude (Projet)",
    "Projet.Etat du processus": "Budget validé", "Projet.Actif": "VRAI", "Date d'export": "10/09/2026", ...over,
  };
}

/**
 * The export files of a test, by kind.
 * Input: the rows of each file wanted. Output: the input files.
 * Failure modes: none.
 */
export function sampleFiles(rows: { couts?: SampleRow[]; projets?: SampleRow[]; jalons?: SampleRow[]; sp?: SampleRow[]; cdp?: SampleRow[] }): InputFile[] {
  return [
    ...(rows.couts === undefined ? [] : [file("Couts.csv", "Couts.csv", 0, rows.couts)]),
    ...(rows.projets === undefined ? [] : [file("Projets.csv", "Projets.csv", 0, rows.projets)]),
    ...(rows.jalons === undefined ? [] : [file("ProjetsJalons.csv", "ProjetsJalons.csv", 1, rows.jalons)]),
    ...(rows.sp === undefined ? [] : [file("SP_2026.csv", "SP_2026.csv", 1, rows.sp)]),
    ...(rows.cdp === undefined ? [] : [file("ProjetsCdP.csv", "ProjetsCdP.csv", 0, rows.cdp)]),
  ];
}
