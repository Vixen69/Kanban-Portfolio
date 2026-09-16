// The « Flux » tab of the analytics (author, 2026-09-16): débit and délais
// (core/metrics-flow), the time per stage (core/stage-dwell — « le temps
// moyen passé d'une carte dans les étapes »), encours vs limites, and the
// blockages. Every figure comes from the cards and the event log; this
// file lays it out. The panels fold (Panel of capacityPanels.tsx): the
// stage table opens first, the rest one after another.

import { useMemo } from "react";
import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import { blockages, flowSummary, wipRows } from "../../core/metrics-flow.ts";
import type { Blockage, FlowSummary, WipRow } from "../../core/metrics-flow.ts";
import { stageDwell } from "../../core/stage-dwell.ts";
import type { StageDwell } from "../../core/stage-dwell.ts";
import { terminalColumnIds } from "../../core/flow.ts";
import { Panel } from "./capacityPanels.tsx";

const DAY_MS = 86_400_000;
const TOP_BLOCKAGES = 8;

type Tone = "alert" | "ok" | "accent" | null;

function Kpi({ num, unit, label, tone }: { num: string | number; unit?: string | undefined; label: string; tone?: Tone }) {
  return (
    <div className={"mkpi" + (tone == null ? "" : " " + tone)}>
      <span className="mkpi-num">{num}{unit !== undefined && <i>{unit}</i>}</span>
      <span className="mkpi-lab">{label}</span>
    </div>
  );
}

function days(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("fr-FR")} j`;
}

function Kpis({ flow, inFlow, blocked }: { flow: FlowSummary; inFlow: number; blocked: number }) {
  return (
    <div className="m2-kpis">
      <Kpi num={inFlow} label="Sujets en cours · hors étapes terminales" />
      <Kpi num={blocked} label="Bloqués" tone={blocked > 0 ? "alert" : "ok"} />
      <Kpi num={flow.throughput30} label="Livrés · 30 derniers jours" tone="ok" />
      <Kpi num={flow.throughput90} label="Livrés · 90 derniers jours" />
      <Kpi num={flow.leadTimeAvg ?? "—"} unit={flow.leadTimeAvg === null ? undefined : "j"} label="Lead time moyen · entrée → livraison" tone="accent" />
      <Kpi num={flow.cycleTimeAvg ?? "—"} unit={flow.cycleTimeAvg === null ? undefined : "j"} label="Cycle time moyen · actifs → livraison" tone="accent" />
    </div>
  );
}

// The stage with the longest completed stays is the bottleneck candidate.
function StagePanel({ rows }: { rows: StageDwell[] }) {
  const slowest = rows.reduce<StageDwell | null>((best, row) =>
    row.pastAvgDays !== null && (best === null || (best.pastAvgDays ?? 0) < row.pastAvgDays) ? row : best, null);
  return (
    <Panel title="Temps par étape" hint={slowest === null ? "aucun séjour terminé" : `séjours les plus longs : ${slowest.name}`} wide open>
      <table className="an-table">
        <thead>
          <tr><th>Étape</th><th>En cours</th><th>Âge moyen actuel</th><th>Séjours terminés</th><th>Durée moyenne</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row === slowest ? "slowest" : undefined}>
              <td>{row.name}</td>
              <td>{row.current}</td>
              <td>{days(row.currentAvgDays)}</td>
              <td>{row.pastStays}</td>
              <td>{days(row.pastAvgDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="m2-note">Séjour = de l’arrivée dans l’étape à l’arrivée dans une autre ; les réordonnancements et les changements de canal ne comptent pas.</div>
    </Panel>
  );
}

function width(value: number, max: number): string {
  return `${Math.min(100, (value / max) * 100)}%`;
}

function WipPanel({ rows }: { rows: WipRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.count, row.limit)));
  return (
    <Panel title="Encours vs limites" hint="par colonne · trait = limite cumulée">
      {rows.map((row) => (
        <div className="mb-row" key={row.id}>
          <span className="mb-label">{row.name}</span>
          <span className="mb-track">
            <span className="mb-fill" style={{ width: width(row.count, max), background: row.over ? "var(--danger)" : "var(--accent)" }} />
            {row.limit > 0 && <span className="m2-wip-lim" style={{ left: width(row.limit, max) }} />}
          </span>
          <span className="mb-val" style={{ color: row.over ? "var(--danger-strong)" : "var(--tx-2)" }}>
            {row.count}{row.limit > 0 ? `/${row.limit}` : ""}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function BlockagesPanel({ rows }: { rows: Blockage[] }) {
  const rest = rows.length - TOP_BLOCKAGES;
  return (
    <Panel title="Blocages" hint={`${rows.length} sujet(s) bloqué(s)`}>
      {rows.length === 0 ? <div className="mp-empty">Aucun blocage. Tableau sain.</div> : (
        <div className="blk-list">
          {rows.slice(0, TOP_BLOCKAGES).map((row) => (
            <div className="blk-item" key={row.id}>
              <span className="blk-pulse" />
              <span className="blk-name">{row.title}</span>
              <span className="blk-reason">{row.reason === null || row.reason === "" ? "motif non précisé" : row.reason}</span>
              <span className="blk-meta">{row.columnName} · {row.days} j</span>
            </div>
          ))}
          {rest > 0 && <div className="m2-note">+ {rest} autre(s) sujet(s) bloqué(s).</div>}
        </div>
      )}
    </Panel>
  );
}

/**
 * The « Flux » tab. Inputs: the active cards of the exercise shown, the
 * event log, the config, now (epoch ms). Output: the KPIs and the panels.
 * Failure modes: none — an empty board reads zeros and « — ».
 */
export function FlowTab({ cards, events, config, now }: { cards: CardState[]; events: CardEvent[]; config: BoardConfig; now: number }) {
  const day = Math.floor(now / DAY_MS);
  const model = useMemo(() => {
    const at = new Date(day * DAY_MS);
    const terminal = terminalColumnIds(config);
    return {
      flow: flowSummary(cards, events, config, at),
      inFlow: cards.filter((card) => !terminal.has(card.columnId)).length,
      blocked: cards.filter((card) => card.blocked).length,
      stages: stageDwell(cards, events, config, at),
      wip: wipRows(cards, config),
      blockages: blockages(cards, config, at),
    };
  }, [cards, events, config, day]);
  return (
    <>
      <Kpis flow={model.flow} inFlow={model.inFlow} blocked={model.blocked} />
      <div className="m2-grid">
        <StagePanel rows={model.stages} />
        <WipPanel rows={model.wip} />
        <BlockagesPanel rows={model.blockages} />
      </div>
    </>
  );
}
