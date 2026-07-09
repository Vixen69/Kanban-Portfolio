// Express transport for the middle (ADR 010/011/012/013). Wraps the
// transport-agnostic API logic (api.ts, cards.ts) in routes; all domain logic
// stays in core/. Security headers on every response, a 64 KB JSON body cap,
// same-origin only (no CORS). Zero egress: the middle only listens and
// responds. The front is served by its own container (nginx), so the middle
// has no static serving.

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { BoardStorage } from "../core/ports.ts";
import { BadRequest, getBoard, getConfig, postEvent, putConfig } from "./api.ts";
import { postCard } from "./cards.ts";
import type { ConfigStore } from "./config-store.ts";
import { logError, logRequest } from "./log.ts";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
};

const MAX_BODY = "64kb";

/** What the transport needs to answer requests. */
export interface MiddleDeps {
  storage: BoardStorage;
  configStore: ConfigStore;
}

// HTTP status carried by express.json's own errors (413 too large, 400 parse).
function bodyErrorStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

// Maps any thrown value to a safe response: BadRequest → 400, oversized body →
// 413, malformed JSON → 400, anything else → 500 (logged, ids/message only).
function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Once the response has started, there is nothing safe to send — end it
  // rather than delegating to the default handler (which would tear the
  // socket down and surface as an uncaught error).
  if (res.headersSent) {
    logError(`${req.method} ${req.path}`, err);
    res.end();
    return;
  }
  if (err instanceof BadRequest) {
    res.status(400).json({ error: err.message });
    return;
  }
  const status = bodyErrorStatus(err);
  if (status === 413) {
    res.status(413).json({ error: "Corps de requête trop volumineux." });
    return;
  }
  if (status === 400) {
    res.status(400).json({ error: "JSON invalide." });
    return;
  }
  logError(`${req.method} ${req.path}`, err);
  res.status(500).json({ error: "Erreur interne." });
}

// Mounts the six API routes. Handlers throw BadRequest on invalid input;
// Express 5 forwards both a synchronous throw and a rejected promise from an
// async handler to errorHandler (→ 400/500). The storage-backed routes are
// async (the BoardStorage port is async — e.g. the Postgres driver).
function mountRoutes(app: Express, deps: MiddleDeps): void {
  app.get("/api/config", (_req: Request, res: Response) => {
    const result = getConfig(deps.configStore.getRuntime());
    res.status(result.status).json(result.body);
  });
  app.get("/api/config/default", (_req: Request, res: Response) => {
    const result = getConfig(deps.configStore.getDefaults());
    res.status(result.status).json(result.body);
  });
  app.put("/api/config", (req: Request, res: Response) => {
    const result = putConfig(deps.configStore, req.body);
    res.status(result.status).json(result.body);
  });
  app.get("/api/board", async (_req: Request, res: Response) => {
    const result = await getBoard(deps.storage);
    res.status(result.status).json(result.body);
  });
  app.post("/api/cards", async (req: Request, res: Response) => {
    const result = await postCard(deps.storage, deps.configStore.getRuntime(), req.body);
    res.status(result.status).json(result.body);
  });
  app.post("/api/events", async (req: Request, res: Response) => {
    const result = await postEvent(deps.storage, deps.configStore.getRuntime(), req.body);
    res.status(result.status).json(result.body);
  });
}

/**
 * Builds the Express app bound to the given dependencies.
 * Inputs: the storage and the config store (runtime override + defaults).
 * Output: an Express application (not yet listening).
 * Failure: none here; per-request errors become 4xx/5xx via errorHandler.
 */
export function createApp(deps: MiddleDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => logRequest(req.method, req.path, res.statusCode));
    next();
  });
  app.use(express.json({ limit: MAX_BODY }));
  mountRoutes(app, deps);
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Ressource introuvable." });
  });
  app.use(errorHandler);
  return app;
}
