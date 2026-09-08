// The two arbitration tables of the capacity view (ADR 024/025/028): the
// transverse matrix (each transverse domain's capacity, whole-plan
// engagement, what the board takes of it and what lies outside, the
// internal / external split, and which domains consume its board demand)
// and the cards weighing most on each transverse domain — the levers an
// arbitration can pull (pause, requalify, stop). Pure presentation.

import type { LoadSplit } from "../../core/capacity.ts";
import type { Consumer, TransverseRow, WeighingRow } from "../../core/capacity-view.ts";
import { fmtUnit } from "../format.ts";
import { Panel, pct } from "./capacityPanels.tsx";

interface Column {
  key: string;
  name: string;
  color: string;
  total: number;
}

/** Fixed columns before the consumer domains. */
const FIXED = 5;

// The consumer columns: every consumer domain seen, heaviest total first.
function columnsOf(rows: TransverseRow[]): Column[] {
  const columns = new Map<string, Column>();
  for (const row of rows) {
    for (const consumer of row.consumers) {
      const key = consumer.domainId ?? "?";
      const column = columns.get(key) ?? { key, name: consumer.name, color: consumer.color, total: 0 };
      column.total += consumer.jh;
      columns.set(key, column);
    }
  }
  return [...columns.values()].sort((a, b) => b.total - a.total);
}

function cellOf(row: TransverseRow, column: Column): Consumer | undefined {
  return row.consumers.find((consumer) => (consumer.domainId ?? "?") === column.key);
}

function splitText(label: string, split: LoadSplit): string {
  if (split.persons === 0) return `${label} : aucun`;
  return `${label} (${split.persons}) : capacité ${fmtUnit(split.capacityJh)} · projeté ${fmtUnit(split.plannedJh)} j.h · ${pct(split.engagement)}`;
}

function MatrixRow({ row, columns }: { row: TransverseRow; columns: Column[] }) {
  const planned = row.engagement !== null;
  const over = (row.engagement ?? row.ratio ?? 0) > 1;
  return (
    <>
      <tr>
        <th><i className="lg-sw" style={{ background: row.color }} />{row.name}</th>
        <td>{fmtUnit(row.capacityJh)}</td>
        <td className={over ? "cap-over" : ""}>{planned ? fmtUnit(row.plannedJh) : "—"}<small>{planned ? pct(row.engagement) : "hors plan de charge"}</small></td>
        <td>{fmtUnit(row.demandJh)}<small>{pct(row.ratio)} de la capacité</small></td>
        <td>{planned ? fmtUnit(row.outsideJh) : "—"}<small>{planned ? "run, autres portefeuilles" : ""}</small></td>
        {columns.map((column) => {
          const cell = cellOf(row, column);
          return cell === undefined
            ? <td key={column.key} className="cap-empty-cell">·</td>
            : <td key={column.key}>{fmtUnit(cell.jh)}<small>{pct(cell.share)}</small></td>;
        })}
      </tr>
      <tr className="cap-split">
        <td colSpan={FIXED + columns.length}>{splitText("internes", row.internal)} — {splitText("externes", row.external)}</td>
      </tr>
    </>
  );
}

/**
 * Demande sur les domaines transverses: one row per transverse domain —
 * capacity, whole-plan engagement, the board's share and what lies
 * outside, then one column per consumer domain of the board demand; a
 * second line splits internal and external people.
 * Inputs: the transverse rows. Output: the (wide) panel. Failure: none — no
 * transverse domain in the config says so.
 */
export function TransversePanel({ rows }: { rows: TransverseRow[] }) {
  const columns = columnsOf(rows);
  return (
    <Panel title="Les domaines transverses : engagement réel et part du tableau" wide
      hint="projeté = tout le plan de charge · dont tableau = les cartes du tableau, réparties par domaine demandeur (j.h et part de la capacité)">
      {rows.length === 0 && <div className="mp-empty">Aucun domaine transverse dans la configuration.</div>}
      {rows.length > 0 && (
        <div className="cap-scroll">
          <table className="cap-table">
            <thead>
              <tr>
                <th>Domaine transverse</th>
                <th>Capacité j.h</th>
                <th>Projeté j.h · engagement</th>
                <th>dont tableau</th>
                <th>dont hors tableau</th>
                {columns.map((column) => (
                  <th key={column.key}><i className="lg-sw" style={{ background: column.color }} />{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map((row) => <MatrixRow key={row.domainId} row={row} columns={columns} />)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * Cartes qui pèsent: per transverse domain, the heaviest cards on its
 * people — title, code, requesting domain, j.h and share of the capacity.
 * Inputs: the weighing rows. Output: the (wide) panel. Failure: none.
 */
export function WeighingPanel({ rows }: { rows: WeighingRow[] }) {
  return (
    <Panel title="Cartes qui pèsent sur les transverses" wide
      hint="les leviers d’un arbitrage : pause, requalification, arrêt">
      {rows.length === 0 && <div className="mp-empty">Aucun domaine transverse dans la configuration.</div>}
      {rows.map((row) => (
        <div key={row.domainId}>
          <div className="cap-sub">{row.name}</div>
          {row.cards.length === 0 && <div className="mp-empty">Aucune affectation sur ce domaine.</div>}
          {row.cards.map((card) => (
            <div className="cap-item" key={card.cardId}>
              <span className="cap-name">{card.title}</span>
              <span className="cap-meta">
                <i className="lg-sw" style={{ background: card.domainColor }} />{card.domainName}
                {card.codename !== null && ` · ${card.codename}`}
              </span>
              <span className="cap-fig"><b>{fmtUnit(card.jh)} j.h</b> · {pct(card.share)} de la capacité</span>
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
