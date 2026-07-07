// Dev-only: re-import a Claude Design export into design/. A Design export is
// one self-contained HTML file whose component sources are embedded in a
// "__bundler/manifest" script as gzip+base64 entries (the browser rebuilds
// them at runtime). This script decompresses those entries, writes each JSX
// component back to design/<name>.jsx (matched to the existing file it most
// resembles), and prints a per-file delta so a re-sync is one command:
//
//   node scripts/import-design.ts ["design/Portefeuille DSI - Kanban NMO.html"]
//
// It only rewrites the design/ REFERENCE (never app code). After it runs,
// `git diff design/` shows exactly what the designer changed; reconcile the
// implementation from there. Node built-ins only.

import { gunzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DESIGN_DIR = fileURLToPath(new URL("../design/", import.meta.url));

interface ManifestEntry { mime: string; compressed?: boolean; data: string }
interface Source { text: string; lines: number }

// Reads the data-bearing "__bundler/manifest" script (not the loader that
// merely mentions it): the LAST tag whose content parses as the JSON map.
function readManifest(html: string): Record<string, ManifestEntry> {
  const tag = /<script type="__bundler\/manifest">/g;
  let match: RegExpExecArray | null;
  let manifest: Record<string, ManifestEntry> | null = null;
  while ((match = tag.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const end = html.indexOf("</script>", start);
    try {
      const parsed = JSON.parse(html.slice(start, end)) as unknown;
      if (parsed && typeof parsed === "object") manifest = parsed as Record<string, ManifestEntry>;
    } catch {
      // Not the data tag (the loader script mentions the type in a selector).
    }
  }
  if (manifest === null) throw new Error("Aucun manifest « __bundler/manifest » exploitable dans le bundle.");
  return manifest;
}

// Decompresses one entry to UTF-8 text (gzip magic H4sI when compressed).
function decode(entry: ManifestEntry): string {
  const buffer = Buffer.from(entry.data, "base64");
  return (entry.compressed ? gunzipSync(buffer) : buffer).toString("utf8");
}

// The component sources are the JSX modules — application/javascript or
// text/jsx. The three big text/javascript entries are the React/Babel runtime
// libraries and the font/woff2 entries are assets; both are skipped.
function componentSources(manifest: Record<string, ManifestEntry>): Source[] {
  const sources: Source[] = [];
  for (const entry of Object.values(manifest)) {
    if (entry.mime === "application/javascript" || entry.mime === "text/jsx") {
      const text = decode(entry);
      sources.push({ text, lines: text.split("\n").length });
    }
  }
  return sources;
}

// A source's significant lines (trimmed, length > 8) as a set, for matching.
function lineSet(text: string): Set<string> {
  return new Set(text.split("\n").map((line) => line.trim()).filter((line) => line.length > 8));
}

// Picks the existing design/*.jsx a source most resembles (shared-line ratio).
// Each existing file is claimed at most once (the best-scoring source wins).
function matchByContent(sources: Source[], existing: Record<string, string>): Map<string, Source> {
  const names = Object.keys(existing);
  const sets = Object.fromEntries(names.map((name) => [name, lineSet(existing[name] as string)]));
  const result = new Map<string, Source>();
  const scored = sources.map((source) => {
    const set = lineSet(source.text);
    let best = names[0] as string;
    let bestScore = -1;
    for (const name of names) {
      let shared = 0;
      for (const line of set) if ((sets[name] as Set<string>).has(line)) shared += 1;
      const score = shared / Math.max(set.size, 1);
      if (score > bestScore) { bestScore = score; best = name; }
    }
    return { source, best, bestScore };
  }).sort((a, b) => b.bestScore - a.bestScore);
  for (const { source, best } of scored) {
    if (!result.has(best)) result.set(best, source);
  }
  return result;
}

// Writes each matched source and prints old→new line counts (changed/=).
function applyAndReport(matches: Map<string, Source>, existing: Record<string, string>): number {
  let changed = 0;
  for (const [name, source] of [...matches].sort((a, b) => a[0].localeCompare(b[0]))) {
    const before = existing[name] as string;
    const isSame = before.replace(/\r\n/g, "\n") === source.text.replace(/\r\n/g, "\n");
    if (!isSame) changed += 1;
    writeFileSync(join(DESIGN_DIR, name), source.text);
    const old = before.split("\n").length;
    console.log(`  ${name.padEnd(20)} ${String(old).padStart(4)} → ${String(source.lines).padStart(4)} lignes  ${isSame ? "=" : "CHANGÉ"}`);
  }
  return changed;
}

function main(): void {
  const argPath = process.argv[2];
  const htmlPath = argPath
    ? (argPath.startsWith("/") || /^[A-Za-z]:/.test(argPath) ? argPath : join(process.cwd(), argPath))
    : join(DESIGN_DIR, (readdirSync(DESIGN_DIR).find((f) => f.endsWith(".html")) ?? "index.html"));
  const html = readFileSync(htmlPath, "utf8");
  const manifest = readManifest(html);
  const sources = componentSources(manifest);
  const existing: Record<string, string> = {};
  for (const file of readdirSync(DESIGN_DIR).filter((f) => f.endsWith(".jsx"))) {
    existing[file] = readFileSync(join(DESIGN_DIR, file), "utf8");
  }
  if (Object.keys(existing).length === 0) throw new Error("Aucun design/*.jsx de référence : impossible de nommer les sources extraites.");
  console.log(`Bundle : ${htmlPath}`);
  console.log(`Sources de composant extraites : ${sources.length} · fichiers de référence : ${Object.keys(existing).length}`);
  const matches = matchByContent(sources, existing);
  // Loud on divergence: a collision drops a source (a component was added or
  // renamed); a stranded file was never matched (a component was removed).
  if (matches.size < sources.length) {
    console.warn(`⚠ ${sources.length - matches.size} source(s) non appariée(s) — collision de correspondance (composant ajouté/renommé côté design ?). Résultat à vérifier à la main.`);
  }
  const stranded = Object.keys(existing).filter((name) => !matches.has(name));
  if (stranded.length > 0) {
    console.warn(`⚠ Fichier(s) de référence non mis à jour (aucune source correspondante) : ${stranded.join(", ")} — composant supprimé côté design ?`);
  }
  const changed = applyAndReport(matches, existing);
  console.log(`\n${changed} fichier(s) modifié(s). Vérifiez « git diff design/ » puis réconciliez l’implémentation.`);
}

main();
