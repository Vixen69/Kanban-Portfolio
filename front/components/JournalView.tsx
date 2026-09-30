// The « Journal » tab of Analytics (ADR 052, author 2026-09-30: « un
// historique de tous les déplacements »): every move, decision, blocking,
// archiving — and, on demand, the import's — of the exercise shown, newest
// first, grouped by day. Filtered on « Décisions » since the instantané of
// a séance, it is the decision record to send out after the review.
// A read of the event log (core/journal.ts): nothing is stored.

import { useEffect, useMemo, useState } from "react";
import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import type { SnapshotSummary } from "../../core/snapshot.ts";
import { filterJournal, journalAll, journalCounts, type JournalKind, type JournalRow } from "../../core/journal.ts";
import { cardMatchesQuery } from "../../core/text-search.ts";
import { fetchSnapshots } from "../apiSnapshots.ts";
import { displayActor } from "../lookup.ts";

/** Rows drawn before « … de plus » (the VM draws every line on the CPU). */
const PAGE = 300;
const DAY_MS = 86_400_000;
const KINDS: Array<[JournalKind, string]> = [["move", "Mouvements"], ["decision", "Décisions"], ["block", "Blocages"], ["archive", "Archives"], ["restore", "Restaurations"], ["import", "Import"]];

/** Props of the journal tab. */
export interface JournalTabProps {
  /** Every card of the exercise shown, archived ones included (titles, bounds). */
  cards: CardState[];
  /** The effective event log. */
  events: CardEvent[];
  /** The log as written, restores included: each restore is a line (ADR 042). */
  log: CardEvent[];
  config: BoardConfig;
  now: number;
  /** Opens a card's fiche. */
  onOpen: (cardId: string) => void;
}

// The period: since an instantané (its log position), or the last N days.
type Period = { kind: "days"; days: number } | { kind: "snapshot"; seq: number } | { kind: "all" };

