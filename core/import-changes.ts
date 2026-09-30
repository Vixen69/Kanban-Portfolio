// The readable import report (ADR 055, author 2026-09-30: « dans ce qui a
// changé, les valeurs qui sont actualisées, je dois pouvoir les voir
// rapidement à un endroit et savoir vraiment ce qu'il a pris »): which file
// was taken for each source, what a load changes on the board card by card
// (the ONE change engine of snapshot-diff.ts), which projects enter, leave
// or come back and WHY, and which facts the files left blank kept their
// value (ADR 054). The audit and the load return the same object — one
// import mode, previewed then applied. Types only; no logic.

import type { CardChange } from "./change-types.ts";

/** The expected sources of an import, in the order they are read out. */
export type ImportSource = "couts" | "param" | "projets" | "cdp" | "jalons" | "sp" | "pdc" | "profils";

/**
 * What became of one expected source:
 * - « pris »: a received file was read for it;
 * - « absent »: no received file matches it;
 * - « écarté »: a matching file came in an old format that is no longer read;
 * - « douteux »: a file looks like it but misses columns — not read.
 */
export type ImportFileStatus = "pris" | "absent" | "écarté" | "douteux";

/** One expected source and what the import did with it. */
export interface ImportFileEntry {
  source: ImportSource;
  /** The source's French name (« Coût prévisionnel (COUT PREV) », « SP (exercice ou total) »…). */
  label: string;
  /** The received file read for it, null when none. */
  file: string | null;
  status: ImportFileStatus;
  /**
   * Plain French, null when there is nothing to add: for a missing source
   * what the load does instead (« budgets gardés », « positions gardées »…),
   * for a taken one its role when it is not the obvious one (recoupement).
   */
  consequence: string | null;
  /** The other received files that match this source and were not read (a second export, a near miss). */
  others: string[];
}

/** A received file that matches no expected source. */
export interface ImportUnrecognized {
  file: string;
  /** Plain French: why (« aucune colonne connue », « pas un fichier CSV »…). */
  detail: string;
}

/** A card named in the report. code: the project code, null when the project has none. */
export interface ImportCardRef {
  cardId: string;
  code: string | null;
  title: string;
}

/** A card the load creates. */
export interface ImportEntered extends ImportCardRef {
  /** Plain French (« nouveau dans le périmètre COUT PREV — état « Budget validé », type « Etude » »). */
  reason: string;
  /**
   * Set when nothing resolved the project's domain and the card falls back
   * to the first configured domain (« domaine non résolu → A&D par défaut,
   * à corriger »); null otherwise.
   */
  domainWarning: string | null;
}

/** A hand-made card the load adopts (ADR 059): the board's card becomes the export's project, its id kept. */
export interface ImportAdopted extends ImportCardRef {
  /** The title the card carried on the board before the load (title: the export's). */
  manualTitle: string;
}

/** A card the load marks absent (∅, never deleted), or lists again. */
export interface ImportLeft extends ImportCardRef {
  /** Plain French: the perimeter's exclusion motive, else « plus présent dans le fichier … ». */
  reason: string;
}

/** A project the perimeter rule left out of this exercise. */
export interface ImportExcluded {
  code: string;
  name: string;
  /** Plain French: the first rule it failed, with the offending value. */
  reason: string;
}

/** One fact the files left blank on cards the board holds: the stored value stood (ADR 054). */
export interface ImportKeptFact {
  /** The fact in the report's words (« chef de projet », « estimé k€ », « plan de charge par métier »…). */
  label: string;
  cards: ImportCardRef[];
}

/** The headline counts. */
export interface ImportChangeCounts {
  /** Cards on the board the files list again (re-read — not necessarily changed). */
  updated: number;
  created: number;
  /** Cards marked absent from the import (∅). */
  absent: number;
  /** Cards absent before, listed again. */
  back: number;
  /** Cards the export moves to another column. */
  moved: number;
  /** Hand-placed cards the export would move: left where they are (ADR 026). */
  divergences: number;
  /** Cards with at least one refreshed value (title, type, domain, chef de projet, figure, date RDR, plan de charge). */
  valuesChanged: number;
  /** Cards on which at least one fact left blank by the files kept its stored value (ADR 054). */
  valuesKept: number;
}

/** The readable report of one audit or load (ADR 055). */
export interface ImportChanges {
  /** One entry per expected source, in ImportSource order. */
  files: ImportFileEntry[];
  unrecognized: ImportUnrecognized[];
  /** The perimeter: where it was read, how many projects it kept, which it left out and why. */
  perimeter: {
    /** « COUT PREV » or « Projets »; null when no perimeter file came. */
    source: string | null;
    file: string | null;
    retained: number;
    excluded: ImportExcluded[];
  };
  counts: ImportChangeCounts;
  entered: ImportEntered[];
  left: ImportLeft[];
  back: ImportLeft[];
  /**
   * The board now against the board after the load, card by card (the
   * change engine of snapshot-diff.ts): moves, domain, type, title, chef de
   * projet, figures, date RDR, plan de charge, absences.
   */
  cardChanges: CardChange[];
  /** The facts kept from the board, fact by fact, with the cards (ADR 054). */
  kept: ImportKeptFact[];
  /** Hand-made cards the load adopts instead of creating a duplicate (ADR 059). */
  adopted: ImportAdopted[];
  /** Cards deleted on the board that the files still carry: « supprimées du tableau, ignorées » — never re-created (ADR 058). */
  deletedSkipped: ImportCardRef[];
  /** Identity questions the load could not settle alone (ADR 058/059), plain French, one per case. */
  identityDoubts: string[];
}
