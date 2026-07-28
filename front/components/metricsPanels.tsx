// Panels of the Metrics view (design v12, « Metrics »): one small component
// per governance read-out — budget croisé, contention, charge par rôle, flux,
// encours vs limites, risques, blocages. Pure presentation: every number
// arrives already computed by core/metrics.ts, this file only formats it
// (fr-FR) and draws honest bars — no charts library.

import type { ReactNode } from "react";
import type { RoleLoad } from "../../core/metrics.ts";
import type { Blockage, FlowSummary, LabelledCount, WipRow } from "../../core/metrics-flow.ts";
import type { GroupTotals } from "../../core/totals.ts";

/** How many blockages the panel lists before summarising the rest. */
const TOP_BLOCKAGES = 8;

/**
 * Rounded, French-formatted integer (k€, j.h, counts).
 * Inputs: a number. Output: the fr-FR string ("1 250"). Failure: none —
 * NaN would format as "NaN", which the core never produces.
 */
export function fmt(value: number): string {
  return Math.round(value).toLocaleString("fr-FR");
}

// Bar width as a CSS percentage; a zero max yields "0%" rather than NaN.
function width(value: number, max: number): string {
  return (max > 0 ? (value / max) * 100 : 0) + "%";
}

// Panel frame: white card, title, optional hint, `wide` spans the grid.
function Panel({ title, hint, wide, children }: { title: string; hint: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={"m2-panel" + (wide === true ? " wide" : "")}>
      <div className="m2-title">{title}<span className="m2-hint">{hint}</span></div>
      {children}
    </div>
  );
}

// A labelled bar preceded by a colour swatch (contention, risques).
function SwatchBar({ color, label, barWidth, value }: { color: string; label: string; barWidth: string; value: string }) {
  return (
    <div className="mb-row">
      <span className="mb-label"><i className="lg-sw" style={{ background: color }} />{label}</span>
      <span className="mb-track"><span className="mb-fill" style={{ width: barWidth, background: color }} /></span>
      <span className="mb-val">{value}</span>
    </div>
  );
}

// The four money lines of the budget graph, in design order. The RDLI row is
// drawn soft: it is the envelope the other three are read against.
function budgetRows(budget: GroupTotals) {
  return [
    { key: "rdli", label: "Enveloppe RDLI", value: budget.rdli, color: "#94a3b8", soft: true },
    { key: "est", label: "Meilleur estimé", value: budget.estimated, color: "var(--accent)", soft: false },
    { key: "eng", label: "Engagé", value: budget.engaged, color: "#b45309", soft: false },
    {
      key: "real",
      label: "Réalisé",
      value: budget.consumed,
      color: budget.consumed > budget.rdli ? "var(--danger)" : "var(--ok)",
      soft: false,
    },
  ];
}

// One-line verdict under the budget graph: réalisé beats engagé beats calm.
function BudgetFlag({ budget }: { budget: GroupTotals }) {
  if (budget.consumed > budget.rdli) {
    return <div className="m2-flag danger">Réalisé au-delà de l’enveloppe RDLI (+{fmt(budget.consumed - budget.rdli)} k€)</div>;
  }
  if (budget.engaged > budget.rdli) {
    return <div className="m2-flag warn">Engagé au-delà de l’enveloppe RDLI (+{fmt(budget.engaged - budget.rdli)} k€)</div>;
  }
  return <div className="m2-flag ok">Engagements dans l’enveloppe.</div>;
}

/**
 * Budget croisé du portefeuille (k€): four bars on a shared scale plus the
 * RDLI reference tick.
 * Inputs: the aggregated GroupTotals. Output: the budget panel.
 * Failure: none — a portfolio without money reads four empty bars.
 */
