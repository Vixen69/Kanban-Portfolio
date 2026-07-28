// Metrics view (design v12, ☷ button): the governance read-out a portfolio
// committee acts on — l'argent, la capacité, le flux, la santé. Every number
// comes from core/metrics.ts (cards + event log, no separate metrics store);
// this file only wires the props, memoises the computation and lays out the
// panels of ./metricsPanels.tsx.

import { useMemo } from "react";
import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import { computePortfolioMetrics, type PortfolioMetrics } from "../../core/metrics.ts";
import {
  BlockagesPanel,
  BudgetPanel,
  ContentionPanel,
  FlowPanel,
  fmt,
  RisksPanel,
  RolesPanel,
  WipPanel,
} from "./metricsPanels.tsx";

const DAY_MS = 86_400_000;

/** Props of the full-screen metrics view. */
export interface MetricsViewProps {
  cards: CardState[];
  events: CardEvent[];
  config: BoardConfig;
  /** Current time, epoch milliseconds (App's useNow ticker). */
  now: number;
  onClose: () => void;
}

/** Accent of a KPI tile; null leaves it neutral. */
type Tone = "alert" | "warn" | "accent" | "ok" | null;

// One KPI tile: a big number, an optional unit, an uppercase French label.
function Kpi({ num, unit, label, tone }: { num: string | number; unit?: string; label: string; tone?: Tone }) {
  return (
    <div className={"mkpi" + (tone == null ? "" : " " + tone)}>
      <span className="mkpi-num">{num}{unit !== undefined && <i>{unit}</i>}</span>
      <span className="mkpi-lab">{label}</span>
    </div>
  );
}

// Capacity read against the RDLI envelope: past it is an alert, close to it
// a warning. A portfolio without an envelope reads 0 % and stays neutral.
function envelopeTone(percent: number): Tone {
  if (percent > 100) return "alert";
  if (percent > 90) return "warn";
  return null;
}

// The six head-line figures, in design order.
function Kpis({ metrics }: { metrics: PortfolioMetrics }) {
  return (
    <div className="m2-kpis">
      <Kpi num={metrics.inFlowCount} label="Sujets en cours" />
      <Kpi num={metrics.blockedCount} label="Bloqués" tone={metrics.blockedCount > 0 ? "alert" : null} />
      <Kpi num={metrics.engagedPct} unit="%" label="Capacité engagée / RDLI" tone={envelopeTone(metrics.engagedPct)} />
      <Kpi num={fmt(metrics.remainingTotal)} unit="j.h" label="Reste à faire (charge)" tone="accent" />
      <Kpi num={metrics.consumedPct} unit="%" label="Réalisé / RDLI" tone={metrics.consumedPct > 100 ? "alert" : null} />
      <Kpi num={metrics.flow.throughput30} label="Livrés (30 j)" tone="ok" />
    </div>
  );
}

// The seven panels, in design order (roles and blockages span the grid).
function Panels({ metrics }: { metrics: PortfolioMetrics }) {
  return (
    <div className="m2-grid">
      <BudgetPanel budget={metrics.budget} />
      <ContentionPanel rows={metrics.contention} />
      <RolesPanel rows={metrics.roles} />
      <FlowPanel flow={metrics.flow} finishedCount={metrics.finishedCount} />
      <WipPanel rows={metrics.wip} />
      <RisksPanel risks={metrics.risks} constraints={metrics.constraints} />
      <BlockagesPanel rows={metrics.blockages} />
    </div>
  );
}

// The whole read-out, recomputed only when the data or the DAY changes.
// `now` ticks every second (App's useNow(1000)) and this view aggregates 150
// cards plus the full event log: depending on the raw millisecond would redo
// that work 60 times a minute for nothing. Every figure here is day-grained
// (âges, débit 30/90 j), so the coarsened `day` is the honest dependency —
// the exact `now` still reaches core inside the callback.
function useMetrics(props: MetricsViewProps): PortfolioMetrics {
  const { cards, events, config, now } = props;
  const day = Math.floor(now / DAY_MS);
  return useMemo(
    () => computePortfolioMetrics(cards, events, config, new Date(now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` is `now` coarsened on purpose (see above)
    [cards, events, config, day],
  );
}

/**
 * Full-screen Metrics view (design v12).
 * Inputs: MetricsViewProps — the folded card states (archived ones are
 * filtered out by core), the raw event log, the runtime config, now in epoch
 * milliseconds, and the close callback.
 * Output: the metrics overlay DOM.
 * Failure modes: none — an empty portfolio renders zeroed KPIs and the
 * panels' French empty lines.
 */
export function MetricsView(props: MetricsViewProps) {
  const metrics = useMetrics(props);
  return (
    <div className="metrics-view m2">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Metrics</h2>
          <span className="metrics-sub">
            Portefeuille en temps réel · {metrics.activeCount} sujets actifs · {metrics.inFlowCount} en cours
          </span>
        </div>
        <button className="btn ghost" onClick={props.onClose}>Fermer ✕</button>
      </div>
      <Kpis metrics={metrics} />
      <Panels metrics={metrics} />
    </div>
  );
}
