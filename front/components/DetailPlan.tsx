// Read-mode detail sections (design/modals.jsx): the owner strip, the
// projected RDR date, the plan de charge by profile and the contention
// section. Each owns its edit toggle and saves through onPatch (editCard).

import { useState } from "react";
import type { BoardConfig, CardPatch, CardState, Profile } from "../../core/types.ts";
import { daysInColumn } from "../../core/aging.ts";
import { colLabel, profileRows, rdrModel } from "../detailModel.ts";
import { ChargeEditor, ContentionEditor, InlineEdit } from "./modalEditors.tsx";

/** Compact chef-de-projet strip: avatar initial, editable owner, age. */
export function OwnerStrip({ card, config, now, onPatch }: {
  card: CardState;
  config: BoardConfig;
  now: number;
  onPatch: (patch: CardPatch) => void;
}) {
  const domain = config.domains.find((d) => d.id === card.domain) ?? config.domains[0]!;
  const lane = config.lanes.find((l) => l.id === card.laneId) ?? config.lanes[0]!;
  const days = daysInColumn(card, new Date(now));
  const initial = (card.owner || "—").replace(/^(M\.|Mme)\s*/, "").slice(0, 1);
  return (
    <div className="owner-strip">
      <span className="owner-mono" style={{ background: domain.color }}>{initial}</span>
      <div className="owner-meta">
        <b><InlineEdit value={card.owner} placeholder="Chef de projet non assigné" onCommit={(v) => onPatch({ owner: v.trim() })} /></b>
        <span>{lane.name} · {card.loadPlan || "plan de charge n.c."}</span>
      </div>
      <span className="owner-since">{days} j dans {colLabel(config, card.columnId)}</span>
    </div>
  );
}

/** Projected RDR (delivery) date, inline-editable, coloured when soon/past. */
export function RdrStrip({ card, now, onPatch }: { card: CardState; now: number; onPatch: (patch: CardPatch) => void }) {
  const rdr = rdrModel(card, now);
  return (
    <div className={"rdr-strip " + rdr.state}>
      <span className="rdr-ic" aria-hidden="true">◷</span>
      <div className="rdr-meta">
        <span className="rdr-label">RDR · livraison projetée</span>
        <b>
          <InlineEdit<string | null>
            value={card.dateRdr} type="date" display={rdr.formatted}
            toInput={(v) => (v ? String(v).slice(0, 10) : "")}
            fromInput={(v) => (v ? new Date(v).toISOString() : null)}
            onCommit={(v) => onPatch({ dateRdr: v })}
          />
        </b>
      </div>
      <span className={"rdr-eta " + rdr.state}>{rdr.sub}</span>
    </div>
  );
}

// One plan-de-charge row: profile bar + « consommé / estimé » where the
// consumed is click-to-edit inline (design v11), clamped to [0, jh].
function ProfRow({ p, max, onCommitDone }: { p: ReturnType<typeof profileRows>["rows"][number]; max: number; onCommitDone: (v: number) => void }) {
  return (
    <div className="prof-row">
      <span className="prof-name"><i className="prof-dot" style={{ background: p.color }} />{p.name}</span>
      <div className="prof-track" title={`${p.done} consommés · ${p.raf} restants`}>
        <span className="prof-done" style={{ width: `${(p.jh / max) * 100}%`, background: `color-mix(in oklab, ${p.color} 22%, #fff)`, borderColor: `color-mix(in oklab, ${p.color} 35%, transparent)` }} />
        <span className="prof-fill" style={{ width: `${(p.done / max) * 100}%`, background: p.color }} />
      </div>
      <span className="prof-jh" title="Consommé / estimé — cliquer le consommé pour modifier">
        <InlineEdit<number>
          value={p.done} type="number" className="prof-done-num" display={String(p.done)}
          fromInput={(v) => { const n = v === "" ? 0 : Number(v); return Number.isFinite(n) ? Math.round(n) : 0; }}
          onCommit={onCommitDone}
        />
        <span className="prof-slash">/</span><b>{p.jh}</b> j.h
      </span>
    </div>
  );
}