export function BudgetPanel({ budget }: { budget: GroupTotals }) {
  const max = Math.max(budget.rdli, budget.estimated, budget.engaged, budget.consumed, 1) * 1.02;
  const over = budget.consumed > budget.rdli;
  return (
    <Panel title="Budget croisé — portefeuille" hint="k€ · trait = enveloppe RDLI">
      <div className="bgraph">
        {budgetRows(budget).map((row) => (
          <div className="bg-row" key={row.key}>
            <span className="bg-label">{row.label}</span>
            <div className="bg-track">
              <span className="bg-fill" style={{ width: width(row.value, max), background: row.color, opacity: row.soft ? 0.5 : 1 }} />
              <span className="bg-ref" style={{ left: width(budget.rdli, max) }} />
            </div>
            <span className="bg-val" style={{ color: row.key === "real" && over ? "var(--danger-strong)" : "var(--tx-2)" }}>{fmt(row.value)}</span>
          </div>
        ))}
      </div>
      <BudgetFlag budget={budget} />
    </Panel>
  );
}

/**
 * Profils DSI signalés « en tension », du plus signalé au moins.
 * Inputs: the contention subset of the roles. Output: the contention panel.
 * Failure: none — an empty list renders the « aucun profil » line.
 */
export function ContentionPanel({ rows }: { rows: RoleLoad[] }) {
  const max = Math.max(1, ...rows.map((row) => row.contention));
  return (
    <Panel title="Risque de contention" hint="profils signalés en tension">
      {rows.length === 0 ? <div className="mp-empty">Aucun profil signalé en tension.</div> : rows.map((row) => (
        <SwatchBar key={row.id} color={row.color} label={row.name} barWidth={width(row.contention, max)}
          value={`${row.contention} sujet${row.contention > 1 ? "s" : ""}`} />
      ))}
    </Panel>
  );
}

// Two-layer bar: the soft layer is the whole plan de charge, the solid one
// the part already consumed — the gap between them IS the reste à faire.
function RoleRow({ role, max }: { role: RoleLoad; max: number }) {
  return (
    <div className="mb-row">
      <span className="mb-label">
        {role.contention > 0 && <span className="cont-flag" title={`${role.contention} sujet(s) en tension`} />}
        <i className="lg-sw" style={{ background: role.color }} />{role.name}
      </span>
      <span className="mb-track">
        <span className="mb-fill soft" style={{ width: width(role.jh, max), background: `color-mix(in oklab, ${role.color} 22%, #fff)` }} />
        <span className="mb-fill over" style={{ width: width(role.done, max), background: role.color }} />
      </span>
      <span className="mb-val"><b>{fmt(role.remaining)}</b> / {fmt(role.jh)}</span>
    </div>
  );
}

/**
 * Charge restante par rôle (j.h), profils en tension d’abord.
 * Inputs: every profile carrying charge or flagged. Output: the wide role
 * panel. Failure: none — an unallocated portfolio renders the empty line.
 */
export function RolesPanel({ rows }: { rows: RoleLoad[] }) {
  const max = Math.max(1, ...rows.map((row) => row.jh));
  return (
    <Panel title="Charge restante par rôle" hint="j.h RAF · ● = en tension" wide>
      {rows.length === 0 ? <div className="mp-empty">Aucune charge répartie.</div>
        : rows.map((row) => <RoleRow key={row.id} role={row} max={max} />)}
      <div className="m2-legend">
        <span><i className="lg-sw" style={{ background: "#64748b" }} />consommé</span>
        <span><i className="lg-sw" style={{ background: "#cbd5e1" }} />charge totale</span>
      </div>
    </Panel>
  );
}

// One boxed figure of the flux row.
function Stat({ num, unit, label }: { num: ReactNode; unit?: string; label: string }) {
  return (
    <div className="m2-stat">
      <span className="m2-stat-num">{num}{unit !== undefined && <i>{unit}</i>}</span>
      <span className="m2-stat-lab">{label}</span>
    </div>
  );
}

/**
 * Flux: débit à 30 et 90 jours, lead time et cycle time moyens.
 * Inputs: the FlowSummary and the total delivered count (the note's context).
 * Output: the flux panel. Failure: none — null averages read « — ».
 */
export function FlowPanel({ flow, finishedCount }: { flow: FlowSummary; finishedCount: number }) {
  return (
    <Panel title="Flux" hint="débit & délais moyens">
      <div className="m2-flowrow">
        <Stat num={flow.throughput30} label="livrés 30 j" />
        <Stat num={flow.throughput90} label="livrés 90 j" />
        <Stat num={flow.leadTimeAvg ?? "—"} unit="j" label="lead time moy." />
        <Stat num={flow.cycleTimeAvg ?? "—"} unit="j" label="cycle time moy." />
      </div>
      <div className="m2-note">Lead = Demandes → livraison · Cycle = Actifs → livraison · {finishedCount} sujets livrés au total.</div>
    </Panel>
  );
}

