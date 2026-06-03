import { useState } from "react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { roleMeta } from "../lib/colors";
import { parentChain, goalRoot, priorVerdict, goalCost, budget, usd, relTime } from "../lib/helpers";
import { idx, store } from "../lib/mock";
import type { Ticket } from "../lib/types";
import RoleBadge from "./RoleBadge";
import VerdictBadge from "./VerdictBadge";

function MiniChain({ ticketId, onOpenTicket }: { ticketId: number; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  const chain = parentChain(ticketId);
  return (
    <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
      {chain.map((tk, i) => {
        const last = i === chain.length - 1;
        const visits = tk.phase_visit_count ? Object.values(tk.phase_visit_count)[0] : 1;
        const phase = tk.current_phase_id ? idx.phase(tk.current_phase_id) : null;
        const label = i === 0 ? "◆ " + t("inbox.goal") : phase ? phase.name : "step";
        return (
          <Fragment key={tk.id}>
            {i > 0 && <span style={{ color: "#3a4a42" }}>→</span>}
            <button onClick={() => onOpenTicket(tk.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: last ? "#cfe0d7" : "#7a8a82", fontWeight: last ? 700 : 400 }}>
              {label}{visits > 1 && <span style={{ color: "#ffaa00" }}> ↻{visits}</span>}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

export default function ApprovalCard({ ticket, onOpenTicket, onDecide }: {
  ticket: Ticket;
  onOpenTicket: (id: number) => void;
  onDecide?: (ticket: Ticket, decision: "approved" | "rejected", reason?: string) => void;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  const goal = goalRoot(ticket.id)!;
  const phase = ticket.current_phase_id ? idx.phase(ticket.current_phase_id) : null;
  const agent = ticket.assignee_agent_id ? idx.agent(ticket.assignee_agent_id) : null;
  const role = roleMeta(agent ? agent.role : null);
  const prior = priorVerdict(ticket.id);
  const cost = goalCost(ticket.id);
  const company = store.companies.find((c) => c.id === ticket.company_id)!;
  const coBudget = budget(company.cost_spent_period, company.budget_usd_limit);
  const reworks = parentChain(ticket.id).reduce((n, tk) => n + (tk.phase_visit_count ? Math.max(0, (Object.values(tk.phase_visit_count)[0] || 1) - 1) : 0), 0);

  const requestVerb = agent && agent.role === "ceo" ? t("inbox.reqShip") : agent && agent.role === "qa" ? t("inbox.reqVerify") : t("inbox.reqApproval");
  const waited = relTime(ticket.locked_at || ticket.created_at, now);

  if (done) {
    return (
      <div style={{ border: "1px solid #1a3a2a", borderRadius: 12, padding: "16px 18px", background: "#0e1413", opacity: 0.8 }}>
        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{ color: done === "approved" ? "#00ff88" : "#ff4466", fontWeight: 700 }}>{done === "approved" ? "✓ " + t("inbox.approved") : "✕ " + t("inbox.rejected")}</span>
          <span style={{ color: "#7a8a82" }}>{goal.title}</span>
          <span style={{ color: "#5f7269" }}>· {done === "approved" ? t("inbox.requeued") : t("inbox.sentBack")}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #ffaa0055", borderTop: "2px solid #ffaa00", borderRadius: 12, background: "#0e1413", overflow: "hidden" }}>
      <div style={{ padding: "16px 18px 14px", display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>
              {company.name} · {phase ? phase.name + " " + t("inbox.gate") : t("inbox.approvalGate")} · #{ticket.id}
            </div>
            <button onClick={() => onOpenTicket(ticket.id)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <h3 style={{ color: "#e6f1ec", fontSize: 18, fontWeight: 700, margin: "4px 0 0", lineHeight: 1.25 }}>{goal.title}</h3>
            </button>
          </div>
          <div className="font-mono" style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: "#ffaa00", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>{t("inbox.waiting")}</div>
            <div style={{ color: "#9fb3a9", fontSize: 12, marginTop: 2 }}>{waited}</div>
          </div>
        </div>

        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
          <RoleBadge role={agent ? agent.role : null} />
          <span style={{ color: role.color, fontWeight: 700 }}>{agent ? agent.title : "Agent"}</span>
          <span style={{ color: "#9fb3a9" }}>{t("inbox.isRequesting")} <span style={{ color: "#e6f1ec", fontWeight: 600 }}>{requestVerb}</span></span>
        </div>

        {prior && (
          <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid #1a3a2a", borderRadius: 9, padding: "11px 13px" }}>
            <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}>
              <span style={{ color: roleMeta(prior.agent ? prior.agent.role : null).color, fontWeight: 700 }}>{prior.agent ? prior.agent.title : "QA"}</span>
              <span style={{ color: "#5f7269" }}>({roleMeta(prior.agent ? prior.agent.role : null).label})</span>
              <VerdictBadge decision={prior.decision} size="sm" />
              {reworks > 0 && <span style={{ color: "#ffaa00" }}>{t("inbox.afterReworks", { count: reworks })}</span>}
            </div>
            {prior.json && prior.json.reasons && prior.json.reasons[0] && (
              <div className="font-mono" style={{ color: "#9fb3a9", fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>“{prior.json.reasons[0]}”</div>
            )}
            {(!prior.json || !prior.json.reasons) && prior.json && prior.json.note && (
              <div className="font-mono" style={{ color: "#9fb3a9", fontSize: 12, marginTop: 6, fontStyle: "italic" }}>“{prior.json.note}”</div>
            )}
          </div>
        )}

        <MiniChain ticketId={ticket.id} onOpenTicket={onOpenTicket} />

        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#7a8a82", flexWrap: "wrap" }}>
          <span>{t("inbox.goalCost", { usd: usd(cost.usd) })} <span style={{ color: "#5f7269" }}>({(cost.tokens / 1000).toFixed(1)}k tok)</span></span>
          <span style={{ color: "#3a4a42" }}>·</span>
          <span dangerouslySetInnerHTML={{ __html: t("inbox.ofCap", { pct: `<b style="color:${coBudget.color}">${Math.round(coBudget.pct * 100)}</b>` }) }} />
        </div>
      </div>

      {!reject ? (
        <div style={{ display: "flex", gap: 10, padding: "12px 18px", borderTop: "1px solid #16201c", background: "#0b1110" }}>
          <button onClick={() => { setDone("approved"); onDecide?.(ticket, "approved"); }} className="font-mono" style={{
            flex: 1, padding: "11px", borderRadius: 9, fontSize: 14, fontWeight: 700, color: "#0a0d0c", background: "#00ff88", border: "none", cursor: "pointer", boxShadow: "0 0 18px -7px #00ff88",
          }}>✓ {t("common.approve")}</button>
          <button onClick={() => setReject(true)} className="font-mono" style={{
            flex: 1, padding: "11px", borderRadius: 9, fontSize: 14, fontWeight: 700, color: "#ff5577", background: "transparent", border: "1px solid #ff4466", cursor: "pointer",
          }}>✕ {t("common.reject")}</button>
        </div>
      ) : (
        <div style={{ padding: "12px 18px", borderTop: "1px solid #16201c", background: "#0b1110" }}>
          <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("inbox.reasonPlaceholder")} className="font-mono"
            style={{ width: "100%", height: 64, background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 8, color: "#e6f1ec", padding: 9, fontSize: 12.5, resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 9 }}>
            <button onClick={() => setReject(false)} className="font-mono" style={{ padding: "8px 15px", borderRadius: 7, color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", cursor: "pointer", fontSize: 12.5 }}>{t("common.cancel")}</button>
            <button onClick={() => { setDone("rejected"); onDecide?.(ticket, "rejected", reason); }} className="font-mono" style={{ padding: "8px 16px", borderRadius: 7, color: "#fff", background: "#ff4466", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>{t("inbox.sendRejection")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
