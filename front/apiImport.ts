// The import calls (ADR 027): audit and load, over the same fetch wrapper
// as the rest of the API. Both carry the PMO's answers to the « Doutes à
// trancher » (ADR 062): the audit to preview them, the load to apply and
// trace them.

import type { DomainDecision, ImportAuditResult, ImportChoice, ImportFilePayload, ImportLoadResult } from "../core/import-types.ts";
import { jsonInit, request } from "./api.ts";

/** The PMO's answers to the doubts, by doubt id (front/importDoubts.ts choicesPayload). */
export type ImportChoices = Readonly<Record<string, ImportChoice>>;

/**
 * POST /api/import/audit — audits a set of PPM export files (ADR 027);
 * nothing is written. Inputs: the files (base64), the exercise year read
 * (ADR 035), the doubts' choices to preview (ADR 062; none = the tool's
 * choices and the remembered ones). Output: the report, its counts, the
 * doubts. Failure: throws ApiError (400 on bad files or year, or a choice
 * on a doubt or an option these files do not raise).
 */
export function postImportAudit(files: ImportFilePayload[], exercise: number, choices: ImportChoices = {}): Promise<ImportAuditResult> {
  return request<ImportAuditResult>("/api/import/audit", jsonInit("POST", { files, exercise, choices }));
}

/**
 * POST /api/import/load — audits then loads the files into ONE exercise's
 * board (ADR 035), with the PMO's domain decisions by card id (ADR 036)
 * and the doubts' choices by doubt id (ADR 062 — each traced in the log).
 * Inputs: the files, the exercise year, the decisions, the choices.
 * Output: the report plus what the load wrote. Failure: throws ApiError
 * (400 on a closed year, a file set with no project on that year, an
 * undecided conflict, or a choice on an unknown doubt or option).
 */
export function postImportLoad(
  files: ImportFilePayload[], exercise: number, decisions: Readonly<Record<string, DomainDecision>>, choices: ImportChoices = {},
): Promise<ImportLoadResult> {
  return request<ImportLoadResult>("/api/import/load", jsonInit("POST", { files, exercise, decisions, choices }));
}
