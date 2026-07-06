// Flow-metrics view (design/metrics.jsx). Derived entirely from the live
// cards + the event log — no charts library, just honest bars. Answers the
// governance questions: where does work pile up, where does it stagnate,
// what is blocked, and how much load is committed vs consumed.

import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import { computeFlowMetrics, type ColumnFlow, type FlowMetrics } from "../../core/metrics.ts";

/** Props of the full-screen metrics view. */
export interface MetricsViewProps {
  cards: CardState[];
  events: CardEvent[];
  config: BoardConfig;
  /** Current time, epoch milliseconds (App's useNow ticker). */
  now: number;
  onClose: () => void;
}

// Age composition segments, in bucket order (design colors).
const AGE_SEGMENTS: { key: "fresh" | "recent" | "aging" | "stale"; color: string }[] = [
  { key: "fresh", color: "#86b9c9" },
  { key: "recent", color: "#c2cbd8" },
  { key: "aging", color: "#e6b15e" },
  { key: "stale", color: "#d56a6a" },
];

// A labelled horizontal bar.
function Bar({ label, value, max, sub, color, danger }: { label: string; value: number; max: number; sub?: string | number; color?: string; danger?: boolean }) {
  const width = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-row">
      <span className="mb-label">{label}</span>
      <span className="mb-track"><span className="mb-fill" style={{ width: width + "%", background: danger ? "var(--danger)" : (color ?? "var(--accent)") }} /></span>
      <span className="mb-val">{sub != null ? sub : value}</span>
    </div>
  );
}

// Stacked age composition bar (fresh / recent / aging / stale).
function AgeStack({ col, max }: { col: ColumnFlow; max: number }) {
  return (
    <div className="mb-row">
      <span className="mb-label">{col.name}</span>
      <span className="mb-track stack">
        {AGE_SEGMENTS.map(({ key, color }) =>
          col[key] > 0 ? <span key={key} className="seg" style={{ width: (col[key] / (max || 1)) * 100 + "%", background: color }} title={`${key}: ${col[key]}`} /> : null,
        )}
      </span>
      <span className="mb-val">{col.count}</span>
    </div>
  );
}

// Column flows in board order (skips ids unknown to the config, defensive).
function orderedColumns(m: FlowMetrics): ColumnFlow[] {
  const flows: ColumnFlow[] = [];
  for (const id of m.order) {
    const flow = m.perColumn[id];
    if (flow) flows.push(flow);
  }
  return flows;
}

// The five head-line numbers, bottleneck named from the config.
function Kpis({ m, config }: { m: FlowMetrics; config: BoardConfig }) {
  const bottleneck = config.columns.find((column) => column.id === m.bottleneck);
  return (
    <div className="metrics-kpis">
      <div className="kpi"><span className="kpi-num">{m.totals.total}</span><span className="kpi-lab">Sujets</span></div>
      <div className="kpi"><span className="kpi-num">{m.totals.delivered}</span><span className="kpi-lab">Livrés / en prod</span></div>
      <div className="kpi alert"><span className="kpi-num">{m.totals.blocked}</span><span className="kpi-lab">Bloqués</span></div>
      <div className="kpi warn"><span className="kpi-num">{m.totals.stale}</span><span className="kpi-lab">Stagnants &gt; {config.age.agingMaxDays}j</span></div>
      <div className="kpi accent"><span className="kpi-num">{bottleneck ? bottleneck.name : "—"}</span><span className="kpi-lab">Goulot principal</span></div>
    </div>
  );
}

// Cards per column against the WIP limit.
function FlowPanel({ m }: { m: FlowMetrics }) {
  const cols = orderedColumns(m);
  const maxCount = Math.max(1, ...cols.map((c) => c.count));
  return (
    <div className="metric-panel">
      <div className="mp-title">Flux par étape <span className="mp-hint">nombre de sujets · limite WIP</span></div>
      {cols.map((c) => {
        const over = c.wip !== null && c.count > c.wip;
        return <Bar key={c.id} label={c.name} value={c.count} max={maxCount} sub={c.wip ? `${c.count}/${c.wip}` : c.count} danger={over} />;
      })}
    </div>
  );
}

