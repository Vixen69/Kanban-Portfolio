// One-command launcher to test the app like a user (`npm start`): seed the
// fixtures if needed, start the middle (:8787) and the front dev server
// (:5173), wait until both answer, then open the browser. Ctrl+C stops
// everything. No dependency — node:child_process + global fetch only.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const MIDDLE = "http://127.0.0.1:8787/api/config";
const FRONT = "http://127.0.0.1:5173";
const WIN = process.platform === "win32";
const children: ChildProcess[] = [];

// Seeds the JSONL store from fixtures. Runs unconditionally because seed.ts is
// itself idempotent (it skips when the store already holds data); a file-exists
// check would be wrong — the middle creates an empty header-only file on first
// start, which would then look "already seeded".
function seed(): void {
  console.log("· vérification / peuplement des fixtures…");
  const result = spawnSync("node", ["scripts/seed.ts"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, KANBAN_ALLOW_SEED: "1" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Refuses to start over an already-running instance. Without this check the
// readiness polls below can be answered by a FOREIGN process (seen on the
// client VM: an orphan Vite on 5173 made the launcher claim "front prêt"
// and open the wrong app while the real one hopped ports).
async function failIfAlreadyRunning(): Promise<void> {
  for (const [url, name] of [[MIDDLE, "middle (8787)"], [FRONT, "front (5173)"]] as const) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1500) });
    } catch {
      continue; // nothing listening — the port is ours
    }
    console.error(`Une instance du tableau tourne déjà — ${name} répond.`);
    console.error("La fermer (Ctrl+C dans sa fenêtre) ou l'utiliser telle quelle, puis relancer.");
    process.exit(1);
  }
}

// Spawns a long-lived child and prefixes its output with the label. On POSIX
// the child gets its own process group so shutdown can kill the whole tree —
// killing bare npm leaves its Vite grandchild alive (the 5173 orphan above).
function launch(label: string, cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { cwd: ROOT, shell: true, env: process.env, detached: !WIN });
  children.push(child);
  const pipe = (chunk: Buffer) => process.stdout.write(`[${label}] ${chunk}`);
  child.stdout?.on("data", pipe);
  child.stderr?.on("data", pipe);
}

// Polls url until it answers (any non-5xx) or times out (~60s).
async function waitFor(url: string, name: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} ne répond pas (${url})`);
}

function openBrowser(url: string): void {
  const opener = WIN
    ? { cmd: "cmd", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { cmd: "open", args: [url] }
      : { cmd: "xdg-open", args: [url] };
  const child = spawn(opener.cmd, opener.args, { stdio: "ignore", detached: true });
  // Minimal VMs may lack xdg-open: the failure used to be silent, leaving the
  // user staring at a running server with no window. Say what to do instead.
  child.on("error", () => {
    console.log(`· ouverture automatique impossible — ouvrir ${url} dans le navigateur.`);
  });
  child.unref();
}

function shutdown(code = 0): void {
  for (const child of children) {
    if (!child.pid) continue;
    if (WIN) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      continue;
    }
    // Negative pid = the whole process group (shell + npm + vite), so no
    // orphan survives a Ctrl+C or a closed window.
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  await failIfAlreadyRunning();
  seed();
  launch("middle", "node", ["middle/main.ts"]);
  await waitFor(MIDDLE, "middle");
  console.log("· middle prêt : http://127.0.0.1:8787");
  launch("front", "npm", ["run", "-w", "@portfolio-kanban/front", "dev"]);
  await waitFor(FRONT, "front");
  console.log(`· front prêt — ouverture de ${FRONT}  (Ctrl+C pour tout arrêter)`);
  openBrowser(FRONT);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
