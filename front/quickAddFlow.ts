// The « + Sujet » creation flow (ADR 057), kept out of React so it can be
// tested: the modal closes only once the server has accepted the card, so a
// refusal leaves everything typed in place for the PMO to correct. Pure: no
// React, no network (the store's createCard is passed in).

/** The steps of one creation, supplied by the shell. */
export interface CreationSteps<Input> {
  /** POSTs the intent; resolves the new card's id, or null when refused (lastError says why). */
  create: (input: Input) => Promise<string | null>;
  /** Closes the QuickAdd modal. */
  close: () => void;
  /** Opens the new card's « Modifier » form. */
  openEdit: (id: string) => void;
}

/**
 * Runs one creation: create, then — only when an id comes back — close
 * the modal and open the card's « Modifier » form.
 * Inputs: the shell's steps and the creation intent.
 * Output: true when the card was created; false when refused, in which
 * case nothing is closed or opened (the modal keeps its draft).
 * Failure modes: none of its own — create is expected to resolve null
 * rather than throw; a throw propagates unchanged and closes nothing.
 */
export async function runCreation<Input>(steps: CreationSteps<Input>, input: Input): Promise<boolean> {
  const id = await steps.create(input);
  if (id === null) return false;
  steps.close();
  steps.openEdit(id);
  return true;
}

/**
 * Why a creation from the exercise shown is refused before it is tried:
 * the middle refuses any card in a closed exercise (a year below the
 * current one), with the same words.
 * Inputs: the exercise shown and the current exercise year.
 * Output: the French notice, or null when creating is allowed (the
 * current year or a year in preparation).
 * Failure modes: none.
 */
export function closedExerciseNotice(viewYear: number, currentYear: number): string | null {
  return viewYear < currentYear ? `Exercice ${viewYear} clos : création refusée.` : null;
}
