import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { useAgents, useCompanies, useUpsertAgent } from "../lib/queries";
import { agentActivity, budget, usd } from "../lib/helpers";
import { roleMeta } from "../lib/colors";
import type { Agent, Company, CompanyId } from "../lib/types";
import type { RosterState } from "../App";
import AgentCard from "../components/AgentCard";
import AgentEditModal from "../components/AgentEditModal";

function CompanyBudgetBar({ company }: { company: Company }) {
  const { t } = useTranslation();
  const b = budget(company.cost_spent_period, company.budget_usd_limit);
  if (!b.capped) return null;
  const pct = Math.round(b.pct * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 230 }}>
      <span className="font-mono" style={{ fontSize: 11, color: "#7a8a82", whiteSpace: "nowrap" }}>{t("roster.companyBudget")}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#0a0d0c", border: "1px solid #1a3a2a", overflow: "hidden", minWidth: 90 }}>
        <div style={{ width: pct + "%", height: "100%", background: b.color, boxShadow: "0 0 8px -1px " + b.color }} />
      </div>
      <span className="font-mono" style={{ fontSize: 11, color: b.color, fontWeight: 700, whiteSpace: "nowrap" }}>
        {usd(company.cost_spent_period)}/{usd(company.budget_usd_limit)} · {pct}%
      </span>
    </div>
  );
}

export default function Roster({ companyId, onOpenTicket, stateFilter, setStateFilter }: {
  companyId: CompanyId; onOpenTicket: (id: number) => void; stateFilter: RosterState; setStateFilter: (s: RosterState) => void;
}) {
  const { t } = useTranslation();
  useNow();
  const { data: agents = [] } = useAgents(companyId);
  const { data: companies = [] } = useCompanies();
  const upsert = useUpsertAgent();
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [firing, setFiring] = useState<Agent | null>(null);

  const sortKey = (a: Agent) => {
    const act = agentActivity(a.id);
    if (act.status === "blocked") return 0;
    if (a.status === "paused") return 1;
    if (act.status === "needs_approval") return 2;
    if (act.status === "running") return 3;
    if (a.status === "terminated") return 9;
    return 5;
  };

  const groups = useMemo(() => {
    const cos = companyId === "all" ? companies : companies.filter((c) => c.id === companyId);
    return cos.map((co) => {
      let list = agents.filter((a) => a.company_id === co.id);
      if (stateFilter !== "all") {
        list = list.filter((a) => {
          const act = agentActivity(a.id);
          if (stateFilter === "active") return a.status === "active";
          if (stateFilter === "paused") return a.status === "paused";
          if (stateFilter === "blocked") return act.status === "blocked";
          return true;
        });
      }
      list = list.slice().sort((x, y) => sortKey(x) - sortKey(y));
      return { company: co, agents: list };
    }).filter((g) => g.agents.length > 0);
  }, [companyId, stateFilter, agents, companies]);

  const handleToggle = (a: Agent) => upsert.mutate({ ...a, status: a.status === "paused" ? "active" : "paused", paused_reason: a.status === "paused" ? null : "paused by operator" });
  const handleSave = (data: Agent) => { upsert.mutate(data); setEditing(null); };
  const handleFireConfirm = () => { if (firing) upsert.mutate({ ...firing, status: "terminated", paused_reason: "terminated by operator" }); setFiring(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
        <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{t("roster.title")}</span>
        <span className="font-mono" style={{ color: "#7a8a82", fontSize: 11.5 }}>{t("roster.subtitle")}</span>
        <div style={{ display: "flex", gap: 5, marginLeft: 6 }}>
          {(["all", "active", "paused", "blocked"] as RosterState[]).map((s) => (
            <button key={s} onClick={() => setStateFilter(s)} className="font-mono" style={{
              padding: "4px 10px", borderRadius: 5, fontSize: 11.5, cursor: "pointer",
              color: stateFilter === s ? "#00ff88" : "#7a8a82",
              background: stateFilter === s ? "rgba(255,255,255,0.04)" : "transparent",
              border: "1px solid " + (stateFilter === s ? "#00ff8866" : "#1a3a2a"),
            }}>{s === "all" ? t("common.all") : s}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing("new")} className="font-mono" style={{
          padding: "7px 15px", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer",
          color: "#0a0d0c", background: "#00ff88", border: "none", boxShadow: "0 0 16px -6px #00ff88",
        }}>+ {t("common.hireAgent")}</button>
      </div>

      <div className="mos-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "16px" }}>
        {groups.length === 0 ? (
          <div className="font-mono" style={{ padding: 40, textAlign: "center", color: "#5f7269", fontSize: 13 }}>{t("roster.empty")}</div>
        ) : groups.map((g) => (
          <div key={g.company.id} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
              <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em" }}>{g.company.name}</span>
              <span className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>{t("roster.crewCount", { n: g.agents.filter((a) => a.status !== "terminated").length })}</span>
              <div style={{ flex: 1 }} />
              <CompanyBudgetBar company={g.company} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 14 }}>
              {g.agents.map((a) => (
                <AgentCard key={a.id} agent={a} onEdit={setEditing} onToggle={handleToggle} onFire={setFiring} onOpenTicket={onOpenTicket} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && <AgentEditModal agent={editing === "new" ? null : editing} companyId={companyId === "all" ? companies[0].id : companyId} onSave={handleSave} onClose={() => setEditing(null)} />}

      {firing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center", zIndex: 80 }} onClick={() => setFiring(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, background: "#11161a", border: "1px solid #ff446655", borderRadius: 12, padding: 22 }}>
            <div className="font-mono" style={{ color: "#ff6680", fontWeight: 700, fontSize: 15, letterSpacing: "0.04em" }}>{t("common.fire")} — {firing.title}?</div>
            <div className="font-mono" style={{ color: "#9fb3a9", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              {firing.title} ({roleMeta(firing.role).title})
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={() => setFiring(null)} className="font-mono" style={{ padding: "8px 16px", borderRadius: 7, color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", cursor: "pointer", fontSize: 13 }}>{t("common.cancel")}</button>
              <button onClick={handleFireConfirm} className="font-mono" style={{ padding: "8px 16px", borderRadius: 7, color: "#fff", background: "#ff4466", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{t("common.fire")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
