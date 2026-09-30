// The readable import report (ADR 055, author 2026-09-30: « les valeurs
// qui sont actualisées, je dois pouvoir les voir rapidement à un endroit
// et savoir vraiment ce qu'il a pris »), top to bottom: the key numbers
// (« Ce que le chargement va changer », then « … a changé »), the files
// taken, the refreshed values fact by fact (the change sections shared
// with « Comparer avec maintenant »), the projects that enter, leave or
// come back with their reason, and the facts kept because the files left
// them blank (ADR 054). Next to the values, the hand corrections the
// export's NEW value replaces (ADR 060); after the presence lists, what
// the hand did that the load met (placements overtaken, adoptions,
// deleted cards ignored, identity doubts — ADR 058/059/060), and the
// doubts settled otherwise than by the tool (ADR 062). A refused
// load says its refusal (ADR 056). The audit and the load return the same
// object: this view reads it the same way. Nothing here computes or writes.

import type { BoardConfig } from "../../core/types.ts";
import type { ImportAuditResult, ImportChanges as Changes } from "../../core/import-types.ts";
import { keyNumbers, minorCounts, reportTitle, unloadableLine, warnLines } from "../importReport.ts";
import { ChangeSections } from "./ChangeSections.tsx";
import { FilesStrip } from "./FilesStrip.tsx";
import { HandLists, KeptLists, PresenceLists, ReplacedLists, SettledLists } from "./ImportLists.tsx";

// The received / recognised files and the technical report's warnings, in one line.
function Received({ result }: { result: ImportAuditResult }) {
  const s = result.summary;
  return (
    <div className="chg-line">
      Exercice <b>{result.exercise}</b> · {s.received} fichier(s) reçu(s), {s.recognized} reconnu(s)
      {s.warnings > 0 && <> · {s.warnings} signalement(s) dans le rapport technique</>}
    </div>
  );
}

function KeyStrip({ changes, loaded }: { changes: Changes; loaded: boolean }) {
  const minor = minorCounts(changes);
  return (
    <>
      <h3 className="chg-h">{reportTitle(loaded)}</h3>
      <ul className="chg-keys">
        {keyNumbers(changes.counts).map((entry) => (
          <li key={entry.label} title={entry.hint}><b>{entry.value}</b><span>{entry.label}</span></li>
        ))}
      </ul>
      {warnLines(changes, loaded).map((line) => <div key={line} className="chg-line warn">{line}</div>)}
      {minor.length > 0 && <div className="chg-line">Aussi : {minor.join(" · ")}</div>}
    </>
  );
}

/**
 * The readable report of one audit or load.
 * Inputs: the result (audit or load — both carry `changes`), whether the
 * load ran (the title's tense), the config (column, canal, domain, type
 * and métier names). Output: the report's blocks; when nothing can be
 * loaded, the reason (the refusals of ADR 056, else the missing
 * perimeter) and the files instead of the numbers. Failure modes: none.
 */
export function ImportChanges({ result, loaded, config }: { result: ImportAuditResult; loaded: boolean; config: BoardConfig }) {
  const { changes } = result;
  if (!result.loadable) {
    return (
      <section className="chg" aria-label="Rapport d’import">
        <Received result={result} />
        <div className="chg-line warn">{unloadableLine(changes)}</div>
        <FilesStrip changes={changes} />
      </section>
    );
  }
  return (
    <section className="chg" aria-label="Rapport d’import">
      <KeyStrip changes={changes} loaded={loaded} />
      <Received result={result} />
      <FilesStrip changes={changes} />
      <h3 className="chg-h">Valeurs actualisées</h3>
      <ChangeSections config={config} changes={changes.cardChanges} scope="values"
        empty={loaded ? "Aucune valeur n’a changé." : "Aucune valeur ne changera."} />
      <ReplacedLists replaced={changes.replaced} loaded={loaded} />
      <PresenceLists changes={changes} />
      <SettledLists settled={changes.settled ?? []} loaded={loaded} />
      <HandLists changes={changes} config={config} />
      <KeptLists kept={changes.kept} loaded={loaded} />
    </section>
  );
}
