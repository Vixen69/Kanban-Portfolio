// « Doutes à trancher à l'import » (ADR 062, author 2026-09-30: « quand j'ai
// des projets douteux pris pour le périmètre, il faudrait que j'aie une
// option pour le merge : quelle valeur on garde, quelle valeur on garde
// pas ; me dire pourquoi c'est douteux, est-ce qu'on le prend, est-ce
// qu'on le prend pas »). The audit lists every DECIDABLE doubt with its
// choices and the tool's own choice; the load takes the PMO's choices,
// applies them to the same files and traces each one in the log (a
// `settled` event). A choice marked « ne plus me demander » is reapplied
// silently at later imports while the doubt stays the same. Shared by the
// middle (producer) and the front (consumer) — types only, no logic.

/**
 * What a doubt is about:
 * - « couts-fact »: the COUT PREV rows of one project disagree on one fact
 *   (état, type, portefeuille, nom) — which value is kept;
 * - « duplicate-row »: the same Id on several rows of Projets,
 *   ProjetsJalons, ProjetsCdP or SP — which row is read;
 * - « join »: a side file's row found by NAME is refused or ambiguous
 *   (another Id, several Ids) — attach it or not;
 * - « figure »: an ambiguous amount (« 1,035 » in a k€ column) — French
 *   or English reading;
 * - « me-unreadable »: a project kept on an unreadable ME cell alone —
 *   keep it or set it aside;
 * - « identity »: several hand-made cards on one code, an adoption whose
 *   titles differ, two export projects on one identity — which card.
 */
export type ImportDoubtKind = "couts-fact" | "duplicate-row" | "join" | "figure" | "me-unreadable" | "identity";

/** One choice of a doubt. */
export interface ImportDoubtOption {
  /**
   * Stable id, derived from the option's content — never from a person's
   * name: what a choice names, written in the log. A line number
   * (« ligne:N ») only on a doubt asked each time (`askedEachTime`).
   */
  id: string;
  /** Plain French: the choice as the PMO reads it (« état « Budget présenté » ×2 »). */
  label: string;
  /** Plain French: what the load does with this choice (« le projet sort du périmètre : … »); null when nothing to add. */
  consequence: string | null;
}

/**
 * How the applied choice came:
 * - « proposé »: the tool's own choice (nothing asked for this doubt);
 * - « mémorisé »: a choice remembered with « ne plus me demander », the
 *   doubt unchanged since;
 * - « choisi »: the choice sent with this request.
 */
export type ImportDoubtHow = "proposé" | "mémorisé" | "choisi";

/** One decidable doubt of an import. */
export interface ImportDoubt {
  /**
   * Stable across imports: `kind|year|project key|detail` (the project
   * key is the code, else « nom:<normalized name> »; the detail the fact,
   * the file or the column). A choice names it.
   */
  id: string;
  kind: ImportDoubtKind;
  /** The board card the doubt concerns — the would-be « code@année » when the project is not on the board. */
  cardId: string;
  /** The project code, null when the project has none. */
  code: string | null;
  title: string;
  /**
   * Plain French, a few words: what the question is on inside the project
   * (« état », « ligne SP », « chef de projet (ProjetsCdP) ») — one project
   * may raise several doubts, each answered and remembered on its own.
   */
  subject: string;
  /** Plain French: why it is doubtful. */
  why: string;
  /** At least two; the proposed one first. */
  options: ImportDoubtOption[];
  /** The tool's own choice (today's behaviour). */
  proposed: string;
  /** The option this audit / load applied. */
  applied: string;
  how: ImportDoubtHow;
  /**
   * The remembered choice (« ne plus me demander ») still valid for this
   * doubt: its option, when and by whom it was written (the `settled`
   * event's ts and actor — « Déjà tranchés » shows them); null when none.
   */
  remembered: { option: string; ts: string; actor: string } | null;
  /** Changes when the doubt changes (other competing values, another cell): a remembered choice then no longer applies. */
  fingerprint: string;
  /**
   * Set when the options differ only by a person's name (the chefs de
   * projet of a ProjetsCdP Id, Projets rows differing only in their
   * Responsables): options by line number, never remembered — no « ne
   * plus me demander », the question comes back at each import, the log
   * keeps « ligne N » only (ADR 062, « Données personnelles »). Absent
   * otherwise.
   */
  askedEachTime?: true;
}

/**
 * The PMO's answer to one doubt, sent with a load (or an audit, to
 * preview it):
 * - `{ option, sticky }`: apply this option; `sticky: true` = « ne plus
 *   me demander pour ce projet » — remembered and reapplied silently at
 *   later imports while the doubt is the same; false = this load only;
 * - `{ forget: true }`: « Redemander » — the remembered choice is
 *   forgotten, the tool's proposal applies to this load, and the question
 *   comes back at the next import.
 * Each answer is traced in the log by the load (a `settled` event).
 */
export type ImportChoice = { option: string; sticky: boolean } | { forget: true };

/** A doubt whose applied choice is not the tool's proposal (remembered or chosen), as the change report names it. */
export interface ImportSettled {
  cardId: string;
  code: string | null;
  title: string;
  kind: ImportDoubtKind;
  /** The doubt's why, for the report line. */
  why: string;
  /** The applied option's label. */
  option: string;
  how: Exclude<ImportDoubtHow, "proposé">;
}
