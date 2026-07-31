// Public surface of the csv-import adapter (étape 1 : audit mode). The
// sync CLI composes these; everything else in this directory is internal.

export { runImportAudit } from "./orchestrate.ts";
export type { AuditResult, InputFile } from "./orchestrate.ts";
export { renderReport } from "./render-report.ts";
export type { ImportReport } from "./report.ts";
export type { RdomTable } from "./rdom.ts";
export type { SpTotalTable, SubjectDraft } from "./sp-total.ts";
export type { ConsolideTable } from "./consolide.ts";
export type { CardAssembly, EnrichedCard } from "./enrich.ts";