// Average completed-stay duration per column; the bottleneck turns warn.
function StagePanel({ m }: { m: FlowMetrics }) {
  const cols = orderedColumns(m);
  const maxAvg = Math.max(1, ...cols.map((c) => m.avgStageDays[c.id] ?? 0));
  return (
    <div className="metric-panel">
      <div className="mp-title">Temps moyen passé par étape <span className="mp-hint">jours · où ça stagne</span></div>
      {cols.map((c) => {
        const avg = m.avgStageDays[c.id] ?? 0;
        return <Bar key={c.id} label={c.name} value={avg} max={maxAvg} sub={avg + "j"} color={c.id === m.bottleneck ? "var(--warn)" : "var(--accent)"} danger={false} />;
      })}
    </div>
  );
}

// Age buckets stacked per column.
function AgePanel({ m }: { m: FlowMetrics }) {
  const cols = orderedColumns(m);
  const maxCount = Math.max(1, ...cols.map((c) => c.count));
  return (
    <div className="metric-panel">
      <div className="mp-title">Composition d’âge par étape <span className="mp-hint"><i className="lg-sw" style={{ background: "#86b9c9" }} />frais <i className="lg-sw" style={{ background: "#c2cbd8" }} />récent <i className="lg-sw" style={{ background: "#e6b15e" }} />vieillit <i className="lg-sw" style={{ background: "#d56a6a" }} />stagnant</span></div>
      {cols.map((c) => <AgeStack key={c.id} col={c} max={maxCount} />)}
    </div>
  );
}

// Blocked counts, only for the columns that have any.
function BlockedPanel({ m }: { m: FlowMetrics }) {
  const cols = orderedColumns(m).filter((c) => c.blocked > 0);
  const maxBlocked = Math.max(1, ...cols.map((c) => c.blocked));
  return (
    <div className="metric-panel">
      <div className="mp-title">Blocages par étape <span className="mp-hint">{m.totals.blocked} au total</span></div>
      {cols.map((c) => <Bar key={c.id} label={c.name} value={c.blocked} max={maxBlocked} danger />)}
      {m.totals.blocked === 0 && <div className="mp-empty">Aucun blocage. Tableau sain.</div>}
    </div>
  );
}

// Committed vs consumed effort (j.h) per lane.
function ChargePanel({ m, config }: { m: FlowMetrics; config: BoardConfig }) {
  const maxCharge = Math.max(1, ...Object.values(m.laneLoads).map((load) => load.est));
  return (
    <div className="metric-panel wide">
      <div className="mp-title">Charge par canal <span className="mp-hint">jours-homme · consommé / estimé</span></div>
      {config.lanes.map((lane) => {
        const load = m.laneLoads[lane.id];
        if (!load) return null;
        const pct = load.est ? Math.round((load.cons / load.est) * 100) : 0;
        return (
          <div className="charge-canal" key={lane.id}>
            <span className="cc-label">{load.name} <i>({load.count})</i></span>
            <span className="cc-track">
              <span className="cc-est" style={{ width: (load.est / maxCharge) * 100 + "%" }}>
                <span className="cc-cons" style={{ width: Math.min(100, pct) + "%", background: pct > 100 ? "var(--danger)" : "var(--accent)" }} />
              </span>
            </span>
            <span className="cc-val">{load.cons} / {load.est} j.h</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Full-screen flow-metrics view (☷ button). Every number comes from core
 * computeFlowMetrics — cards + event log only, no separate metrics store.
 * Inputs: MetricsViewProps (folded card states, raw event log, runtime
 * config, now in epoch ms, close callback). Output: the metrics view DOM.
 * Failure modes: none — an empty portfolio renders zeroed panels.
 */
export function MetricsView({ cards, events, config, now, onClose }: MetricsViewProps) {
  const m = computeFlowMetrics(cards, events, config, new Date(now));
  return (
    <div className="metrics-view">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Métriques de flux</h2>
          <span className="metrics-sub">Dérivé du portefeuille en temps réel · {m.totals.total} sujets</span>
        </div>
        <button className="btn ghost" onClick={onClose}>Fermer ✕</button>
      </div>
      <Kpis m={m} config={config} />
      <div className="metrics-grid">
        <FlowPanel m={m} />
        <StagePanel m={m} />
        <AgePanel m={m} />
        <BlockedPanel m={m} />
        <ChargePanel m={m} config={config} />
      </div>
    </div>
  );
}