/**
 * Encours par colonne face à la limite cumulée (le trait).
 * Inputs: one WipRow per configured column, in board order. Output: the WIP
 * panel. Failure: none — a column without limite reads « n/0 », never over.
 */
export function WipPanel({ rows }: { rows: WipRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.count, row.limit)));
  return (
    <Panel title="Encours vs limites" hint="par colonne">
      {rows.map((row) => (
        <div className="mb-row" key={row.id}>
          <span className="mb-label">{row.name}</span>
          <span className="mb-track">
            <span className="mb-fill" style={{ width: width(row.count, max), background: row.over ? "var(--danger)" : "var(--accent)" }} />
            <span className="m2-wip-lim" style={{ left: width(row.limit, max) }} />
          </span>
          <span className="mb-val" style={{ color: row.over ? "var(--danger-strong)" : "var(--tx-2)" }}>{row.count}/{row.limit}</span>
        </div>
      ))}
      <div className="m2-legend"><span>trait = limite d’encours cumulée</span></div>
    </Panel>
  );
}

// Constraint chip tinted from the typology colour (the house color-mix
// formula), so a renamed or added constraint still reads as itself.
function ConstraintChip({ row }: { row: LabelledCount }) {
  const style = {
    color: `color-mix(in oklab, ${row.color} 78%, #0f172a)`,
    borderColor: `color-mix(in oklab, ${row.color} 40%, transparent)`,
    background: `color-mix(in oklab, ${row.color} 8%, #fff)`,
  };
  return <span className="cn-chip" style={style}>{row.name} · {row.count}</span>;
}

/**
 * Risques par entité porteuse, plus la répartition des contraintes projet.
 * Inputs: the risk counts (carriers only) and the constraint counts (fixed
 * chips, « Aucune » included). Output: the risk panel. Failure: none.
 */
export function RisksPanel({ risks, constraints }: { risks: LabelledCount[]; constraints: LabelledCount[] }) {
  const max = Math.max(1, ...risks.map((row) => row.count));
  return (
    <Panel title="Risques par entité" hint="sujets porteurs d’un risque">
      {risks.length === 0 ? <div className="mp-empty">Aucun risque retenu.</div> : risks.map((row) => (
        <SwatchBar key={row.id} color={row.color} label={row.name} barWidth={width(row.count, max)} value={String(row.count)} />
      ))}
      <div className="m2-constraints">
        {constraints.map((row) => <ConstraintChip key={row.id} row={row} />)}
      </div>
    </Panel>
  );
}

// One blocked subject: the pulsing dot, its name, the motif, where and since.
function BlockageRow({ row }: { row: Blockage }) {
  const reason = row.reason === null || row.reason === "" ? "motif non précisé" : row.reason;
  return (
    <div className="blk-item">
      <span className="blk-pulse" />
      <span className="blk-name">{row.title}</span>
      <span className="blk-reason">{reason}</span>
      <span className="blk-meta">{row.columnName} · {row.days} j</span>
    </div>
  );
}

/**
 * Blocages: the eight oldest, then a count of the rest.
 * Inputs: every blocked card, oldest first. Output: the wide blockage panel.
 * Failure: none — an unblocked portfolio renders « Tableau sain ».
 */
export function BlockagesPanel({ rows }: { rows: Blockage[] }) {
  const rest = rows.length - TOP_BLOCKAGES;
  return (
    <Panel title="Blocages" hint={`${rows.length} sujet(s) bloqué(s)`} wide>
      {rows.length === 0 ? <div className="mp-empty">Aucun blocage. Tableau sain.</div> : (
        <div className="blk-list">
          {rows.slice(0, TOP_BLOCKAGES).map((row) => <BlockageRow key={row.id} row={row} />)}
          {rest > 0 && <div className="m2-note">+ {rest} autre(s) sujet(s) bloqué(s).</div>}
        </div>
      )}
    </Panel>
  );
}