/**
 * Plan de charge · j.h par profil (bars per profile, editable). The
 * subtitle sums the per-profile done values (design v11), not the
 * card-level effortConsumed.
 */
export function PlanDeCharge({ card, config, onPatch }: { card: CardState; config: BoardConfig; onPatch: (patch: CardPatch) => void }) {
  const [edit, setEdit] = useState(false);
  const { rows, max, total, done } = profileRows(card, config);
  const est = card.effortEstimated ?? 0;
  const cons = card.effortConsumed ?? 0;
  const commitDone = (profileId: string, jh: number) => (v: number) =>
    onPatch({ chargeByProfile: card.chargeByProfile.map((x) => (x.profileId === profileId ? { ...x, done: Math.max(0, Math.min(jh, v)) } : x)) });
  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-title">Plan de charge · j/h par profil</span>
        {!edit && <button className="delay-toggle" onClick={() => setEdit(true)}>Modifier</button>}
      </div>
      {edit ? (
        <ChargeEditor config={config} charge={card.chargeByProfile} est={est} cons={cons}
          onSave={(cb) => { onPatch({ chargeByProfile: cb }); setEdit(false); }} onCancel={() => setEdit(false)} />
      ) : rows.length === 0 ? (
        <div className="cm-empty" onClick={() => setEdit(true)}>Aucune charge répartie. Cliquer pour renseigner les profils.</div>
      ) : (
        <>
          <div className="prof-sub">{total} j.h estimés · {done} consommés</div>
          <div className="prof-table">
            {rows.map((p, i) => <ProfRow key={i} p={p} max={max} onCommitDone={commitDone(p.profileId, p.jh)} />)}
          </div>
          <div className="prof-legend"><span><i className="pl-sw filled" /> consommé</span><span><i className="pl-sw" /> charge totale estimée</span></div>
          {cons > est && <div className="cs-warn">Consommé global au-delà du meilleur estimé · reste à faire à réévaluer</div>}
        </>
      )}
    </div>
  );
}

/** Risque de contention: profiles under tension + a free note (editable). */
export function ContentionSection({ card, config, onPatch }: { card: CardState; config: BoardConfig; onPatch: (patch: CardPatch) => void }) {
  const [edit, setEdit] = useState(false);
  const contProfiles = card.contentionProfiles
    .map((id) => config.profiles.find((p) => p.id === id))
    .filter((p): p is Profile => Boolean(p));
  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-title">Risque de contention</span>
        {!edit && <button className="delay-toggle" onClick={() => setEdit(true)}>Modifier</button>}
      </div>
      {edit ? (
        <ContentionEditor config={config} profiles={card.contentionProfiles} note={card.contentionNote}
          onSave={(v) => { onPatch({ contentionProfiles: v.profiles, contentionNote: v.note }); setEdit(false); }} onCancel={() => setEdit(false)} />
      ) : contProfiles.length === 0 && !card.contentionNote ? (
        <div className="cm-empty" onClick={() => setEdit(true)}>Aucun profil en tension. Cliquer pour signaler.</div>
      ) : (
        <>
          {contProfiles.length > 0 && (
            <div className="cont-chips">
              {contProfiles.map((p) => (
                <span className="cont-chip" key={p.id}
                  style={{ color: `color-mix(in oklab, ${p.color} 65%, #0f172a)`, borderColor: `color-mix(in oklab, ${p.color} 40%, transparent)`, background: `color-mix(in oklab, ${p.color} 9%, #fff)` }}>
                  <i style={{ background: p.color }} />{p.name}
                </span>
              ))}
            </div>
          )}
          {card.contentionNote && <p className="cont-note" onClick={() => setEdit(true)} style={{ marginTop: contProfiles.length ? 9 : 0 }}>{card.contentionNote}</p>}
        </>
      )}
    </div>
  );
}
