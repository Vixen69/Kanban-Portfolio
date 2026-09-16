// Analytics (☷, author 2026-09-16): one full-screen view, a tab bar on
// top — « Capacité » (the arbitration read-out, ADR 024/025) and « Flux »
// (débit, délais, temps par étape, encours, blocages — the v11/v12 flow
// diagnostics back, computed from the event log). Both tabs read the
// exercise the header points at.

import { useState } from "react";
import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import { CapacityTab } from "./CapacityView.tsx";
import { FlowTab } from "./FlowView.tsx";

type Tab = "capacite" | "flux";

/** Props of the analytics view. */
export interface AnalyticsViewProps {
  /** The active (non-archived) cards of the exercise shown. */
  cards: CardState[];
  /** The whole event log (the flow tab reads its cards' events). */
  events: CardEvent[];
  config: BoardConfig;
  /** Current time, epoch milliseconds (App's ticker). */
  now: number;
  /** The exercise shown. */
  year: number;
  onClose: () => void;
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const tabs: Array<[Tab, string]> = [["capacite", "Capacité"], ["flux", "Flux"]];
  return (
    <div className="an-tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={tab === id} className={"an-tab" + (tab === id ? " on" : "")} onClick={() => onTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Full-screen analytics view with its two tabs.
 * Inputs: AnalyticsViewProps. Output: the overlay DOM. Failure modes:
 * none — each tab handles its own empty state.
 */
export function AnalyticsView(props: AnalyticsViewProps) {
  const [tab, setTab] = useState<Tab>("capacite");
  return (
    <div className="metrics-view m2">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Analytics</h2>
          <span className="metrics-sub">Exercice {props.year} · {props.cards.length} carte(s) actives</span>
        </div>
        <TabBar tab={tab} onTab={setTab} />
        <button className="btn ghost" onClick={props.onClose}>Fermer ✕</button>
      </div>
      {tab === "capacite"
        ? <CapacityTab cards={props.cards} config={props.config} now={props.now} year={props.year} />
        : <FlowTab cards={props.cards} events={props.events} config={props.config} now={props.now} />}
    </div>
  );
}
