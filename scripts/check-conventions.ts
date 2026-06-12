// Enforces the code conventions of CLAUDE.md section 8 that a typechecker
// cannot: 300 lines max per file, 40 lines max per function (heuristic
// brace-matching — cyclomatic complexity awaits the lint-config decision).
// Exit code 1 with a readable report when a rule is broken.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCANNED_DIRS = ["core", "adapters", "fixtures", "ui", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".mjs"];
const MAX_FILE_LINES = 300;
const MAX_FUNCTION_LINES = 40;
const FUNCTION_START =
  /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+|^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>\s*\{\s*$/;

interface Finding {
  line: number;
  length: number;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) yield path;
  }
}

function functionLengths(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!FUNCTION_START.test(lines[i] ?? "")) continue;
    let depth = 0;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      for (const char of lines[j] ?? "") {
        if (char === "{") {
          depth++;
          started = true;
        } else if (char === "}") depth--;
      }
      if (started && depth <= 0) {
        const length = j - i + 1;
        if (length > MAX_FUNCTION_LINES) findings.push({ line: i + 1, length });
        break;
      }
    }
  }
  return findings;
}

let failed = false;
for (const dir of SCANNED_DIRS) {
  let files: string[];
  try {
    files = [...walk(join(ROOT, dir))];
  } catch {
    continue; // directory absent (e.g. before a sprint creates it)
  }
  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    if (lines.length > MAX_FILE_LINES) {
      console.error(`✗ ${rel}: ${lines.length} lignes (max ${MAX_FILE_LINES})`);
      failed = true;
    }
    for (const finding of functionLengths(lines)) {
      console.error(`✗ ${rel}:${finding.line}: fonction de ${finding.length} lignes (max ${MAX_FUNCTION_LINES})`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("✓ conventions respectees (fichiers <= 300 lignes, fonctions <= 40 lignes)");
