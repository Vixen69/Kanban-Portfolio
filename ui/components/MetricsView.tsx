// Flow-metrics view (Sprint 6, pulled forward — design reference). No
// chart library, just honest bars. Answers the governance questions:
// where does work pile up, where does it stagnate, what is blocked, and
// how much budget is committed vs consumed.

import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import { computeFlowMetrics, type ColumnFlow, type FlowMetrics } from "../../core/metrics.ts";

// One color per aging step (fresh -> stale), aligned with the card
// darkening but saturated enough to read as a stacked bar.
const AGE_COLORS = ["#86b9c9", "#c2cbd8", "#d9c79a", "#e6b15e", "#d56a6a"];

export interface MetricsViewProps {
  config: BoardConfig;
  cards: CardState[];
  events: CardEvent[];
  now: Date;
  onClose: () => void;
}

function Bar(props: { label: string; value: number; max: number; sub?: string; color?: string; danger?: boolean }) {
  const width = props.max ? Math.round((props.value / props.max) * 100) : 0;
  return (
    <div className="mb-row">
      <span className="mb-label">{props.label}</span>
      <span className="mb-track">
        <span
          className="mb-fill"
          style={{ width: `${width}%`, background: props.danger ? "var(--danger)" : (props.color ?? "var(--accent)") }}
        />
      </span>
      <span className="mb-val">{props.sub ?? props.value}</span>
    </div>
  );
}

function AgeStack({ column, max }: { column: ColumnFlow; max: number }) {
  return (
    <div className="mb-row">
      <span className="mb-label">{column.name}</span>
      <span className="mb-track stack">
        {column.ageBuckets.map((count, step) =>
          count > 0 ? (
            <span
              key={step}
              className="seg"
              style={{ width: `${(count / (max || 1)) * 100}%`, background: AGE_COLORS[step % AGE_COLORS.length] }}
              title={`palier ${step} : ${count}`}
            />
          ) : null,
        )}
      </span>
      <span className="mb-val">{column.count}</span>
    </div>
  );
}

function KpiRow({ metrics, config }: { metrics: FlowMetrics; config: BoardConfig }) {
  const bottleneck = config.columns.find((column) => column.id === metrics.bottleneckColumnId);
  const lastStep = config.agingStepsDays[config.agingStepsDays.length - 1];
  return (
    <div className="metrics-kpis">
      <div className="kpi"><span className="kpi-num">{metrics.totals.total}</span><span className="kpi-lab">Sujets</span></div>
      <div className="kpi"><span className="kpi-num">{metrics.totals.delivered}</span><span className="kpi-lab">Livrés / en prod</span></div>
      <div className="kpi alert"><span className="kpi-num">{metrics.totals.blocked}</span><span className="kpi-lab">Bloqués</span></div>
      <div className="kpi warn"><span className="kpi-num">{metrics.totals.stale}</span><span className="kpi-lab">Stagnants &gt; {lastStep}j</span></div>
      <div className="kpi kpi-accent"><span className="kpi-num">{bottleneck?.name ?? "—"}</span><span className="kpi-lab">Goulot principal</span></div>
    </div>
  );
}

function AgeLegend({ config }: { config: BoardConfig }) {
  const labels = [...config.agingStepsDays.map((days) => `≤${days}j`), `>${config.agingStepsDays.at(-1)}j`];
  return (
    <span className="mp-hint">
      {labels.map((label, step) => (
        <span key={label}>
          <i className="lg-sw" style={{ background: AGE_COLORS[step % AGE_COLORS.length] }} />
          {label}{" "}
        </span>
      ))}
    </span>
  );
}

function LoadPanel({ metrics }: { metrics: FlowMetrics }) {
  const maxBudget = Math.max(1, ...metrics.laneLoads.map((lane) => lane.budget));
  return (
    <div className="metric-panel wide">
      <div className="mp-title">Charge par canal <span className="mp-hint">budget k€ · consommé / estimé</span></div>
      {metrics.laneLoads.map((lane) => {
        const pct = lane.budget ? Math.round((lane.consumed / lane.budget) * 100) : 0;
        return (
          <div className="charge-canal" key={lane.laneId}>
            <span className="cc-label">{lane.name} <i>({lane.count})</i></span>
            <span className="cc-track">
              <span className="cc-est" style={{ width: `${(lane.budget / maxBudget) * 100}%` }}>
                <span
                  className="cc-cons"
                  style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "var(--danger)" : "var(--accent)" }}
                />
              </span>
            </span>
            <span className="cc-val">{lane.consumed} / {lane.budget} k€</span>
          </div>
        );
      })}
    </div>
  );
}

