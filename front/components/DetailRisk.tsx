// Read-mode detail sections (design/modals.jsx): the budget cross-graph
// (RDLI · estimé · engagé · réalisé, all inline-editable) and the Risques
// section (retained risks, editable). Each saves through onPatch (editCard).

import { useState } from "react";
import type { BoardConfig, CardPatch, CardState } from "../../core/types.ts";
import { budgetModel } from "../detailModel.ts";
import { InlineEdit, RiskEditor } from "./modalEditors.tsx";

/** Budget cross-graph: one bar per figure, the RDLI envelope as a ref line. */
export function BudgetGraph({ card, onPatch }: { card: CardState; onPatch: (patch: CardPatch) => void }) {
  const { rows, bMax, bRdli, bReal } = budgetModel(card);
  return (
    <div className="sec">
      <div className="sec-head"><span className="sec-title">Budget · graphe croisé</span><span className="sec-note">k€</span></div>
      <div className="bgraph">
        {rows.map((r) => (
          <div className="bg-row" key={r.key}>
            <span className="bg-label">{r.label}</span>
            <div className="bg-track">
              <span className="bg-fill" style={{ width: `${(r.val / bMax) * 100}%`, background: r.color, opacity: r.ref ? 0.5 : 1 }} />
              <span className="bg-ref" style={{ left: `${(bRdli / bMax) * 100}%` }} />
            </div>
            <span className="bg-val" style={{ color: r.key === "real" && bReal > bRdli ? "var(--danger-strong)" : "var(--tx-2)" }}>
              <InlineEdit<number>
                value={r.val} type="number"
                fromInput={(v) => (v === "" ? 0 : Math.max(0, Number(v)))}
                onCommit={(v) => onPatch({ [r.field]: v } as CardPatch)}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="bg-legend">Trait vertical = enveloppe RDLI (référence d’arbitrage)</div>
    </div>
  );
}

// The retained-risk rows: severity dot, type tag, inline-editable description.
function RiskRows({ risks, config, onPatch }: { risks: CardState["risks"]; config: BoardConfig; onPatch: (patch: CardPatch) => void }) {
  return (
    <div className="risk-list">
      {risks.map((r) => {
        const rt = config.riskTypes.find((t) => t.id === r.type);
        return (
          <div className="risk-row" key={r.type}>
            <span className="risk-sev" style={{ background: rt ? rt.color : "#64748b" }} />
            {rt && <span className="ctype-tag" style={{ color: rt.color, borderColor: `color-mix(in oklab, ${rt.color} 40%, transparent)`, background: `color-mix(in oklab, ${rt.color} 8%, #fff)` }}>{rt.short}</span>}
            <span className="risk-desc">
              <InlineEdit value={r.desc} placeholder="décrire le risque…"
                onCommit={(v) => onPatch({ risks: risks.map((x) => (x.type === r.type ? { ...x, desc: v } : x)) })} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Risques: the retained risks (per bearing entity), editable checklist. */
export function RisksSection({ card, config, onPatch }: {
  card: CardState;
  config: BoardConfig;
  onPatch: (patch: CardPatch) => void;
}) {
  const [riskEdit, setRiskEdit] = useState(false);
  const risks = card.risks;
  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-title">Risques</span>
        {!riskEdit && <button className="delay-toggle" onClick={() => setRiskEdit(true)}>Modifier les risques</button>}
      </div>
      {riskEdit ? (
        <RiskEditor config={config} risks={risks} onSave={(rs) => { onPatch({ risks: rs }); setRiskEdit(false); }} onCancel={() => setRiskEdit(false)} />
      ) : risks.length === 0 ? (
        <div className="cm-empty" onClick={() => setRiskEdit(true)}>Aucun risque retenu. Cliquer pour en ajouter.</div>
      ) : (
        <RiskRows risks={risks} config={config} onPatch={onPatch} />
      )}
    </div>
  );
}
