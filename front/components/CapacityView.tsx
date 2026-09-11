// Capacity view (☷, ADR 024/025/028): the arbitration read-out between
// domain owners — where the exercise year's planned load lands against the
// people's declared capacity, what the board weighs in it, with the
// transverse domains (A&D, INFRA) singled out. Every figure comes from
// core/capacity-view.ts; this file fetches the snapshot when the view
// opens, memoises the computation and lays out the panels of
// ./capacityPanels.tsx and ./capacityTables.tsx.

import { useEffect, useMemo, useState } from "react";
import type { BoardConfig, CapacitySnapshot, CardState } from "../../core/types.ts";
import { computeCapacityReadout, type CapacityKpis, type CapacityReadout } from "../../core/capacity-view.ts";
import { fetchCapacity } from "../api.ts";
import { fmtUnit } from "../format.ts";
import { CoveragePanel, DomainsPanel, OverloadsPanel, ProfilesPanel, pct } from "./capacityPanels.tsx";
import { MetiersPanel } from "./capacityMetiers.tsx";
import { TransversePanel, WeighingPanel } from "./capacityTables.tsx";

const DAY_MS = 86_400_000;

/** Props of the full-screen capacity view. */
export interface CapacityViewProps {
  /** The active (non-archived) cards shown on the board. */
  cards: CardState[];
  config: BoardConfig;
  /** Current time, epoch milliseconds (App's ticker) — the elapsed share of the year. */
  now: number;
  onClose: () => void;
}

type Fetch =
  | { status: "loading" }
  | { status: "ready"; snapshot: CapacitySnapshot | null }
  | { status: "error"; message: string };

// The snapshot is fetched when the view opens: it only changes at import
// time, so it stays out of the per-action board refetch.
function useCapacitySnapshot(): Fetch {
  const [state, setState] = useState<Fetch>({ status: "loading" });
  useEffect(() => {
    let active = true;
    fetchCapacity()
      .then((snapshot) => { if (active) setState({ status: "ready", snapshot }); })
      .catch((cause: unknown) => {
        if (!active) return;
        setState({ status: "error", message: cause instanceof Error ? cause.message : "Erreur inconnue." });
      });
    return () => { active = false; };
  }, []);
  return state;
}

/** Accent of a KPI tile; null leaves it neutral. */
type Tone = "alert" | "warn" | "accent" | "ok" | null;

function Kpi({ num, unit, label, tone }: { num: string | number; unit?: string; label: string; tone?: Tone }) {
  return (
    <div className={"mkpi" + (tone == null ? "" : " " + tone)}>
      <span className="mkpi-num">{num}{unit !== undefined && <i>{unit}</i>}</span>
      <span className="mkpi-lab">{label}</span>
    </div>
  );
}

// Engagement: past the capacity is an alert, close to it a warning.
function ratioTone(ratio: number | null): Tone {
  if (ratio === null) return null;
  if (ratio > 1) return "alert";
  if (ratio > 0.9) return "warn";
  return "ok";
}

// Progress is a statement, not a forecast: clearly behind the elapsed
// year is worth a look, nothing more.
function progressTone(kpis: CapacityKpis): Tone {
  if (kpis.progress === null) return null;
  return kpis.progress < kpis.yearElapsed - 0.2 ? "warn" : null;
}

