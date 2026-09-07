// The « Domaine » filter group (ADR 022): one pill per domain of the config;
// a domain declaring sub-domains wears a chevron on its left that unfolds a
// row of sub-domain pills right under the domain row. Toggling a domain
// pill aligns all its sub-domains (core withDomainToggled, reached through
// useFilters.toggle); a lit domain with some sub-domains off is "partial".
// The unfolded set is view state only — never persisted.

import { Fragment, useState } from "react";
import type { BoardConfig, Domain } from "../../core/types.ts";
import { subDomainKey, type FilterGroup, type FilterState } from "../../core/filters.ts";
import { GroupSection, Pill } from "./sidebarParts.tsx";

/** Props of the domain section (a slice of SidebarProps). */
export interface DomainSectionProps {
  config: BoardConfig;
  filters: FilterState;
  onToggle: (group: FilterGroup, key: string) => void;
  onSetGroup: (group: FilterGroup, value: boolean) => void;
}

// True when the domain is lit but at least one of its sub-domains is off.
function isPartial(domain: Domain, filters: FilterState): boolean {
  if (filters.domain[domain.id] === false) return false;
  return (domain.subDomains ?? []).some((sub) => filters.subDomain[subDomainKey(domain.id, sub.id)] === false);
}

// The unfolded row of one domain's sub-domain pills (full-width line).
function SubDomainRow({ domain, filters, onToggle }: {
  domain: Domain;
  filters: FilterState;
  onToggle: DomainSectionProps["onToggle"];
}) {
  return (
    <div className="pill-sub-row">
      {(domain.subDomains ?? []).map((sub) => {
        const key = subDomainKey(domain.id, sub.id);
        return (
          <Pill key={key} sub active={filters.subDomain[key] !== false} onClick={() => onToggle("subDomain", key)}>
            {sub.name}
          </Pill>
        );
      })}
    </div>
  );
}

// One domain pill, preceded by its chevron when the domain is detailed.
function DomainPill({ domain, open, onFlip, filters, onToggle }: {
  domain: Domain;
  open: boolean;
  onFlip: () => void;
  filters: FilterState;
  onToggle: DomainSectionProps["onToggle"];
}) {
  const detailed = (domain.subDomains ?? []).length > 0;
  return (
    <span className="pill-with-chev">
      {detailed && (
        <button
          className={"pill-chev" + (open ? " open" : "")}
          title={open ? "Replier les sous-domaines" : "Déplier les sous-domaines"}
          aria-expanded={open}
          onClick={onFlip}
        >
          {open ? "▾" : "▸"}
        </button>
      )}
      <Pill
        active={filters.domain[domain.id] !== false}
        partial={isPartial(domain, filters)}
        onClick={() => onToggle("domain", domain.id)}
        color={domain.color}
      >
        {domain.short}
      </Pill>
    </span>
  );
}

/**
 * The « Domaine » filter section: domain pills with tout/rien, plus a
 * chevron per detailed domain unfolding its sub-domain pills (ADR 022).
 * Inputs: DomainSectionProps (config, filter state, toggle/setGroup
 * callbacks). Output: the section DOM. Failure modes: none.
 */
export function DomainSection(props: DomainSectionProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const flip = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <GroupSection label="Domaine" group="domain" wrap filters={props.filters} onSetGroup={props.onSetGroup}>
      {props.config.domains.map((domain) => (
        <Fragment key={domain.id}>
          <DomainPill domain={domain} open={open.has(domain.id)} onFlip={() => flip(domain.id)} filters={props.filters} onToggle={props.onToggle} />
          {open.has(domain.id) && <SubDomainRow domain={domain} filters={props.filters} onToggle={props.onToggle} />}
        </Fragment>
      ))}
    </GroupSection>
  );
}
