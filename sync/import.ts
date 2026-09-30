// Import CLI. Reads a folder of PPM CSV exports, runs the pure audit pass
// from adapters/csv-import, writes the French Markdown report, prints a
// summary and the readable report of ADR 055 (files taken, perimeter,
// what the load changes and why — sync/import-text.ts). Storage is written
// ONLY with --charger: nothing is loaded until the report is clean
// (docs/IMPORT-MAPPING.md « Mode audit d'abord »); --comparer reads it to
// preview the changes on the board without writing a card. A load takes
// the automatic snapshot « avant chargement <année> » before it writes,
// exactly like the tool's (ADR 042, middle/snapshots.ts), and logs each
// entry, exit and return with its reason (withEventReasons).
// Unlike scripts/seed.ts, the board config is read through the runtime
// store so an admin override applied on the client platform is honored.
//
// Usage: node sync/import.ts <dossier> [--out <rapport>] [--charger | --comparer] [--exercice <année>] [--domaines garder|remplacer]
// Exit codes: 0 = audit produced (even with doubtful findings),
//             1 = the run itself was impossible (args, folder, config,
//                 storage).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import { loadServerConfig } from "../middle/config.ts";
import { createConfigStore } from "../middle/config-store.ts";
import type { ConfigStore } from "../middle/config-store.ts";
import { takeSnapshot } from "../middle/snapshots.ts";
import {
  IMPORT_ACTOR, importChanges, importConfig, keepStoredCapacity, loadRefusal, planLoad, renderReport, runImportAudit,
  withEventReasons, withLegacyIds,
} from "../adapters/csv-import/index.ts";
import type { AuditResult } from "../adapters/csv-import/index.ts";
import type { DomainDecision, ImportChanges } from "../core/import-types.ts";
import type { InputFile, LoadPlan } from "../adapters/csv-import/index.ts";
import type { EnrichedCard } from "../adapters/csv-import/index.ts";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig, Card, CardEvent } from "../core/types.ts";
import { domainName } from "../core/domain-check.ts";
import { boardText, filesText, loadText } from "./import-text.ts";

const USAGE = "usage : node sync/import.ts <dossier> [--out <rapport>] [--charger | --comparer] [--exercice <année>] [--domaines garder|remplacer]";

interface Args {
  folder: string;
  out: string | null;
  charger: boolean;
  /** Audit only: read the board to preview what a load would change (ADR 055). */
  comparer: boolean;
  /** The exercise year read and loaded (ADR 035); null = the config's current one. */
  exercice: number | null;
  /** One decision for EVERY domain conflict (ADR 036); null = refuse to load while one exists. */
  domaines: DomainDecision | null;
}

// Positional folder + optional flags; anything else is a usage error.
function parseArgs(argv: string[]): Args | null {
  let folder: string | null = null;
  let out: string | null = null;
  let charger = false;
  let comparer = false;
  let exercice: number | null = null;
  let domaines: DomainDecision | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined) return null;
      out = value;
      i++;
    } else if (arg === "--charger" || arg === "--comparer") {
      if (arg === "--charger") charger = true;
      else comparer = true;
    } else if (arg === "--exercice") {
      const value = argv[i + 1];
      if (value === undefined || !/^\d{4}$/.test(value)) return null;
      exercice = Number(value);
      i++;
    } else if (arg === "--domaines") {
      const value = argv[i + 1];
      if (value !== "garder" && value !== "remplacer") return null;
      domaines = value;
      i++;
    } else if (arg.startsWith("--") || folder !== null) {
      return null;
    } else {
      folder = arg;
    }
  }
  return folder === null || (charger && comparer) ? null : { folder, out, charger, comparer, exercice, domaines };
}

