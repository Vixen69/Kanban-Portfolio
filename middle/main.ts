// Middle entry point. Reads non-secret config from the environment, loads and
// validates the board topology, opens the configured storage, serves the
// Express API, and closes the storage cleanly on shutdown. Zero egress.

import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import { createStorage } from "./storage/select.ts";
import { loadServerConfig } from "./config.ts";
import { createApp } from "./app.ts";

const cfg = loadServerConfig(process.env);
const raw: unknown = JSON.parse(readFileSync(cfg.boardConfigPath, "utf8"));
const boardConfig = validateBoardConfig(raw);

mkdirSync(dirname(cfg.dataPath), { recursive: true });
const storage = createStorage(cfg.storageDriver, cfg.dataPath);
const app = createApp({ storage, config: boardConfig });

const server = app.listen(cfg.port, cfg.host, () => {
  console.log(`${new Date().toISOString()} kanban middle: http://${cfg.host}:${cfg.port} (${cfg.storageDriver})`);
});
// Explicit timeouts (anti slow-loris), carried over from the node:http server.
server.requestTimeout = 15000;
server.headersTimeout = 10000;

// Close the server then the storage so it flushes on the way out. A force-exit
// timer guards against a wedged keep-alive socket blocking close.
function shutdown(): void {
  const force = setTimeout(() => process.exit(0), 5000);
  force.unref();
  server.close(() => {
    storage.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
