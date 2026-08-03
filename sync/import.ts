// Import CLI. Reads a folder of PPM CSV exports, runs the pure audit pass
// from adapters/csv-import, writes the French Markdown report, prints a
// summary. Storage is touched ONLY with --charger: nothing is loaded until
// the report is clean (docs/IMPORT-MAPPING.md « Mode audit d'abord »).
// Unlike scripts/seed.ts, the board config is read through the runtime
// store so an admin override applied on the client platform is honored.
//
// Usage: node sync/import.ts <dossier> [--out <rapport>] [--charger]
// Exit codes: 0 = audit produced (even with doubtful findings),
//             1 = the run itself was impossible (args, folder, config,
//                 storage).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import { loadServerConfig } from "../middle/config.ts";
import { createConfigStore } from "../middle/config-store.ts";
import { planLoad, renderReport, runImportAudit } from "../adapters/csv-import/index.ts";
import type { InputFile, LoadPlan } from "../adapters/csv-import/index.ts";
import type { EnrichedCard } from "../adapters/csv-import/index.ts";
import type { BoardConfig } from "../core/types.ts";

const USAGE = "usage : node sync/import.ts <dossier> [--out <rapport>] [--charger]";

interface Args {
  folder: string;
  out: string | null;
  charger: boolean;
}

// Positional folder + optional flags; anything else is a usage error.
function parseArgs(argv: string[]): Args | null {
  let folder: string | null = null;
  let out: string | null = null;
  let charger = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined) return null;
      out = value;
      i++;
    } else if (arg === "--charger") {
      charger = true;
    } else if (arg.startsWith("--") || folder !== null) {
      return null;
    } else {
      folder = arg;
    }
  }
  return folder === null ? null : { folder, out, charger };
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

// The real load: plan against what the board already holds, then write the
// cards and their events in one atomic batch. The storage module is loaded
// LAZILY: audit mode must keep running with no node_modules at all (the
// parser is dependency-free by design; only the pg driver needs an install).
async function load(deck: EnrichedCard[], config: BoardConfig): Promise<LoadPlan> {
  const cfg = loadServerConfig(process.env);
  mkdirSync(dirname(cfg.dataPath), { recursive: true });
  const { createStorage } = await import("../middle/storage/select.ts");
  const storage = await createStorage(cfg.storageDriver, cfg.dataPath);
  try {
    const [events, baseCards] = await Promise.all([storage.listEvents(), storage.listBaseCards()]);
    const plan = planLoad(deck, config, baseCards, events, new Date());
    await storage.importCards(plan.cards, plan.events);
    return plan;
  } finally {
    await storage.close();
  }
}

function loadSummary(plan: LoadPlan): string {
  const divergences = plan.divergences.length === 0
    ? ""
    : `\nDivergences non appliquées (cartes déplacées à la main) : ${plan.divergences.length}` +
      plan.divergences.slice(0, 5)
        .map((d) => `\n  · « ${d.title} » : tableau ${d.fromColumn} / export ${d.toColumn}`).join("");
  return `chargement : ${plan.created} carte(s) créée(s) · ${plan.updated} mise(s) à jour` +
    ` · ${plan.moved} déplacée(s) par l'export${divergences}`;
}

const args = parseArgs(process.argv.slice(2));
if (args === null) {
  console.error(USAGE);
  process.exit(1);
}

try {
  const boardConfig = loadRuntimeBoardConfig();
  const files = readInputFiles(args.folder);
  const { report, cards } = runImportAudit(files, boardConfig, new Date());
  const outPath = resolve(args.out ?? join(args.folder, "rapport-import.md"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderReport(report, new Date()), "utf8");
  const recognized = report.inventory.filter(
    (f) => f.status === "recognized" || f.status === "recognized-with-deviations",
  ).length;
  console.log(
    `import (${args.charger ? "chargement" : "audit"}) : ${report.inventory.length} fichier(s) reçu(s)` +
      `, ${recognized} reconnu(s).\n` +
      `Pris : ${report.taken.length} · Écartés : ${report.discarded.length}` +
      ` · Douteux : ${report.doubtful.length} · Signalements : ${report.warnings.length}\n` +
      `Rapport : ${outPath}`,
  );
  if (args.charger) {
    if (cards === null) {
      console.error("chargement refusé : aucune carte assemblée (le consolidé manque ?).");
      process.exit(1);
    }
    console.log(loadSummary(await load(cards.cards, boardConfig)));
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.includes("Cannot find package")) {
    console.error(
      "import : échec — le chargement exige les dépendances du dépôt.\n" +
        "Lancer une fois « npm ci » à la racine, puis relancer avec --charger.\n" +
        `(détail : ${detail})`,
    );
    process.exit(1);
  }
  console.error(`import : échec — ${detail}`);
  process.exit(1);
}