// The config the board actually serves (defaults + admin runtime
// override), matching export labels with the versioned model's vocabulary
// — the same as the tool's import routes (ADR 056). The store is kept for
// the automatic snapshot of a load (it records the applied config).
function loadRuntimeBoardConfig(): { config: BoardConfig; configStore: ConfigStore } {
  const cfg = loadServerConfig(process.env);
  const defaults = validateBoardConfig(JSON.parse(readFileSync(cfg.boardConfigPath, "utf8")));
  const configStore = createConfigStore(cfg.dataDir, defaults);
  return { config: importConfig(configStore.getRuntime(), defaults), configStore };
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

// Opens the board's storage for one piece of work, then closes it. The
// storage module is loaded LAZILY: audit mode must keep running with no
// node_modules at all (the parser is dependency-free by design; only the
// pg driver needs an install).
async function withStorage<T>(what: string, work: (storage: BoardStorage) => Promise<T>): Promise<T> {
  const cfg = loadServerConfig(process.env);
  mkdirSync(dirname(cfg.dataPath), { recursive: true });
  // Say the board BEFORE touching it: the driver defaults to jsonl, so a
  // forgotten KANBAN_STORAGE_DRIVER=postgres must never pass unnoticed.
  console.log(`${what} : ${storageLabel(cfg.storageDriver, cfg.dataPath)}`);
  const { createStorage } = await import("../middle/storage/select.ts");
  const storage = await createStorage(cfg.storageDriver, cfg.dataPath);
  try {
    return await work(storage);
  } finally {
    await storage.close();
  }
}

// The real load: plan against what the board already holds, take the
// automatic snapshot once the load is accepted (ADR 042 — before anything
// is written, like the tool), then write the cards and their events in one
// atomic batch; the changes are read from the same plan (ADR 055: what the
// load DID).
async function load(
  audit: AuditResult, deck: EnrichedCard[], config: BoardConfig, year: number, domaines: DomainDecision | null,
  configStore: ConfigStore,
): Promise<{ plan: LoadPlan; changes: ImportChanges }> {
  return withStorage("destination", async (storage) => {
    const [events, baseCards] = await Promise.all([storage.listEvents(), storage.listBaseCards()]);
    const plan = planWithDecisions(deck, config, baseCards, events, year, domaines);
    const changes = importChanges({ audit, config, year, plan, baseCards, events });
    await takeSnapshot({ storage, configStore }, `avant chargement ${year}`, IMPORT_ACTOR, new Date());
    await storage.importCards(plan.cards, withEventReasons(plan.events, changes));
    if (audit.capacity !== null) {
      const fresh = withLegacyIds(audit.capacity.snapshot, plan.aliases);
      await storage.importCapacity(keepStoredCapacity(fresh, await storage.getCapacity(year)));
    }
    return { plan, changes };
  });
}

// --comparer: what a load WOULD change, read without writing a card (no
// domain decision taken: every conflict keeps the board's value).
async function compare(audit: AuditResult, deck: EnrichedCard[], config: BoardConfig, year: number): Promise<ImportChanges> {
  return withStorage("tableau comparé", async (storage) => {
    const [events, baseCards] = await Promise.all([storage.listEvents(), storage.listBaseCards()]);
    const plan = planLoad(deck, config, baseCards, events, new Date(), year);
    return importChanges({ audit, config, year, plan, baseCards, events });
  });
}

// The plan with every domain conflict decided the same way when --domaines
// says so; refused otherwise — the tool decides one by one (ADR 036).
function planWithDecisions(
  deck: EnrichedCard[], config: BoardConfig, baseCards: Card[], events: CardEvent[], year: number,
  domaines: DomainDecision | null,
): LoadPlan {
  const dry = planLoad(deck, config, baseCards, events, new Date(), year);
  if (dry.domainConflicts.length === 0) return dry;
  if (domaines === null) {
    const lines = dry.domainConflicts.slice(0, 8)
      .map((c) => `\n  · « ${c.title} » : tableau ${domainName(config, c.board.domain)} / export ${domainName(config, c.proposed.domain)} (${c.rule})`).join("");
    throw new Error(
      `${dry.domainConflicts.length} conflit(s) de domaine à trancher — dans l'outil (un par un), ` +
        `ou --domaines garder|remplacer pour tout trancher pareil.${lines}`,
    );
  }
  const decisions = new Map(dry.domainConflicts.map((c): [string, DomainDecision] => [c.cardId, domaines]));
  return planLoad(deck, config, baseCards, events, new Date(), year, decisions);
}

// Where the cards are about to land, in plain French.
function storageLabel(driver: string, dataPath: string): string {
  if (driver === "postgres") {
    const url = process.env["DATABASE_URL"];
    const target = url === undefined ? "variables PG*" : url.replace(/\/\/[^@]*@/, "//…@");
    return `PostgreSQL (${target})`;
  }
  if (driver === "jsonl") {
    return `fichier JSONL ${resolve(dataPath)}` +
      " — poser KANBAN_STORAGE_DRIVER=postgres pour écrire dans la base du tableau";
  }
  return driver;
}

const args = parseArgs(process.argv.slice(2));
if (args === null) {
  console.error(USAGE);
  process.exit(1);
}

try {
  const { config: boardConfig, configStore } = loadRuntimeBoardConfig();
  const year = args.exercice ?? boardConfig.exercise.year;
  const files = readInputFiles(args.folder);
  const audit = runImportAudit(files, boardConfig, new Date(), year);
  const { report, cards, capacity } = audit;
  const outPath = resolve(args.out ?? join(args.folder, "rapport-import.md"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderReport(report, new Date()), "utf8");
  const recognized = report.inventory.filter(
    (f) => f.status === "recognized" || f.status === "recognized-with-deviations",
  ).length;
  console.log(
    `import (${args.charger ? "chargement" : "audit"}, exercice ${year}) : ${report.inventory.length} fichier(s) reçu(s)` +
      `, ${recognized} reconnu(s).\n` +
      `Pris : ${report.taken.length} · Écartés : ${report.discarded.length}` +
      ` · Douteux : ${report.doubtful.length} · Signalements : ${report.warnings.length}\n` +
      `Rapport : ${outPath}`,
  );
  const noBoard = importChanges({ audit, config: boardConfig, year, plan: null, baseCards: [], events: [] });
  console.log(filesText(noBoard).join("\n"));
  // The tool's own rule (load-refusal.ts): a closed year, blocking files
  // (ADR 056), no perimeter, no project on the year.
  const refused = loadRefusal(audit, year, boardConfig.exercise.year);
  if (refused !== null) console.error(refused);
  if (args.charger) {
    if (refused !== null || cards === null) process.exit(1);
    const loaded = await load(audit, cards.cards, boardConfig, year, args.domaines, configStore);
    console.log([...loadText(loaded.plan, boardConfig), ...boardText(loaded.changes, boardConfig)].join("\n"));

    if (capacity !== null) {
      const { persons, assignments } = capacity.snapshot;
      console.log(`capacité ${capacity.snapshot.exerciseYear} : ${persons.length} personne(s), ${assignments.length} affectation(s) enregistrées.`);
    }
  } else if (args.comparer && refused === null && cards !== null) {
    console.log(boardText(await compare(audit, cards.cards, boardConfig, year), boardConfig).join("\n"));
  } else if (args.comparer) {
    console.log("comparaison : un chargement de ces fichiers serait refusé (ci-dessus) — rien à comparer.");
  } else {
    console.log("Ce qu'un chargement changerait sur le tableau : relancer avec --comparer (lecture seule).");
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.includes("Cannot find package")) {
    console.error(
      "import : échec — le chargement exige les dépendances du dépôt.\n" +
        "Lancer une fois « npm ci » à la racine, puis relancer avec --charger ou --comparer.\n" +
        `(détail : ${detail})`,
    );
    process.exit(1);
  }
  console.error(`import : échec — ${detail}`);
  process.exit(1);
}
