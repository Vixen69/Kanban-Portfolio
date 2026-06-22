// Dev-only seeding: fill the configured storage from the fixtures adapter so
// the API has data to serve while developing on the author's machine (the
// only adapter ever used here — CLAUDE.md §7). Idempotent: does nothing if the
// store already holds data. The client machine never runs this — real data
// arrives through csv-import / sync (Sprint 5).

import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import { toCard } from "../core/state.ts";
import { createFixtures } from "../adapters/fixtures/index.ts";
import { createStorage } from "../middle/storage/select.ts";
import { loadServerConfig } from "../middle/config.ts";

// Hard guard against the two-machine hazard (CLAUDE.md §7): seeding synthetic
// fixtures must never run on the client machine. Require an explicit opt-in so
// a bare `npm run seed` there refuses instead of polluting an empty real store.
if (process.env["KANBAN_ALLOW_SEED"] !== "1") {
  console.error(
    "seed: outil de DEV uniquement (données fictives). Refusé.\n" +
      "Sur une machine de développement : KANBAN_ALLOW_SEED=1 npm run seed",
  );
  process.exit(1);
}

const cfg = loadServerConfig(process.env);
const boardConfig = validateBoardConfig(JSON.parse(readFileSync(cfg.boardConfigPath, "utf8")));
mkdirSync(dirname(cfg.dataPath), { recursive: true });

const storage = createStorage(cfg.storageDriver, cfg.dataPath);
try {
  if (storage.listEvents().length > 0 || storage.listBaseCards().length > 0) {
    console.log("seed: le stockage contient déjà des données, rien à faire.");
  } else {
    const now = new Date();
    const { dataSource, seedEvents } = createFixtures(boardConfig, now);
    const cards = dataSource
      .listSubjects()
      .map((subject) => toCard(subject, dataSource.getFinancials(subject.id)));
    storage.importCards(cards, seedEvents);
    console.log(`seed: ${cards.length} cartes, ${seedEvents.length} évènements importés.`);
  }
} finally {
  storage.close();
}
