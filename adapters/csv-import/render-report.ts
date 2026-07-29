// Markdown rendering of the audit report (French, user-facing). The output
// is deterministic for a fixed `generatedAt`: entries render in insertion
// order, nothing depends on locale or timezone (UTC, ISO-derived format).

import type {
  DiscardedEntry, DoubtfulEntry, FileInventoryEntry, ImportReport, RowRef, WarningEntry,
} from "./report.ts";

/**
 * Renders the audit report as French Markdown.
 * Inputs: the report and the generation instant (injected for determinism).
 * Outputs: the full Markdown document, sections 0 Inventaire, 1 Pris,
 * 2 Écarté, 3 Douteux, Signalements.
 * Failure modes: none — an empty report renders with « aucun » wording.
 */
export function renderReport(report: ImportReport, generatedAt: Date): string {
  return [
    renderHeader(report, generatedAt),
    renderInventory(report),
    renderTaken(report),
    renderDiscarded(report),
    renderDoubtful(report),
    renderWarnings(report),
  ].join("\n");
}

function renderHeader(report: ImportReport, generatedAt: Date): string {
  const iso = generatedAt.toISOString();
  const stamp = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  const counts =
    `Pris : ${report.taken.length} · Écartés : ${report.discarded.length}` +
    ` · Douteux : ${report.doubtful.length} · Signalements : ${report.warnings.length}`;
  return `# Rapport d'import — mode audit\n\nGénéré le ${stamp}.\n${counts}\n`;
}

function renderInventory(report: ImportReport): string {
  const lines = ["## 0. Inventaire", ""];
  if (report.inventory.length === 0) {
    lines.push("Aucun fichier reçu.");
  } else {
    lines.push("| Fichier | Taille | Reconnaissance | Encodage | Détail |");
    lines.push("|---|---|---|---|---|");
    for (const entry of report.inventory) lines.push(inventoryRow(entry));
  }
  lines.push("", "Fichiers attendus manquants :", "");
  if (report.missingExpected.length === 0) lines.push("- aucun");
  else for (const m of report.missingExpected) lines.push(`- **${m.name}** — ${m.note}`);
  lines.push("", "État de l'assemblage :", "");
  for (const a of report.assembly) lines.push(`- ${a.subject} : ${a.status}`);
  lines.push("");
  return lines.join("\n");
}

function inventoryRow(entry: FileInventoryEntry): string {
  const columns = [
    cell(entry.name),
    `${entry.sizeBytes} o`,
    statusLabel(entry),
    cell(entry.encoding ?? "—"),
    cell(entry.detail ?? "—"),
  ];
  return `| ${columns.join(" | ")} |`;
}

function statusLabel(entry: FileInventoryEntry): string {
  const contract = entry.contractId ?? "?";
  switch (entry.status) {
    case "recognized": return `reconnu (${contract})`;
    case "recognized-with-deviations": return `reconnu (${contract}), écarts d'en-têtes`;
    case "near-miss": return `incomplet (proche de ${contract})`;
    case "unknown": return "en-têtes non reconnus";
    case "not-csv": return "hors CSV — ignoré";
    case "unsupported": return "refusé";
  }
}

function renderTaken(report: ImportReport): string {
  const lines = [`## 1. Pris (${report.taken.length})`, ""];
  if (report.taken.length === 0) lines.push("Aucun.");
  for (const t of report.taken) {
    const note = t.note === undefined ? "" : ` (${t.note})`;
    lines.push(`- ${refLabel(t.ref)} : « ${t.value} » → ${t.destination}${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderDiscarded(report: ImportReport): string {
  const lines = [`## 2. Écarté (${report.discarded.length})`, ""];
  if (report.discarded.length === 0) lines.push("Aucun.");
  for (const d of report.discarded) lines.push(`- ${caseLabel(d)} — ${d.reason}`);
  lines.push("");
  return lines.join("\n");
}

function renderDoubtful(report: ImportReport): string {
  const lines = [`## 3. Douteux (${report.doubtful.length})`, ""];
  if (report.doubtful.length === 0) lines.push("Aucun.");
  for (const d of report.doubtful) lines.push(`- ${caseLabel(d)} — ${d.question}`);
  lines.push("");
  return lines.join("\n");
}

function renderWarnings(report: ImportReport): string {
  const lines = [`## Signalements (${report.warnings.length})`, ""];
  if (report.warnings.length === 0) lines.push("Aucun.");
  for (const w of report.warnings) lines.push(warningLine(w));
  lines.push("");
  return lines.join("\n");
}

function warningLine(w: WarningEntry): string {
  return w.file === undefined ? `- ${w.message}` : `- \`${w.file}\` : ${w.message}`;
}

// « `file` ligne N : « value » » with the optional parts folded in.
function caseLabel(entry: DiscardedEntry | DoubtfulEntry): string {
  const where = entry.ref === undefined ? `\`${entry.file}\`` : refLabel(entry.ref);
  return entry.value === undefined ? where : `${where} : « ${entry.value} »`;
}

function refLabel(ref: RowRef): string {
  return `\`${ref.file}\` ligne ${ref.line}`;
}

// Markdown table cells must not break on embedded pipes.
function cell(value: string): string {
  return value.replaceAll("|", "\\|");
}
