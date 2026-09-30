// The files of an import at a glance (ADR 055): one chip per expected
// source — « ✓ Coût » for a file taken, « ProjetsCdP absent → chefs de
// projet gardés » in the warning tone for a missing one (ADR 054: a
// missing file keeps the board's values) — then, folded, the full line of
// each source, the files nothing expected, and the perimeter: where it was
// read, how many projects it kept, which it left out and why.

import type { ImportChanges } from "../../core/import-types.ts";
import { fileChip, noPerimeterLine } from "../importReport.ts";

function Perimeter({ perimeter, files }: { perimeter: ImportChanges["perimeter"]; files: ImportChanges["files"] }) {
  if (perimeter.source === null) return <div className="chg-line warn">{noPerimeterLine(files)}</div>;
  const excluded = perimeter.excluded;
  return (
    <details className="sd-sec">
      <summary>
        Périmètre <b>{perimeter.source}</b>{perimeter.file !== null && <> ({perimeter.file})</>} : <b>{perimeter.retained}</b> projet(s)
        retenu(s) · <b>{excluded.length}</b> écarté(s)
      </summary>
      {excluded.length === 0 ? <div className="m2-note">Aucun projet écarté.</div> : (
        <ul>
          {excluded.map((entry) => (
            <li key={entry.code} className="sd-item">
              <span className="sd-code">{entry.code}</span><span className="sd-title">{entry.name}</span>
              <span className="sd-move">{entry.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function FileDetails({ changes }: { changes: ImportChanges }) {
  return (
    <details className="sd-sec">
      <summary>Détail des fichiers</summary>
      <ul>
        {changes.files.map((entry) => <li key={entry.source} className="sd-item">{fileChip(entry).detail}</li>)}
        {changes.unrecognized.map((entry) => (
          <li key={entry.file} className="sd-item">Non reconnu : {entry.file} — {entry.detail}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The files strip and its folded details.
 * Input: the report's changes (files, unrecognized, perimeter). Output:
 * the chips, the perimeter line, the folded detail. Failure modes: none.
 */
export function FilesStrip({ changes }: { changes: ImportChanges }) {
  const unknown = changes.unrecognized.length;
  return (
    <div className="chg-block">
      <ul className="chg-chips" aria-label="Fichiers de l’import">
        {changes.files.map((entry) => {
          const chip = fileChip(entry);
          return <li key={entry.source} className={"chg-chip " + chip.tone} title={chip.detail}>{chip.text}</li>;
        })}
        {unknown > 0 && <li className="chg-chip warn">{unknown} fichier(s) non reconnu(s)</li>}
      </ul>
      <Perimeter perimeter={changes.perimeter} files={changes.files} />
      <FileDetails changes={changes} />
    </div>
  );
}
