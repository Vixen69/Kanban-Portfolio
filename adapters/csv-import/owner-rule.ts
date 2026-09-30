// The chef de projet among Responsable 1→3 (R6), shared by the Projets
// onglet and the ProjetsCdP sheet. Author, 2026-09-30: « en général il est
// responsable 1, ou responsable 2 quand le 1 est un responsable de domaine ;
// des fois c'est le responsable de domaine, s'il a son nom et qu'il n'y a
// pas d'autre nom ». So: the first Responsable who is not a PARAM domain
// lead; when every name given is a domain lead, the first of them.

/** The chef de projet read from one row, and how it was chosen. */
export interface OwnerPick {
  owner: string | null;
  /** Domain leads passed over for another name. */
  leadsSkipped: number;
  /** True when the only names were domain leads and the first one was taken. */
  leadTaken: boolean;
}

/**
 * Picks the chef de projet from the Responsable cells, in column order.
 * Inputs: the raw cells (Responsable 1, 2, 3 — blanks allowed), the
 * domain-lead test (null without PARAM: nobody is known as a lead).
 * Output: the OwnerPick; owner null when every cell is blank.
 * Failure modes: none.
 */
export function pickOwner(cells: readonly string[], isLead: ((cell: string) => boolean) | null): OwnerPick {
  const names = cells.map((c) => c.trim()).filter((c) => c !== "");
  if (names.length === 0) return { owner: null, leadsSkipped: 0, leadTaken: false };
  const other = isLead === null ? names[0] : names.find((name) => !isLead(name));
  if (other !== undefined) {
    return { owner: other, leadsSkipped: names.indexOf(other), leadTaken: false };
  }
  return { owner: names[0] ?? null, leadsSkipped: 0, leadTaken: true };
}
