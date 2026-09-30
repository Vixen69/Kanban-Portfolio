// The audit / load cycle of the import pane (ADR 027): one request at a
// time, the last audit kept when a request fails so the report stays on
// screen with the error. A fresh audit wipes the domain decisions (ADR
// 036) and the answers to the « Doutes à trancher » (ADR 062); a new audit
// « avec ces choix » keeps both and sends the answers, so that the report
// read is the report loaded; the load sends the decisions and the answers.

import { useState } from "react";
import type { ImportAuditResult, ImportFilePayload } from "../core/import-types.ts";
import { ApiError } from "./api.ts";
import { postImportAudit, postImportLoad } from "./apiImport.ts";
import type { ImportChoices } from "./apiImport.ts";
import { choicesPayload, EMPTY_DOUBT_STATE, initialDoubtState } from "./importDoubts.ts";
import type { DoubtState } from "./importDoubts.ts";
import type { Decisions } from "./components/ImportConflicts.tsx";
import type { ImportPhase } from "./components/ImportOutcome.tsx";

/** What a request of the pane does: a fresh audit, a new audit with the answers, the load. */
export type ImportRun = "audit" | "preview" | "load";

function messageOf(cause: unknown): string {
  return cause instanceof ApiError || cause instanceof Error ? cause.message : "Erreur inconnue.";
}

// The answers a request sends: none for a fresh audit (the tool's choices and the remembered ones).
function choicesFor(what: ImportRun, audited: ImportAuditResult | null, doubts: DoubtState): ImportChoices {
  return what === "audit" || audited === null ? {} : choicesPayload(audited.doubts ?? [], doubts);
}

/**
 * The import pane's requests and what they left.
 * Inputs: the files picked (name + base64), the exercise, onLoaded (the
 * board refetches after a load). Output: the phase, the error, the last
 * audit, the domain decisions and the doubts' answers with their
 * setters, run (audit / preview / load), reset. Failure modes: none — a
 * refused request sets `error` (its French message) and keeps the last
 * audit on screen.
 */
export function useImport(files: readonly Pick<ImportFilePayload, "name" | "base64">[], exercise: number, onLoaded: () => void) {
  const [phase, setPhase] = useState<ImportPhase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [doubts, setDoubts] = useState<DoubtState>(EMPTY_DOUBT_STATE);
  const audited = phase.kind === "audited" ? phase.result : phase.kind === "busy" ? phase.previous : null;
  const run = async (what: ImportRun) => {
    const payload: ImportFilePayload[] = files.map(({ name, base64 }) => ({ name, base64 }));
    const choices = choicesFor(what, audited, doubts);
    setError(null);
    setPhase({ kind: "busy", what, previous: audited });
    try {
      if (what === "load") {
        setPhase({ kind: "loaded", result: await postImportLoad(payload, exercise, decisions, choices) });
        onLoaded();
        return;
      }
      if (what === "audit") setDecisions({});
      const result = await postImportAudit(payload, exercise, choices);
      setDoubts(initialDoubtState(result.doubts ?? [], what === "preview" ? doubts : EMPTY_DOUBT_STATE));
      setPhase({ kind: "audited", result });
    } catch (cause) {
      setError(messageOf(cause));
      setPhase(audited === null ? { kind: "idle" } : { kind: "audited", result: audited });
    }
  };
  const reset = () => { setPhase({ kind: "idle" }); setDecisions({}); setDoubts(EMPTY_DOUBT_STATE); };
  return { phase, error, audited, decisions, setDecisions, doubts, setDoubts, run, reset };
}
