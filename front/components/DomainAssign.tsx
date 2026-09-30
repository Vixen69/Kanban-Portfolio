// The domain in the fiche (ADR 061, author 2026-09-30: « s'il n'y a pas de
// domaine, il faut que ce soit manuellement assignable, et tu me le
// signales »): the domain tags of the tag row — « Sans domaine » in grey
// when the card has none — and, while the domain is to assign or to verify,
// a static banner that says why and assigns one by hand. The choice writes
// the ordinary `edited` event (domain + sub-domain); the fold then drops
// the « à vérifier » flag. Nothing moves (ADR 051).

import { useEffect, useState } from "react";
import type { BoardConfig, CardPatch, CardState } from "../../core/types.ts";
import { reconcileCardRefs, subDomainsOf } from "../../core/config.ts";
import { domainIssue, domainName, NO_DOMAIN_NAME } from "../../core/domain-check.ts";
import { domainAssignPatch, domainIssueHint, domainIssueText, domainOptions } from "../domainMark.ts";
import { SubDomainField } from "./CardEdit.tsx";
import { SelectField, Tag } from "./modalParts.tsx";

const NEUTRAL = "#94a3b8";

/**
 * The domain tag (and its sub-domain's when detailed, ADR 022) of the
 * fiche's tag row; « Sans domaine » in grey for a card without domain.
 * Inputs: the card, the config. Output: the tags. Failure modes: none — a
 * domain the config no longer declares reads as none (reconcileCardRefs).
 */
export function DomainTags({ card, config }: { card: CardState; config: BoardConfig }) {
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain);
  if (domain === undefined) return <Tag color={NEUTRAL}>{NO_DOMAIN_NAME}</Tag>;
  const sub = subDomainsOf(config, refs.domain).find((entry) => entry.id === refs.subDomain) ?? null;
  return (
    <>
      <Tag color={domain.color}>{domain.name}</Tag>
      {sub && <Tag color={domain.color}>{sub.name}</Tag>}
    </>
  );
}

/**
 * The fiche's domain banner: nothing while the domain is sound; for a
 * domain to assign or to verify, the « ? », the reason and the selects
 * (domain, then sub-domain when detailed) with « Attribuer » — prefilled
 * with the domain worn when it is to verify, so one click confirms it.
 * Inputs: the card, the config, onPatch (the edited intent). Output: the
 * banner or null. Failure modes: none — no choice, no write (the middle
 * refuses an empty domain: one assigns, never un-assigns).
 */
export function DomainBanner({ card, config, onPatch }: { card: CardState; config: BoardConfig; onPatch: (patch: CardPatch) => void }) {
  const refs = reconcileCardRefs(card, config);
  const issue = domainIssue({ ...card, domain: refs.domain });
  const [domain, setDomain] = useState(refs.domain);
  const [subDomain, setSubDomain] = useState(refs.subDomain ?? "");
  useEffect(() => { setDomain(refs.domain); setSubDomain(refs.subDomain ?? ""); }, [card.id, refs.domain, refs.subDomain]);
  if (issue === null) return null;
  const patch = domainAssignPatch(config, domain, subDomain);
  return (
    <div className="domain-banner" role="note">
      <div className="domain-banner-head">
        <span className={"dom-issue " + issue} aria-hidden="true">?</span>
        <b>{domainIssueText(issue)}</b>
      </div>
      <p className="domain-banner-hint">{domainIssueHint(issue, domainName(config, refs.domain))}</p>
      <div className="field-2col">
        <SelectField label="Domaine" value={domain} options={domainOptions(config, domain)} onChange={(v) => { setDomain(v); setSubDomain(""); }} />
        <SubDomainField config={config} domain={domain} value={subDomain} onChange={setSubDomain} />
      </div>
      <div className="modal-actions">
        <span style={{ flex: 1 }} />
        <button className="btn primary sm" disabled={patch === null} title={patch === null ? "Choisissez un domaine" : undefined}
          onClick={() => { if (patch !== null) onPatch(patch); }}>
          {issue === "unresolved" && domain === refs.domain ? "Confirmer ce domaine" : "Attribuer"}
        </button>
      </div>
    </div>
  );
}
