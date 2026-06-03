import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { useTickets } from "../lib/queries";
import { idx } from "../lib/mock";
import { statusMeta } from "../lib/colors";
import { relTime, agentLabel, truncate } from "../lib/helpers";
import type { CompanyId } from "../lib/types";
import StatusBadge from "../components/StatusBadge";
import { FilterChip } from "../components/atoms";
import NewTicketModal from "../components/NewTicketModal";

const ORDER: Record<string, number> = { blocked: 0, needs_approval: 1, error: 2, running: 3, queued: 4, done: 5 };

export default function Tickets({ companyId, onOpenTicket }: { companyId: CompanyId; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  const now = useNow();
  const [statusFilter, setStatusFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const { data: tickets = [] } = useTickets(companyId);

  const list = useMemo(() => tickets
    .filter((tk) => statusFilter === "all" || tk.status === statusFilter)
    .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (+new Date(b.created_at) - +new Date(a.created_at))),
    [tickets, statusFilter]);

  const statuses = ["all", "blocked", "needs_approval", "error", "running", "queued", "done"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
        <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{t("tickets.title")}</span>
        <span className="font-mono" style={{ color: "#7a8a82", fontSize: 11.5 }}>{t("tickets.count", { n: list.length })}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {statuses.map((s) => (
            <FilterChip key={s} label={s === "all" ? t("common.all") : statusMeta(s).label} active={statusFilter === s}
              color={s === "all" ? "#00ff88" : statusMeta(s).color} onClick={() => setStatusFilter(s)} />
          ))}
        </div>
        <button onClick={() => setNewOpen(true)} className="font-mono" style={{
          padding: "7px 15px", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer",
          color: "#0a0d0c", background: "#00ff88", border: "none", boxShadow: "0 0 16px -6px #00ff88", whiteSpace: "nowrap",
        }}>+ {t("newTicket.button")}</button>
      </div>
      <div className="mos-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "14px 16px" }}>
        {list.length === 0 ? (
          <div className="font-mono" style={{ padding: 40, textAlign: "center", color: "#5f7269", fontSize: 13 }}>{t("tickets.empty")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
            {list.map((tk) => {
              const m = statusMeta(tk.status);
              const phase = tk.current_phase_id ? idx.phase(tk.current_phase_id) : null;
              const attention = ["blocked", "needs_approval", "error"].includes(tk.status);
              const company = idx.company(tk.company_id);
              return (
                <div key={tk.id} onClick={() => onOpenTicket(tk.id)} className="mos-row" style={{
                  background: attention ? m.dim : "#0e1413", borderRadius: 10, padding: "13px 14px", cursor: "pointer",
                  border: "1px solid " + (attention ? m.border : "#1a3a2a"), borderLeft: "3px solid " + (attention ? m.color : "#1a3a2a"),
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>#{tk.id} · {company?.name}</span>
                    <StatusBadge status={tk.status} />
                  </div>
                  <div style={{ color: "#e6f1ec", fontSize: 14, marginTop: 7, fontWeight: 600, lineHeight: 1.25 }}>{tk.title}</div>
                  {tk.blocked_reason && (
                    <div className="font-mono" style={{ marginTop: 8, fontSize: 11, color: "#ff8099", lineHeight: 1.4 }}>⚠ {truncate(tk.blocked_reason, 120)}</div>
                  )}
                  <div className="font-mono" style={{ color: "#5f7269", fontSize: 11, marginTop: 9, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {phase && <span>{t("tickets.phase")} <span style={{ color: "#00ddff" }}>{phase.name}</span></span>}
                    <span>{agentLabel(tk.assignee_agent_id)}</span>
                    <span>{relTime(tk.created_at, now)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {newOpen && (
        <NewTicketModal companyId={companyId} onClose={() => setNewOpen(false)} onCreated={(id) => onOpenTicket(id)} />
      )}
    </div>
  );
}