function FlowPanel({ metrics }: { metrics: FlowMetrics }) {
  const maxCount = Math.max(1, ...metrics.perColumn.map((column) => column.count));
  return (
    <div className="metric-panel">
      <div className="mp-title">Flux par étape <span className="mp-hint">nombre de sujets · limite WIP</span></div>
      {metrics.perColumn.map((column) => (
        <Bar
          key={column.columnId}
          label={column.name}
          value={column.count}
          max={maxCount}
          sub={column.wipLimit ? `${column.count}/${column.wipLimit}` : `${column.count}`}
          danger={column.wipLimit !== null && column.count > column.wipLimit}
        />
      ))}
    </div>
  );
}

function StagePanel({ metrics }: { metrics: FlowMetrics }) {
  const maxAvg = Math.max(1, ...Object.values(metrics.avgStageDays));
  return (
    <div className="metric-panel">
      <div className="mp-title">Temps moyen passé par étape <span className="mp-hint">jours · où ça stagne</span></div>
      {metrics.perColumn.map((column) => (
        <Bar
          key={column.columnId}
          label={column.name}
          value={metrics.avgStageDays[column.columnId] ?? 0}
          max={maxAvg}
          sub={`${metrics.avgStageDays[column.columnId] ?? 0}j`}
          color={column.columnId === metrics.bottleneckColumnId ? "var(--warn)" : "var(--accent)"}
        />
      ))}
    </div>
  );
}

function BlockedPanel({ metrics }: { metrics: FlowMetrics }) {
  const maxBlocked = Math.max(1, ...metrics.perColumn.map((column) => column.blocked));
  const blockedColumns = metrics.perColumn.filter((column) => column.blocked > 0);
  return (
    <div className="metric-panel">
      <div className="mp-title">Blocages par étape <span className="mp-hint">{metrics.totals.blocked} au total</span></div>
      {blockedColumns.map((column) => (
        <Bar key={column.columnId} label={column.name} value={column.blocked} max={maxBlocked} danger />
      ))}
      {blockedColumns.length === 0 && <div className="mp-empty">Aucun blocage. Tableau sain.</div>}
    </div>
  );
}

function Panels({ metrics, config }: { metrics: FlowMetrics; config: BoardConfig }) {
  const maxCount = Math.max(1, ...metrics.perColumn.map((column) => column.count));
  return (
    <div className="metrics-grid">
      <FlowPanel metrics={metrics} />
      <StagePanel metrics={metrics} />
      <div className="metric-panel">
        <div className="mp-title">Composition d'âge par étape <AgeLegend config={config} /></div>
        {metrics.perColumn.map((column) => (
          <AgeStack key={column.columnId} column={column} max={maxCount} />
        ))}
      </div>
      <BlockedPanel metrics={metrics} />
      <LoadPanel metrics={metrics} />
    </div>
  );
}

/**
 * Full-screen flow-metrics view (☷ button, Échap to close).
 * Inputs: MetricsViewProps (config, card states, event log, now, close).
 * Output: the metrics overlay, computed exclusively from the event log
 * and the event-derived states. Failure: none.
 */
export function MetricsView(props: MetricsViewProps) {
  const metrics = computeFlowMetrics(props.cards, props.events, props.config, props.now);
  return (
    <div className="metrics-view">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Métriques de flux</h2>
          <span className="metrics-sub">
            Dérivé du journal d'événements · {metrics.totals.total} sujets
          </span>
        </div>
        <button className="btn ghost" onClick={props.onClose}>Fermer ✕</button>
      </div>
      <KpiRow metrics={metrics} config={props.config} />
      <Panels metrics={metrics} config={props.config} />
    </div>
  );
}
