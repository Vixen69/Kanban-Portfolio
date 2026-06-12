// Vendoring ritual: packs every locked dependency as a tarball under
// vendor/ so the client-side machine installs fully offline (npm ci with
// a cache rebuilt from these tarballs). Run before each crossing.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

interface LockFile {
  packages?: Record<string, { version?: string }>;
}

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as LockFile;
const vendorDir = new URL("../vendor/", import.meta.url);
mkdirSync(vendorDir, { recursive: true });

const specs: string[] = [];
for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (path === "") continue;
  const name = path.replace(/^.*node_modules\//, "");
  specs.push(`${name}@${info.version}`);
}

console.log(`Telechargement de ${specs.length} tarballs vers vendor/ ...`);
const destination = vendorDir.pathname.replace(/^\/([A-Za-z]:)/, "$1");
execFileSync("npm", ["pack", "--silent", "--pack-destination", destination, ...specs], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log("✓ vendor/ a jour — verifier les sha256 apres la traversee");
