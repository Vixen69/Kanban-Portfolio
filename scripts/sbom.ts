// Generates a CycloneDX 1.5 SBOM (sbom.json) from package-lock.json.
// Hand-written on purpose: the SBOM tool must not itself add dependencies.

import { readFileSync, writeFileSync } from "node:fs";

interface LockPackage {
  version?: string;
  dev?: boolean;
  integrity?: string;
}

interface LockFile {
  name?: string;
  version?: string;
  packages?: Record<string, LockPackage>;
}

interface Component {
  type: "library";
  "bom-ref": string;
  name: string;
  version: string | undefined;
  purl: string;
  scope: "optional" | "required";
  hashes?: { alg: "SHA-512"; content: string }[];
}

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as LockFile;
const rootName = lock.name ?? "portfolio-kanban";
const rootVersion = lock.version ?? "0.0.0";

const components: Component[] = [];
for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (path === "") continue; // the root package itself
  const name = path.replace(/^.*node_modules\//, "");
  const component: Component = {
    type: "library",
    "bom-ref": `pkg:npm/${name}@${info.version}`,
    name,
    version: info.version,
    purl: `pkg:npm/${name}@${info.version}`,
    scope: info.dev ? "optional" : "required",
  };
  if (info.integrity?.startsWith("sha512-")) {
    component.hashes = [{ alg: "SHA-512", content: info.integrity.slice("sha512-".length) }];
  }
  components.push(component);
}
components.sort((a, b) => a.name.localeCompare(b.name));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    component: { type: "application", name: rootName, version: rootVersion },
    // Reproducible output: no timestamp, no environment data.
  },
  components,
};

writeFileSync(new URL("../sbom.json", import.meta.url), JSON.stringify(bom, null, 2) + "\n");
console.log(`✓ sbom.json genere (${components.length} composants)`);
