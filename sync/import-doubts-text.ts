// The « Doutes à trancher » of an import (ADR 062) as compact French text
// for the import CLI: each decidable doubt, why, and how the command
// settled it — the command applies the choices remembered in the tool
// (« ne plus me demander ») and otherwise the tool's own proposal; it
// never asks, never writes a choice. Trancher is done in the tool
// (⚙ › Importer). Pure.

import type { ImportDoubt } from "../core/import-types.ts";

/** The longest list printed in full; beyond, the rest is counted. */
const CAP = 40;

function named(doubt: ImportDoubt): string {
  return doubt.code === null ? `« ${doubt.title} »` : `${doubt.code} « ${doubt.title} »`;
}

function how(doubt: ImportDoubt): string {
  if (doubt.how === "mémorisé") return "mémorisé";
  if (doubt.how === "choisi") return "choisi";
  return "proposé par l'outil";
}

/**
 * The doubts in plain French, one block per doubt: the project, why, the
 * option applied and how (« mémorisé » / « proposé par l'outil »).
 * Input: the doubts (sorted as the audit lists them). Output: the lines,
 * none when there is no doubt. Failure modes: none.
 */
export function doubtsText(doubts: readonly ImportDoubt[]): string[] {
  if (doubts.length === 0) return [];
  const remembered = doubts.filter((d) => d.how === "mémorisé").length;
  const lines = [
    `Doutes à trancher : ${doubts.length}${remembered > 0 ? ` (dont ${remembered} déjà tranché(s), mémorisé(s))` : ""}` +
      " — la commande applique les choix mémorisés, sinon ceux de l'outil ; trancher dans l'outil (⚙ › Importer).",
  ];
  for (const doubt of doubts.slice(0, CAP)) {
    const applied = doubt.options.find((o) => o.id === doubt.applied);
    lines.push(`  · ${named(doubt)} — ${doubt.why}`);
    lines.push(`    tranché : ${applied?.label ?? doubt.applied} (${how(doubt)})${applied?.consequence == null ? "" : ` — ${applied.consequence}`}`);
  }
  if (doubts.length > CAP) lines.push(`  … (+${doubts.length - CAP})`);
  return lines;
}
