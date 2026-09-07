// Shared building blocks of the sidebar filter sections (split from
// Sidebar.tsx to respect the 300-line file cap, ADR 022): the filter pill,
// the category header with its tout/rien quick toggles and the group
// section that binds them to one FilterState group.

import type { ReactNode } from "react";
import type { FilterGroup, FilterState } from "../../core/filters.ts";

/**
 * One filter pill: optional colored dot + label, lit when active. `partial`
 * marks a lit domain whose sub-domains are only partly selected (ADR 022);
 * `sub` renders the smaller sub-domain variant.
 * Inputs: the active/partial/sub flags, the click handler, an optional dot
 * color, the label as children. Output: a button.pill. Failure modes: none.
 */
export function Pill(props: {
  active: boolean;
  onClick: () => void;
  color?: string;
  partial?: boolean;
  sub?: boolean;
  children: ReactNode;
}) {
  const className =
    "pill" + (props.active ? " on" : "") + (props.partial ? " partial" : "") + (props.sub ? " sub" : "");
  return (
    <button className={className} onClick={props.onClick}>
      {props.color && <span className="pill-dot" style={{ background: props.color }} />}
      {props.children}
    </button>
  );
}

// Category header: label + tout/rien quick toggles (matters most for the
// ten domains).
function CatHead(props: { label: string; allOn: boolean; noneOn: boolean; onAll: () => void; onNone: () => void }) {
  return (
    <div className="cat-head">
      <span className="sb-label">{props.label}</span>
      <div className="cat-actions">
        <button className="mini-act" disabled={props.allOn} onClick={props.onAll}>tout</button>
        <span className="cat-sep">·</span>
        <button className="mini-act" disabled={props.noneOn} onClick={props.onNone}>rien</button>
      </div>
    </div>
  );
}

/**
 * One filter section: a CatHead wired to the group's tout/rien actions plus
 * a pill row holding the children. allOn/noneOn read the group's own map
 * only (a domain's sub-domains ride along through the actions themselves).
 * Inputs: the French label, the FilterState group, an optional wrap flag,
 * the filters, the setGroup callback, the pills as children.
 * Output: a div.sb-section. Failure modes: none.
 */
export function GroupSection(props: {
  label: string;
  group: FilterGroup;
  wrap?: boolean;
  filters: FilterState;
  onSetGroup: (group: FilterGroup, value: boolean) => void;
  children: ReactNode;
}) {
  const values = Object.values(props.filters[props.group]);
  return (
    <div className="sb-section">
      <CatHead
        label={props.label}
        allOn={values.every((enabled) => enabled)}
        noneOn={values.every((enabled) => !enabled)}
        onAll={() => props.onSetGroup(props.group, true)}
        onNone={() => props.onSetGroup(props.group, false)}
      />
      <div className={"pill-row" + (props.wrap ? " wrap" : "")}>{props.children}</div>
    </div>
  );
}
