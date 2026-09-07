// The two arbitration tables of the capacity view (ADR 024/025): the
// transverse matrix (which domains consume the shared people) and the cards
// weighing most on each transverse domain — the levers an arbitration can
// pull (pause, requalify, stop). Pure presentation over core/capacity-view.

import type { Consumer, TransverseRow, WeighingRow } from "../../core/capacity-view.ts";
import { fmtUnit } from "../format.ts";
import { Panel, pct } from "./capacityPanels.tsx";

interface Column {
  key: string;
  name: string;
  color: string;
  total: number;
}

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

function MatrixRow({ row, columns }: { row: TransverseRow; columns: Column[] }) {
  const over = row.ratio !== null && row.ratio > 1;
  return (
    <tr>
      <th><i className="lg-sw" style={{ background: row.color }} />{row.name}</th>
      <td>{fmtUnit(row.capacityJh)}</td>
      <td className={over ? "cap-over" : ""}>{fmtUnit(row.demandJh)}<small>{pct(row.ratio)}</small></td>
      {columns.map((column) => {
        const cell = cellOf(row, column);
        return cell === undefined
          ? <td key={column.key} className="cap-empty-cell">·</td>
          : <td key={column.key}>{fmtUnit(cell.jh)}<small>{pct(cell.share)}</small></td>;
      })}
    </tr>
  );
}

/**
 * Demande sur les domaines transverses: one row per transverse domain, one
 * column per consumer domain; cells carry the j.h and the share of the
 * transverse domain's capacity.
 * Inputs: the transverse rows. Output: the (wide) panel. Failure: none — no
 * transverse domain in the config says so.
 */
export function TransversePanel({ rows }: { rows: TransverseRow[] }) {
  const columns = columnsOf(rows);
  return (
    <Panel title="Demande sur les domaines transverses" wide
      hint="qui consomme la capacité partagée · j.h prévisionnels de l’exercice et part de la capacité du domaine">
      {rows.length === 0 && <div className="mp-empty">Aucun domaine transverse dans la configuration.</div>}
      {rows.length > 0 && (
        <div className="cap-scroll">
          <table className="cap-table">
            <thead>
              <tr>
                <th>Domaine transverse</th>
                <th>Capacité j.h</th>
                <th>Demande j.h</th>
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