function Kpis({ readout }: { readout: CapacityReadout }) {
  const { kpis } = readout;
  const planKnown = kpis.engagement !== null;
  return (
    <div className="m2-kpis">
      <Kpi num={fmtUnit(kpis.capacityJh)} unit="j.h" label="Capacité · lignes « Disponible ressource »" />
      <Kpi num={fmtUnit(planKnown ? kpis.plannedJh : kpis.demandJh)} unit="j.h"
        label={planKnown ? "Projeté · tout le plan de charge" : "Demande du tableau"} tone="accent" />
      <Kpi num={pct(kpis.engagement ?? kpis.ratio)}
        label={planKnown ? "Engagement · projeté / capacité" : "Charge du tableau / capacité"}
        tone={ratioTone(kpis.engagement ?? kpis.ratio)} />
      <Kpi num={pct(kpis.progress)} label={`Avancement · réalisé / projeté · ${pct(kpis.yearElapsed)} de l’année écoulée`}
        tone={progressTone(kpis)} />
      <Kpi num={pct(kpis.perimeterShare)} label="Part du tableau dans le projeté" />
      <Kpi num={kpis.overloaded} label={`Personnes en tension · ≥ ${pct(readout.tension)}`} tone={kpis.overloaded > 0 ? "alert" : "ok"} />
      <Kpi num={fmtUnit(kpis.freeJh)} unit="j.h" label="Reste disponible · capacité non planifiée" tone="ok" />
      <Kpi num={fmtUnit(kpis.overJh)} unit="j.h" label="Surcharge cumulée · planifié au-delà des capacités"
        tone={kpis.overJh > 0 ? "alert" : "ok"} />
      <Kpi num={fmtUnit(kpis.genericJh)} unit="j.h" label="À pourvoir · charge sans personne nommée"
        tone={kpis.genericJh > 0 ? "warn" : null} />
      <Kpi num={fmtUnit(kpis.coutsJh)} unit="j.h" label="Demande COUT PREV · lignes « Charge » des cartes" />
    </div>
  );
}

function Panels({ readout }: { readout: CapacityReadout }) {
  return (
    <div className="m2-grid">
      <TransversePanel rows={readout.transverse} />
      <DomainsPanel rows={readout.domains} />
      <ProfilesPanel rows={readout.profiles} />
      <MetiersPanel rows={readout.metiers} tension={readout.tension} />
      <WeighingPanel rows={readout.weighing} />
      <OverloadsPanel rows={readout.overloads} tension={readout.tension} byMetier={readout.tensionByMetier} />
      <CoveragePanel coverage={readout.coverage} />
    </div>
  );
}

function Empty() {
  return (
    <div className="m2-panel wide">
      <div className="m2-title">Aucune capacité importée</div>
      <div className="m2-note">
        Cette vue s’alimente à l’import : déposer le plan de charge (Ressources_PdC) avec PARAM et le
        classeur, puis charger. Les personnes nommées, leur capacité, leur projeté et leurs affectations
        de l’exercice apparaissent alors ici.
      </div>
    </div>
  );
}

// The read-out, recomputed when the data or the DAY changes (the ticker
// beats every second; the elapsed share of the year is day-grained).
function Body({ fetch, cards, config, now }: { fetch: Fetch; cards: CardState[]; config: BoardConfig; now: number }) {
  const snapshot = fetch.status === "ready" ? fetch.snapshot : null;
  const day = Math.floor(now / DAY_MS);
  const readout = useMemo(
    () => (snapshot === null ? null : computeCapacityReadout(snapshot, cards, config, new Date(day * DAY_MS))),
    [snapshot, cards, config, day],
  );
  if (fetch.status === "loading") return <div className="m2-note">Chargement de la capacité…</div>;
  if (fetch.status === "error") return <div className="m2-flag danger">Capacité indisponible : {fetch.message}</div>;
  if (readout === null) return <Empty />;
  return (
    <>
      <Kpis readout={readout} />
      <Panels readout={readout} />
    </>
  );
}

function subtitle(fetch: Fetch): string {
  if (fetch.status !== "ready" || fetch.snapshot === null) return "Lecture annuelle : projeté de l’exercice contre capacité déclarée";
  const { exerciseYear, persons, assignments } = fetch.snapshot;
  return `Exercice ${exerciseYear} · ${persons.length} personnes · ${assignments.length} affectations sur le tableau · projeté annuel contre capacité déclarée`;
}

/**
 * Full-screen capacity view (☷).
 * Inputs: CapacityViewProps — the active cards, the runtime config, now,
 * the close callback. Output: the overlay DOM.
 * Failure modes: none — a missing snapshot shows how to import one, an
 * unreachable API shows the French message.
 */
export function CapacityView(props: CapacityViewProps) {
  const fetch = useCapacitySnapshot();
  return (
    <div className="metrics-view m2">
      <div className="metrics-head">
        <div>
          <h2 className="metrics-title">Capacité</h2>
          <span className="metrics-sub">{subtitle(fetch)}</span>
        </div>
        <button className="btn ghost" onClick={props.onClose}>Fermer ✕</button>
      </div>
      <Body fetch={fetch} cards={props.cards} config={props.config} now={props.now} />
    </div>
  );
}
