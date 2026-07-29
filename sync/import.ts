// Audit-mode import CLI (étape 1). Reads a folder of PPM CSV exports, runs
// the pure audit pass from adapters/csv-import, writes the French Markdown
// report, prints a summary. Never touches storage: nothing is loaded until
// the report is clean (docs/IMPORT-MAPPING.md « Mode audit d'abord »).
// Unlike scripts/seed.ts, the board config is read through the runtime
// store so an admin override applied on the client platform is honored.
//
// Usage: node sync/import.ts <dossier> [--out <chemin-du-rapport>]
// Exit codes: 0 = audit produced (even with doubtful findings),
//             1 = the run itself was impossible (args, folder, config).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import { loadServerConfig } from "../middle/config.ts";
import { createConfigStore } from "../middle/config-store.ts";
import { renderReport, runImportAudit } from "../adapters/csv-import/index.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import type { BoardConfig } from "../core/types.ts";

const USAGE = "usage : node sync/import.ts <dossier> [--out <chemin-du-rapport>]";

// Positional folder + optional --out; anything else is a usage error.
function parseArgs(argv: string[]): { folder: string; out: string | null } | null {
  let folder: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined) return null;
      out = value;
      i++;
    } else if (arg.startsWith("--") || folder !== null) {
      return null;
    } else {
      folder = arg;
    }
  }
  return folder === null ? null : { folder, out };
}

// The config the board actually serves: defaults + admin runtime override.
function loadRuntimeBoardConfig(): BoardConfig {
  const cfg = loadServerConfig(process.env);
  const defaults = validateBoardConfig(JSON.parse(readFileSync(cfg.boardConfigPath, "utf8")));
  return createConfigStore(cfg.dataDir, defaults).getRuntime();
}

// Every regular file of the folder, bytes untouched; recognition is the
// audit's job, not the CLI's. Non-file entries (sub-folders, links) cannot
// enter the audit, so they are at least named on the console.
function readInputFiles(folder: string): InputFile[] {
  const entries = readdirSync(folder, { withFileTypes: true });
  const ignored = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (ignored.length > 0) {
    console.log(`import : entrée(s) hors fichier ignorée(s) : ${ignored.join(", ")}`);
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, bytes: readFileSync(join(folder, entry.name)) }));
}

const args = parseArgs(process.argv.slice(2));
if (args === null) {
  console.error(USAGE);
  process.exit(1);
}

try {
  const boardConfig = loadRuntimeBoardConfig();
  const files = readInputFiles(args.folder);
  const { report } = runImportAudit(files, boardConfig, new Date());
  const outPath = resolve(args.out ?? join(args.folder, "rapport-import.md"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderReport(report, new Date()), "utf8");
  const recognized = report.inventory.filter(
    (f) => f.status === "recognized" || f.status === "recognized-with-deviations",
  ).length;
  console.log(
    `import (audit) : ${report.inventory.length} fichier(s) reçu(s), ${recognized} reconnu(s).\n` +
      `Pris : ${report.taken.length} · Écartés : ${report.discarded.length}` +
      ` · Douteux : ${report.doubtful.length} · Signalements : ${report.warnings.length}\n` +
      `Rapport : ${outPath}`,
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`import : échec — ${detail}`);
  process.exit(1);
}
