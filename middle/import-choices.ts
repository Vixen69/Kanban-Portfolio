// The PMO's answers to the « Doutes à trancher » of an import (ADR 062),
// as the import routes receive them: `choices` in the JSON body, doubt id
// → `{ option, sticky }` (apply this option; sticky = « ne plus me
// demander pour ce projet ») or `{ forget: true }` (« Redemander »: the
// remembered choice is forgotten, the tool's proposal applies). The shape
// is checked here (a French 400); each option is checked against the
// audit the request re-runs (checkChoices: an option its doubt does not
// offer is a 400, a choice whose doubt vanished is ignored and said).
// Both routes take them: the audit to preview them, the load to apply
// and trace them.

import type { ImportChoice } from "../core/import-types.ts";
import { BadRequest } from "./errors.ts";

/** More answers than any real audit raises: a malformed or hostile body. */
const MAX_CHOICES = 5000;
const MAX_ID = 400;

function parseOne(id: string, value: unknown): ImportChoice {
  if (id === "" || id.length > MAX_ID) throw new BadRequest("Identifiant de doute invalide.");
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequest(`Choix invalide pour le doute « ${id} ».`);
  const { option, sticky, forget } = value as { option?: unknown; sticky?: unknown; forget?: unknown };
  if (forget === true && option === undefined) return { forget: true };
  if (typeof option !== "string" || option === "" || option.length > MAX_ID) {
    throw new BadRequest(`Choix invalide pour le doute « ${id} » : option manquante (ou « forget: true » pour redemander).`);
  }
  if (sticky !== undefined && typeof sticky !== "boolean") throw new BadRequest(`Choix invalide pour le doute « ${id} » : « sticky » vrai ou faux.`);
  return { option, sticky: sticky === true };
}

/**
 * The choices of an import request (`choices` in the body); none when
 * absent.
 * Input: the JSON body. Output: doubt id → choice.
 * Failure: BadRequest (French) on a value that is not an object, too many
 * entries, an entry without option (and not a « forget »), a non-boolean
 * sticky, an over-long id or option.
 */
export function parseChoices(body: unknown): Map<string, ImportChoice> {
  const raw = typeof body === "object" && body !== null ? (body as { choices?: unknown }).choices : undefined;
  const choices = new Map<string, ImportChoice>();
  if (raw === undefined) return choices;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new BadRequest("Choix des doutes invalides.");
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_CHOICES) throw new BadRequest("Trop de choix de doutes.");
  for (const [id, value] of entries) choices.set(id, parseOne(id, value));
  return choices;
}
