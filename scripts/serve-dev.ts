// Dev-only launcher of the middle with the import-from-the-tool routes
// enabled (ADR 027): sets a throwaway shared secret when none is given,
// then starts middle/main.ts. Never used on the client platform — there the
// secret comes from the platform's secret store (KANBAN_IMPORT_SECRET).

export {};

process.env["KANBAN_IMPORT_SECRET"] ??= "dev-import";
console.log("serve-dev : import par l’outil activé (secret de développement « dev-import »)");
await import("../middle/main.ts");
