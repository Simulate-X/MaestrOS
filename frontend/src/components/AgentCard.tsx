import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { roleMeta, verdictColor, statusMeta } from "../lib/colors";
import { agentActivity, agentRecentRuns, truncate } from "../lib/helpers";
import { idx } from "../lib/mock";
import type { Agent } from "../lib/types";
import RoleBadge from "./RoleBadge";
import BudgetGauge from "./BudgetGauge";
import { ProviderMark, AgentVerb } from "./AgentBits";
import { Kebab } from "./atoms";

export default function AgentCard({ agent, onEdit, onToggle, onFire, onOpenTicket }: {
  agent: Agent;
  onEdit: (a: Agent) => void;
  onToggle: (a: Agent) => void;
  onFire: (a: Agent) => void;
  onOpenTicket: (id: number) => void;
}) {
  const { t } = useTranslation();
  useNow();
  const r = roleMeta(agent.role);
  const activity = agentActivity(agent.id);
  const recent = agentRecentRuns(agent.id, 2);
  const boss = agent.reporting_to ? idx.agent(agent.reporting_to) : null;
  const pausedForBudget = agent.status === "paused" && /budget/i.test(agent.paused_reason || "") ? agent.paused_reason : null;
  const dimmed = agent.status === "paused" || agent.status === "terminated";
  const accent = activity.status === "blocked" ? "#ff4466" : agent.status === "paused" ? "#ffaa00" : agent.status === "terminated" ? "#3a4a42" : r.color;

  return (
    <div style={{
      position: "relative", background: "#0e1413", border: "1px solid " + (dimmed ? "#1a2420" : "#1a3a2a"),
      borderTop: "2px solid " + accent, borderRadius: 12, padding: "15px 16px 14px",
      opacity: dimmed ? 0.72 : 1, display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* identity */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RoleBadge role={agent.role} />
            <span className="font-mono" style={{ fontSize: 19, fontWeight: 700, color: r.color, letterSpacing: "0.01em", lineHeight: 1 }}>{agent.title}</span>
            {agent.status === "terminated" && <span className="font-mono" style={{ fontSize: 10, color: "#5f7269", border: "1px solid #2a3a32", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.1em" }}>{t("roster.former")}</span>}
          </div>
          <div className="font-mono" style={{ fontSize: 12, color: "#9fb3a9", marginTop: 5 }}>{agent.char_title || r.title}</div>
        </div>
        {agent.status !== "terminated" ? (
          <Kebab items={[
            { label: t("common.editAgent"), onClick: () => onEdit(agent) },
            { label: agent.status === "paused" ? t("common.resume") : t("common.pause"), onClick: () => onToggle(agent) },
            { label: t("common.fire"), danger: true, onClick: () => onFire(agent) },
          ]} />
        ) : (
          <Kebab items={[{ label: t("common.rehire"), onClick: () => onEdit(agent) }]} />
        )}
      </div>

      {/* brain: provider · model (DATA — English) */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span className="font-mono" style={{
          display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#cfe0d7",
          background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 6, padding: "4px 9px", maxWidth: "100%",
        }}>
          <ProviderMark provider={agent.provider} />
          <span style={{ color: "#7a8a82" }}>{agent.provider}</span>
          <span style={{ color: "#3a4a42" }}>·</span>
          <span style={{ color: "#e6f1ec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.model}</span>
        </span>
      </div>

      {/* current state — a verb */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <AgentVerb activity={activity} color={r.color} />
        {activity.ticket && (
          <button onClick={() => onOpenTicket(activity.ticket!.id)} className="font-mono" style={{
            fontSize: 11, color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", borderRadius: 5, padding: "2px 8px", cursor: "pointer",
          }}>{t("common.open")} →</button>
        )}
      </div>

      {/* wallet */}
      <BudgetGauge spent={agent.cost_spent_period} limit={agent.budget_usd_limit} period={agent.budget_period} pausedForBudget={pausedForBudget} />

      {/* chain of command */}
      <div className="font-mono" style={{ fontSize: 11.5, color: "#5f7269" }}>
        {boss
          ? <span>{t("roster.reportsTo")} <span style={{ color: roleMeta(boss.role).color }}>{boss.title}</span> <span style={{ color: "#5f7269" }}>({roleMeta(boss.role).label})</span></span>
          : <span style={{ color: r.color }}>◆ {t("roster.topOfChain")}</span>}
      </div>

      {/* track record */}
      <div style={{ borderTop: "1px solid #121b18", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="font-mono" style={{ fontSize: 9.5, color: "#5f7269", letterSpacing: "0.12em", textTransform: "uppercase" }}>{t("roster.recent")}</div>
        {recent.length === 0 ? (
          <div className="font-mono" style={{ fontSize: 11.5, color: "#3a4a42" }}>{t("roster.noRuns")}</div>
        ) : recent.map((x) => {
          const c = x.decision ? verdictColor(x.decision) : statusMeta(x.status).color;
          return (
            <button key={x.run.id} onClick={() => x.ticket && onOpenTicket(x.ticket.id)} className="font-mono mos-row" style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#9fb3a9",
              background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: "1px 0", width: "100%",
            }}>
              <span style={{ color: c, flexShrink: 0 }}>{x.decision ? "→ " + x.decision : x.status}</span>
              <span style={{ color: "#7a8a82", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(x.title, 30)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
