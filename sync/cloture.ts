// Exercise closure (ADR 026): archives every subject that reached a
// terminal stage (derived from the config, never hardcoded) and, on
// request, moves the runtime config to the next exercise year. Dry run by
// default — nothing is written without --appliquer. Names never reach the
// console: ids, codes and columns only.
//
// Usage: node sync/cloture.ts [--appliquer] [--annee AAAA] [--colonnes id,id]
//   --annee     : the next exercise year (written to the runtime config)
//   --colonnes  : the stages to archive (default: the terminal stages)
// Next step after a closure: import the new exercise's files — subjects
// absent from that import are marked, never deleted (ADR 026).

import { readFileSync } from "node:fs";
import type { BoardConfig, CardState } from "../core/types.ts";
import { validateBoardConfig } from "../core/config.ts";
import { lifecycleEvent } from "../core/events.ts";
import { terminalColumnIds } from "../core/flow.ts";
import { foldEvents } from "../core/state.ts";
import { createConfigStore } from "../middle/config-store.ts";
import { loadServerConfig } from "../middle/config.ts";

const USAGE = "usage : node sync/cloture.ts [--appliquer] [--annee AAAA] [--colonnes id,id]";

interface Args {
  apply: boolean;
  year: number | null;
  columns: string[] | null;
}

function parseArgs(argv: string[]): Args | null {
  const args: Args = { apply: false, year: null, columns: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--appliquer") {
      args.apply = true;
    } else if (arg === "--annee") {
      const year = Number(argv[++i]);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
      args.year = year;
    } else if (arg === "--colonnes") {
      const list = (argv[++i] ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");
      if (list.length === 0) return null;
      args.columns = list;
    } else {
      return null;
    }
  }
  return args;
}

// The stages to close: --colonnes when given (must exist), else the
// terminal stages the config derives.
function stagesToClose(config: BoardConfig, args: Args): Set<string> {
  if (args.columns === null) return terminalColumnIds(config);
  const known = new Set(config.columns.map((column) => column.id));
  for (const id of args.columns) {
    if (!known.has(id)) throw new Error(`colonne inconnue : « ${id} » (colonnes : ${[...known].join(", ")})`);
  }
  return new Set(args.columns);
}

function describe(states: CardState[], stages: Set<string>, year: number, apply: boolean): void {
  console.log(
    `clôture de l'exercice ${year} : ${states.length} sujet(s) en étape ${[...stages].join(" / ")} à archiver` +
      (apply ? "" : " — simulation, rien n'est écrit (ajouter --appliquer)"),
  );
  for (const state of states) {
    console.log(`  · ${state.id}${state.codename === null ? "" : ` (${state.codename})`} — ${state.columnId}`);
  }
}

async function main(args: Args): Promise<void> {
  const cfg = loadServerConfig(process.env);
  const defaults = validateBoardConfig(JSON.parse(readFileSync(cfg.boardConfigPath, "utf8")));
  const configStore = createConfigStore(cfg.dataDir, defaults);
  const config = configStore.getRuntime();
  const stages = stagesToClose(config, args);
  const { createStorage } = await import("../middle/storage/select.ts");
  const storage = await createStorage(cfg.storageDriver, cfg.dataPath);
  try {
    const [cards, events] = await Promise.all([storage.listBaseCards(), storage.listEvents()]);
    const finished = foldEvents(cards, events).filter((state) => !state.archived && stages.has(state.columnId));
    describe(finished, stages, config.exercise.year, args.apply);
    if (!args.apply) return;
    const actor = `cloture-${config.exercise.year}`;
    const ts = new Date().toISOString();
    for (const state of finished) {
      await storage.appendEvent(lifecycleEvent("archived", state.id, actor, ts, { exercise: config.exercise.year }));
    }
    console.log(`${finished.length} sujet(s) archivé(s) (acteur ${actor}) — désarchivables depuis la vue Archives.`);
    if (args.year !== null) {
      configStore.setRuntime({ ...config, exercise: { year: args.year } }, actor);
      console.log(
        `exercice courant : ${args.year} (configuration d'exécution mise à jour).\n` +
          `Étape suivante : importer les fichiers ${args.year} — les sujets absents de cet import seront marqués, jamais supprimés.`,
      );
    }
  } finally {
    await storage.close();
  }
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed === null) {
  console.error(USAGE);
  process.exit(1);
}
try {
  await main(parsed);
} catch (error) {
  console.error(`clôture : échec — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
