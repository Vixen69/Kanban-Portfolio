// « Types de ressource » panel (ADR 033): the plan de charge's métiers as
// the PDSI macro reads them — persons, declared capacity, planned load, the
// board's share, the generic demand « à pourvoir » nobody carries, and the
// pressure (planned + generic) / capacity. Pure presentation over
// core/capacity-metiers.ts.

import type { MetierLoad } from "../../core/capacity-view.ts";
import { fmtUnit } from "../format.ts";
import { Panel, pct } from "./capacityPanels.tsx";

// Red beyond 100 %, amber from the tension threshold, plain otherwise.
function pressureClass(pressure: number | null, tension: number): string {
  if (pressure === null) return "";
  if (pressure > 1) return "cap-over";
  return pressure >= tension ? "cap-tense" : "";
}

function MetierRow({ row, tension }: { row: MetierLoad; tension: number }) {
  return (
    <tr>
      <td>{row.metier || "Sans métier"}{row.external.persons > 0 && <small>{row.external.persons} ext.</small>}</td>
      <td>{row.persons}{row.withoutCapacity > 0 && <small>{row.withoutCapacity} sans capacité</small>}</td>
      <td>{fmtUnit(row.capacityJh)}</td>
      <td>{fmtUnit(row.plannedJh)}</td>
      <td>{fmtUnit(row.demandJh)}</td>
      <td>{fmtUnit(row.genericJh)}</td>
      <td>{fmtUnit(row.genericBoardJh)}</td>
      <td className={pressureClass(row.pressure, tension)}><b>{pct(row.pressure)}</b></td>
      <td>{fmtUnit(row.freeJh)} / {fmtUnit(row.overJh)}</td>
    </tr>
  );
}

/**
 * Types de ressource: one row per métier of the plan de charge, highest
 * pressure first — the macro's « appel de charges », generic rows included.
 * Inputs: the métier loads, the tension threshold. Output: the panel.
 * Failure: none.
 */
export function MetiersPanel({ rows, tension }: { rows: MetierLoad[]; tension: number }) {
  const shown = rows.filter((row) => row.persons > 0 || row.genericJh > 0);
  return (
    <Panel wide title="Types de ressource · métiers du plan de charge"
      hint="capacité = lignes « Disponible » des personnes · projeté = tout le plan de charge · à pourvoir = lignes sans personne nommée · pression = (projeté + à pourvoir) / capacité">
      {shown.length === 0 && <div className="mp-empty">Aucun métier dans le plan de charge.</div>}
      {shown.length > 0 && (
        <div className="cap-scroll">
          <table className="cap-table">
            <thead>
              <tr>
                <th>Métier</th><th>Pers.</th><th>Capacité j.h</th><th>Projeté j.h</th><th>dont tableau</th>
                <th>À pourvoir j.h</th><th>dont tableau</th><th>Pression</th><th>Libre / surcharge</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => <MetierRow key={row.metier || "none"} row={row} tension={tension} />)}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