function usePeriodChoices(): SnapshotSummary[] {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  useEffect(() => {
    let live = true;
    fetchSnapshots().then((list) => { if (live) setSnapshots([...list].sort((a, b) => b.logSeq - a.logSeq)); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return snapshots;
}

function PeriodSelect({ period, onPeriod, snapshots }: { period: Period; onPeriod: (p: Period) => void; snapshots: SnapshotSummary[] }) {
  const value = period.kind === "days" ? `d${period.days}` : period.kind === "snapshot" ? `s${period.seq}` : "all";
  const pick = (raw: string) => onPeriod(raw === "all" ? { kind: "all" } : raw.startsWith("d") ? { kind: "days", days: Number(raw.slice(1)) } : { kind: "snapshot", seq: Number(raw.slice(1)) });
  return (
    <select className="inp jr-period" value={value} onChange={(event) => pick(event.target.value)} aria-label="Période">
      <option value="d7">7 derniers jours</option>
      <option value="d30">30 derniers jours</option>
      <option value="all">Tout l’exercice</option>
      {snapshots.map((s) => (
        <option key={s.id} value={`s${s.logSeq}`}>Depuis l’instantané « {s.label} » ({new Date(s.ts).toLocaleDateString("fr-FR")})</option>
      ))}
    </select>
  );
}

function frDayTitle(ts: string): string {
  return new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function Row({ row, card, onOpen }: { row: JournalRow; card: CardState | undefined; onOpen: (id: string) => void }) {
  return (
    <tr className={"jr-row jr-" + row.kind}>
      <td className="jr-time">{new Date(row.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
      <td className="jr-subject">
        {row.cardId === "*" ? <i>Tout le tableau</i> : (
          <button className="jr-link" onClick={() => onOpen(row.cardId)} title="Ouvrir la fiche">
            {card?.codename !== null && card?.codename !== undefined && <span className="jr-code">{card.codename}</span>}
            {card?.title ?? row.cardId}
          </button>
        )}
      </td>
      <td className="jr-label">{row.label}</td>
      <td className="jr-move">{row.from !== null ? <>{row.from} → <b>{row.to}</b></> : ""}</td>
      <td className="jr-detail">{row.detail ?? ""}</td>
      <td className="jr-actor">{displayActor(row.actor)}</td>
    </tr>
  );
}

function Rows({ rows, byId, onOpen }: { rows: JournalRow[]; byId: Map<string, CardState>; onOpen: (id: string) => void }) {
  const out: React.ReactNode[] = [];
  let day = "";
  for (const row of rows) {
    const today = new Date(row.ts).toLocaleDateString("fr-FR"); // the local day, as titled and timed
    if (today !== day) {
      day = today;
      out.push(<tr key={"d" + row.id} className="jr-day"><td colSpan={6}>{frDayTitle(row.ts)}</td></tr>);
    }
    out.push(<Row key={row.id} row={row} card={byId.get(row.cardId)} onOpen={onOpen} />);
  }
  return <>{out}</>;
}

// The rows the filters keep: built once per log (not per keystroke), then
// filtered — the exercise's cards matching the search, plus the deleted
// ones (gone from the fold, not from the log).
function useJournalRows(src: Pick<JournalTabProps, "cards" | "events" | "log" | "config" | "now">, snapshots: SnapshotSummary[], period: Period, kinds: ReadonlySet<JournalKind>, search: string): JournalRow[] {
  const { cards, events, log, config, now } = src;
  // Each import load began with its automatic snapshot: it dates the older « Importée » lines.
  const importMarks = useMemo(() => snapshots.filter((s) => s.label.startsWith("avant chargement")).map((s) => ({ logSeq: s.logSeq, ts: s.ts })).sort((a, b) => a.logSeq - b.logSeq), [snapshots]);
  const all = useMemo(() => journalAll(config, events, { raw: log, importMarks }), [config, events, log, importMarks]);
  const deleted = useMemo(() => new Set(events.filter((e) => e.type === "deleted").map((e) => e.cardId)), [events]);
  return useMemo(() => {
    const matching = cards.filter((card) => cardMatchesQuery(card, search)).map((card) => card.id);
    const needle = search.trim().toLowerCase();
    const gone = [...deleted].filter((id) => needle === "" || id.toLowerCase().includes(needle));
    const since = period.kind === "days" ? { sinceTs: new Date(now - period.days * DAY_MS).toISOString() } : {};
    const after = period.kind === "snapshot" ? { afterSeq: period.seq } : {};
    return filterJournal(all, { kinds, cardIds: new Set([...matching, ...gone]), ...since, ...after });
  }, [all, cards, deleted, kinds, now, period, search]);
}

/**
 * The journal tab.
 * Inputs: JournalTabProps. Output: the filters, the head counts and the
 * table grouped by day (PAGE rows at a time). Failure modes: none — an
 * unreachable snapshot list only removes the « depuis l'instantané » choices.
 */
export function JournalTab({ cards, events, log, config, now, onOpen }: JournalTabProps) {
  const snapshots = usePeriodChoices();
  const [period, setPeriod] = useState<Period>({ kind: "days", days: 30 });
  const [kinds, setKinds] = useState<ReadonlySet<JournalKind>>(new Set<JournalKind>(["move", "decision", "block", "archive", "restore"]));
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const rows = useJournalRows({ cards, events, log, config, now }, snapshots, period, kinds, search);
  const since = period.kind === "snapshot" ? snapshots.find((s) => s.logSeq === period.seq) : undefined;
  const counts = journalCounts(rows);
  const toggle = (kind: JournalKind) => setKinds((current) => {
    const next = new Set(current);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    return next;
  });
  return (
    <div className="jr">
      <div className="jr-bar">
        <PeriodSelect period={period} onPeriod={(p) => { setPeriod(p); setLimit(PAGE); }} snapshots={snapshots} />
        {KINDS.map(([kind, label]) => (
          <button key={kind} className={"pill" + (kinds.has(kind) ? " on" : "")} aria-pressed={kinds.has(kind)} onClick={() => toggle(kind)}>{label}</button>
        ))}
        <input className="inp jr-search" placeholder="Rechercher un sujet…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="jr-head">
        {since !== undefined ? `Depuis l’instantané « ${since.label} » : ` : ""}
        {counts.move} mouvement(s) · {counts.decision} décision(s) · {counts.block} blocage(s) · {counts.archive} archivage(s) ou suppression(s){counts.restore > 0 ? ` · ${counts.restore} restauration(s)` : ""}{kinds.has("import") ? ` · ${counts.import} ligne(s) d’import` : ""}
      </div>
      {rows.length === 0
        ? <div className="cm-empty">Rien sur cette période avec ces filtres.</div>
        : <table className="jr-table"><tbody><Rows rows={rows.slice(0, limit)} byId={byId} onOpen={onOpen} /></tbody></table>}
      {rows.length > limit && <button className="btn ghost sm" onClick={() => setLimit((l) => l + PAGE)}>… {rows.length - limit} de plus</button>}
    </div>
  );
}
