// The expanded card's « RAF par métier » block (ADR 044): the métiers with
// the largest reste à faire, stacked — while the lens narrows the board
// (ADR 048) the métiers it counts come first and emphasised, the others
// greyed; and the tag that writes the sort's figure on the card, so the
// ranking reads at a glance. A card without a per-métier plan says
// « sans ventilation » — bad data shown, never hidden.

import type { BoardConfig, CardState } from "../../core/types.ts";
import { isSortActive, sortValue, topProfiles, type CardSort, type SortKey } from "../../core/card-sort.ts";
import { fmtNum } from "../format.ts";
import { profileById } from "../lookup.ts";

/**
 * The stacked métier lines of an expanded card.
 * Inputs: the card, the config (métier names and colours), the lens's
 * counted métiers (null when the lens is off).
 * Output: the block DOM. Failure modes: none — an unknown profile id
 * shows its id in a neutral colour.
 */
export function ProfileBlock({ card, config, scope }: { card: CardState; config: BoardConfig; scope: ReadonlySet<string> | null }) {
  const { hasPlan, lines, total } = topProfiles(card, scope);
  const profiles = profileById(config);
  const more = total > lines.length ? ` · ${lines.length} sur ${total}` : "";
  return (
    <div className="focus-met">
      <div className="met-cap">RAF par métier{more}</div>
      {!hasPlan && <div className="met-none">sans ventilation</div>}
      {hasPlan && lines.length === 0 && <div className="met-none">reste à faire nul</div>}
      {lines.map((line) => (
        <div key={line.profileId} className={"met-line" + (line.chosen ? " chosen" : "") + (line.out ? " out" : "")}>
          <span className="met-dot" style={{ background: profiles[line.profileId]?.color ?? "#94a3b8" }} />
          <span className="met-name">{profiles[line.profileId]?.name ?? line.profileId}</span>
          <span className="met-raf">{fmtNum(line.raf)} j</span>
        </div>
      ))}
    </div>
  );
}

const UNIT: Record<SortKey, string> = { board: "", remaining: "j.h", estimate: "k€" };

/**
 * The sort's figure of the card, written on it while a sort is active.
 * Inputs: the card, the sort, the métiers the lens counts (the « reste à
 * faire » key, ADR 048). Output: the tag, or null when no sort is active
 * or the card has no figure for it. Failure modes: none.
 */
export function SortTag({ card, sort, counted }: { card: CardState; sort: CardSort; counted: ReadonlySet<string> }) {
  if (!isSortActive(sort)) return null;
  const value = sortValue(card, sort, counted);
  if (value <= 0) return null;
  return <span className="sort-tag" title="La valeur du tri en cours">{fmtNum(value)} {UNIT[sort.key]}</span>;
}
