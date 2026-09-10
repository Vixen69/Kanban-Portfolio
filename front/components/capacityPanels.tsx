// Panels of the capacity view (ADR 024/025/028): load bars per domain and
// per profile, the overloaded persons, the coverage caveats. Pure
// presentation: every number arrives computed by core/capacity-view.ts;
// this file formats it (fr-FR) and draws honest bars — the light fill is
// the whole-plan engagement against the capacity, the full fill the
// board's own share, both capped at 100 % and turned red beyond it.

import type { ReactNode } from "react";
import type { GroupLoad, PersonLoad } from "../../core/capacity.ts";
import { loadLevel } from "../../core/capacity.ts";
import type { Coverage, DomainLoadRow, Overload, ProfileLoadRow } from "../../core/capacity-view.ts";
import { fmtUnit } from "../format.ts";

/** How many overloaded persons the panel lists before summarising the rest. */
const TOP_OVERLOADS = 15;

/** Percentage of a ratio ("88 %"), "—" when the capacity is unknown. */
export function pct(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)} %`;
}

function shareOf(part: number, whole: number): string {
  return whole > 0 ? pct(part / whole) : "—";
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

// A load bar: the whole-plan engagement (light) with the board's share
// (full) inside it, red past 100 %; without a known plan the board ratio
// alone is drawn and said.
function LoadBar({ color, label, group, meta }: { color: string; label: ReactNode; group: GroupLoad; meta?: string }) {
  const planned = group.engagement !== null;
  const level = group.engagement ?? group.ratio;
  const over = level !== null && level > 1;
  const fill = over ? "var(--danger)" : color;
  return (
    <div className="mb-row">
      <span className="mb-label"><i className="lg-sw" style={{ background: color }} />{label}</span>
      <span className="mb-track">
        <span className="mb-fill soft" style={{ width: `${level === null ? 0 : Math.min(level, 1) * 100}%`, background: fill, opacity: 0.35 }} />
        <span className="mb-fill cap-fill-board" style={{ width: `${group.ratio === null ? 0 : Math.min(group.ratio, 1) * 100}%`, background: fill }} />
      </span>
      <span className={"mb-val cap-val" + (over ? " cap-over" : "")}>
        <b>{pct(level)}</b> · {fmtUnit(planned ? group.plannedJh : group.demandJh)} / {fmtUnit(group.capacityJh)} j.h
        {planned ? ` · tableau ${shareOf(group.demandJh, group.plannedJh)}` : " · hors plan de charge"}
        {meta !== undefined && <small>{meta}</small>}
      </span>
    </div>
  );
}

function metaOf(group: GroupLoad): string {
  const parts = [`${group.persons} pers.`];
  if (group.external.persons > 0) parts.push(`dont ${group.external.persons} ext.`);
  if (group.withoutCapacity > 0) parts.push(`${group.withoutCapacity} capacité inconnue`);
  if (group.withoutPlan > 0) parts.push(`${group.withoutPlan} hors plan de charge`);
  if (group.freeJh > 0) parts.push(`${fmtUnit(group.freeJh)} j.h libres`);
  if (group.overJh > 0) parts.push(`${fmtUnit(group.overJh)} j.h de surcharge`);
  return parts.join(" · ");
}

/**
 * Charge par domaine des personnes: one bar per domain of the config (plus
 * the persons outside them), transverse domains marked.
 * Inputs: the domain rows. Output: the panel. Failure: none.
 */
export function DomainsPanel({ rows }: { rows: DomainLoadRow[] }) {
  return (
    <Panel title="Charge par domaine" hint="clair = projeté sur tout le plan de charge · plein = part du tableau · transverses ◆">
      {rows.map((row) => (
        <LoadBar key={row.domainId ?? "none"} color={row.color} group={row} meta={metaOf(row)}
          label={<>{row.transverse && <span title="domaine transverse">◆ </span>}{row.name}</>} />
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
    <Panel title="Charge par profil" hint="quelle compétence est saturée sur toute la DSI · clair = projeté · plein = tableau">
      {shown.length === 0 && <div className="mp-empty">Aucun profil porteur de charge.</div>}
      {shown.map((row) => (
        <LoadBar key={row.profileId ?? "none"} color={row.color} label={row.name} group={row} meta={metaOf(row)} />
      ))}
    </Panel>
  );
}

function OverloadFigure({ load }: { load: PersonLoad }) {
  const { plannedJh, capacityJh } = load.person;
  return (
    <span className="cap-fig">
      <b className="cap-over">{pct(loadLevel(load))}</b> · {fmtUnit(plannedJh ?? load.jh)} / {fmtUnit(capacityJh ?? 0)} j.h
      {plannedJh !== null ? ` · tableau ${shareOf(load.jh, plannedJh)}` : " · hors plan de charge"}
    </span>
  );
}

/**
 * Personnes au-delà de 100 %: name, domain · profile, whole-plan load over
 * capacity, the board's share — most loaded first.
 * Inputs: the overloads. Output: the panel. Failure: none.
 */
export function OverloadsPanel({ rows }: { rows: Overload[] }) {
  const rest = rows.length - TOP_OVERLOADS;
  return (
    <Panel title="Personnes au-delà de 100 %" hint="projeté sur tout le plan de charge / capacité déclarée · les plus chargées d’abord">
      {rows.length === 0 && <div className="mp-empty">Personne au-delà de sa capacité.</div>}
      {rows.slice(0, TOP_OVERLOADS).map(({ load, domainName, profileName }) => (
        <div className="cap-item" key={load.person.id}>
          <span className="cap-name">{load.person.name}{load.person.external && <small> (ext.)</small>}</span>
          <span className="cap-meta">{domainName} · {profileName} · {load.cards.length} carte{load.cards.length > 1 ? "s" : ""} du tableau</span>
          <OverloadFigure load={load} />
        </div>
      ))}
      {rest > 0 && <div className="m2-note">… et {rest} autre{rest > 1 ? "s" : ""} personne{rest > 1 ? "s" : ""} au-delà de 100 %.</div>}
    </Panel>
  );
}

function coverageLines(c: Coverage): string[] {
  const lines = [`${c.assignedCards} carte(s) avec au moins une affectation nominative · ${c.cardsWithoutAssignment} sans.`];
  if (c.genericJh > 0) lines.push(`${fmtUnit(c.genericJh)} j.h de charge des cartes sans personne nommée (lignes génériques du plan de charge) — hors de cette vue.`);
  if (c.unknownCapacity > 0) lines.push(`${c.unknownCapacity} personne(s) sans ligne « Disponible ressource » — leur charge compte, pas leur capacité.`);
  if (c.withoutPlan > 0) lines.push(`${c.withoutPlan} personne(s) absentes du plan de charge — projeté inconnu, seule leur part du tableau est lue.`);
  if (c.outsideJh > 0) lines.push(`${fmtUnit(c.outsideJh)} j.h affectés à des cartes hors tableau (archivées, supprimées ou hors périmètre).`);
  return lines;
}

/**
 * Couverture: how far to trust the figures — uncovered cards, generic
 * charge, stubs, unknown capacities and plans, assignments outside the board.
 * Inputs: the coverage counters. Output: the panel. Failure: none.
 */
export function CoveragePanel({ coverage }: { coverage: Coverage }) {
  return (
    <Panel title="Couverture des chiffres" hint="ce que la vue ne voit pas">
      <div className="cap-lines">
        {coverageLines(coverage).map((line) => <span key={line}>{line}</span>)}
      </div>
      <div className="m2-note">
        Lecture annuelle : projeté de l’exercice (tout le plan de charge, pas seulement le tableau) contre
        la capacité de chacun (ligne « Disponible ressource » du plan de charge, 200 j.h ≈ 1 ETP). L’avancement compare le
        réalisé au projeté : un constat, pas une prévision.
      </div>
    </Panel>
  );
}
