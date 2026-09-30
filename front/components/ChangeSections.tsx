// The grouped changes (ADR 053/055) — ONE component for the two screens
// that read the change engine: the import report (« Valeurs actualisées »,
// the board now against the board after the load) and « Comparer avec
// maintenant » (a snapshot against the board now). One folding section per
// fact with its count; only the first one opens, and only when short
// (../changeGroups.ts). A read: nothing is written.

import type { BoardConfig } from "../../core/types.ts";
import type { CardChange } from "../../core/snapshot-diff.ts";
import { changeKey, groupChanges, sectionOpen, type ChangeScope } from "../changeGroups.ts";
import { ChangeRow } from "./ChangeRows.tsx";

/**
 * The changes, one <details> per fact.
 * Inputs: the config (names), the changes, the scope (« values » leaves
 * the arrivals, absences and returns to the import's own lists; « all »
 * shows every kind, with each card's exercise). Output: the sections, or
 * the empty line given (none when omitted). Failure modes: none.
 */
export function ChangeSections({ config, changes, scope, empty }: {
  config: BoardConfig; changes: readonly CardChange[]; scope: ChangeScope; empty?: string;
}) {
  const sections = groupChanges(changes, scope);
  if (sections.length === 0) return empty === undefined ? null : <div className="m2-note">{empty}</div>;
  return (
    <>
      {sections.map((section, index) => (
        <details key={section.key} className="sd-sec" open={sectionOpen(index, section.items.length)}>
          <summary><b>{section.label}</b> · {section.items.length}</summary>
          <ul>
            {section.items.map((change) => (
              <ChangeRow key={changeKey(change)} change={change} config={config} showYear={scope === "all"} />
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}
