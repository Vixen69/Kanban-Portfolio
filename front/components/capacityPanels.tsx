// Panels of the capacity view (ADR 024/025): load bars per domain and per
// profile, the overloaded persons, the coverage caveats. Pure presentation:
// every number arrives computed by core/capacity-view.ts; this file formats
// it (fr-FR) and draws honest bars — the fill is the demand against the
// capacity, capped at 100 % and turned red beyond it.

import type { ReactNode } from "react";
import type { GroupLoad } from "../../core/capacity.ts";
import type { Coverage, DomainLoadRow, Overload, ProfileLoadRow } from "../../core/capacity-view.ts";
import { fmtUnit } from "../format.ts";

/** How many overloaded persons the panel lists before summarising the rest. */
const TOP_OVERLOADS = 15;

/** Percentage of a ratio ("88 %"), "—" when the capacity is unknown. */
export function pct(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)} %`;
}

/** Panel frame shared by the capacity panels; `wide` spans the grid. */
export function Panel({ title, hint, wide, children }: { title: string; hint: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={"m2-panel" + (wide === true ? " wide" : "")}>
      <div className="m2-title">{title}<span className="m2-hint">{hint}</span></div>
      {children}
    </div>
  );
}

// A load bar: demand over capacity, red past 100 %; unknown capacity draws
// an empty track with the demand alone.
function LoadBar({ color, label, group, meta }: { color: string; label: ReactNode; group: GroupLoad; meta?: string }) {
  const over = group.ratio !== null && group.ratio > 1;
  const fill = group.ratio === null ? 0 : Math.min(group.ratio, 1) * 100;
  return (
    <div className="mb-row">
      <span className="mb-label"><i className="lg-sw" style={{ background: color }} />{label}</span>
      <span className="mb-track">
        <span className="mb-fill" style={{ width: `${fill}%`, background: over ? "var(--danger)" : color }} />
      </span>
      <span className={"mb-val cap-val" + (over ? " cap-over" : "")}>
        <b>{pct(group.ratio)}</b> · {fmtUnit(group.demandJh)} / {fmtUnit(group.capacityJh)} j.h{meta !== undefined && <small> · {meta}</small>}
      </span>
    </div>
  );
}

/**
 * Charge par domaine des personnes: one bar per domain of the config (plus
 * the persons outside them), transverse domains marked.
 * Inputs: the domain rows. Output: the panel. Failure: none.
 */
export function DomainsPanel({ rows }: { rows: DomainLoadRow[] }) {
  return (
    <Panel title="Charge par domaine" hint="personnes du domaine · demande / capacité · transverses marqués ◆">
      {rows.map((row) => (
        <LoadBar key={row.domainId ?? "none"} color={row.color} group={row}
          label={<>{row.transverse && <span title="domaine transverse">◆ </span>}{row.name}</>}
          meta={`${row.persons} pers.${row.external > 0 ? ` dont ${row.external} ext.` : ""}${row.withoutCapacity > 0 ? ` · ${row.withoutCapacity} capacité inconnue` : ""}`} />
      ))}
    </Panel>
  );
}

/**
 * Charge par profil DSI: one bar per profile (plus the persons without).
 * Inputs: the profile rows. Output: the panel. Failure: none.
 */
export function ProfilesPanel({ rows }: { rows: ProfileLoadRow[] }) {
  const shown = rows.filter((row) => row.persons > 0 || row.demandJh > 0);
  return (
    <Panel title="Charge par profil" hint="quelle compétence est le goulot · demande / capacité">
      {shown.length === 0 && <div className="mp-empty">Aucun profil porteur de charge.</div>}
      {shown.map((row) => (
        <LoadBar key={row.profileId ?? "none"} color={row.color} label={row.name} group={row}
          meta={`${row.persons} pers.${row.withoutCapacity > 0 ? ` · ${row.withoutCapacity} capacité inconnue` : ""}`} />
      ))}
    </Panel>
  );
}

/**
 * Personnes au-delà de 100 %: name, domain · profile, demand over capacity,
 * number of cards — most loaded first.
 * Inputs: the overloads. Output: the panel. Failure: none.
 */
export function OverloadsPanel({ rows }: { rows: Overload[] }) {
  const rest = rows.length - TOP_OVERLOADS;
  return (
    <Panel title="Personnes au-delà de 100 %" hint="prévisionnel de l’exercice / capacité déclarée · les plus chargées d’abord">
      {rows.length === 0 && <div className="mp-empty">Personne au-delà de sa capacité.</div>}
      {rows.slice(0, TOP_OVERLOADS).map(({ load, domainName, profileName }) => (
        <div className="cap-item" key={load.person.id}>
          <span className="cap-name">{load.person.name}{load.person.external && <small> (ext.)</small>}</span>
          <span className="cap-meta">{domainName} · {profileName} · {load.cards.length} carte{load.cards.length > 1 ? "s" : ""}</span>
          <span className="cap-fig"><b className="cap-over">{pct(load.ratio)}</b> · {fmtUnit(load.jh)} / {fmtUnit(load.person.capacityJh ?? 0)} j.h</span>
        </div>
      ))}
      {rest > 0 && <div className="m2-note">… et {rest} autre{rest > 1 ? "s" : ""} personne{rest > 1 ? "s" : ""} au-delà de 100 %.</div>}
    </Panel>
  );
}

function coverageLines(c: Coverage): string[] {
  const lines = [`${c.assignedCards} carte(s) avec au moins une affectation nominative · ${c.cardsWithoutAssignment} sans.`];
  if (c.genericJh > 0) lines.push(`${fmtUnit(c.genericJh)} j.h de charge des cartes sans personne nommée (lignes génériques du plan de charge) — hors de cette vue.`);
  if (c.stubs > 0) lines.push(`${c.stubs} personne(s) du plan de charge sans fiche Ress.Profils — domaine et capacité inconnus.`);
  if (c.unknownCapacity > 0) lines.push(`${c.unknownCapacity} personne(s) à capacité inconnue — leur demande compte, pas leur capacité.`);
  if (c.outsideJh > 0) lines.push(`${fmtUnit(c.outsideJh)} j.h affectés à des cartes hors tableau (archivées, supprimées ou hors périmètre).`);
  return lines;
}

/**
 * Couverture: how far to trust the figures — uncovered cards, generic
 * charge, stubs, unknown capacities, assignments outside the board.
 * Inputs: the coverage counters. Output: the panel. Failure: none.
 */
export function CoveragePanel({ coverage }: { coverage: Coverage }) {
  return (
    <Panel title="Couverture des chiffres" hint="ce que la vue ne voit pas">
      <div className="cap-lines">
        {coverageLines(coverage).map((line) => <span key={line}>{line}</span>)}
      </div>
      <div className="m2-note">
        Lecture annuelle : prévisionnel de l’exercice (plan de charge) contre la capacité déclarée
        (« Disponibilité » de Ress.Profils, 200 j.h = 1 ETP). Le réalisé est indicatif.
      </div>
    </Panel>
  );
}
