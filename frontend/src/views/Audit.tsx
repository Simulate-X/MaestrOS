import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudit } from "../lib/queries";
import type { CompanyId } from "../lib/types";
import AuditRow, { actionMeta } from "../components/AuditRow";

export default function Audit({ companyId, onOpenTicket }: { companyId: CompanyId; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  const [actor, setActor] = useState("all");
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const { data: all = [] } = useAudit(companyId);

  const actionTypes = useMemo(() => ["all", ...Array.from(new Set(all.map((e) => e.action)))], [all]);

  const rows = useMemo(() => all.filter((e) => {
    if (actor !== "all" && e.actor_kind !== actor) return false;
    if (action !== "all" && e.action !== action) return false;
    if (q.trim()) {
      const hay = (e.actor_label + " " + e.action + " " + e.target_label + " " + (e.detail || "")).toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [all, actor, action, q]);

  const selStyle: React.CSSProperties = { background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 7, color: "#cfe0d7", padding: "6px 9px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
        <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{t("audit.title")}</span>
        <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#5f7269", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", border: "1px solid #1a3a2a", borderRadius: 5, padding: "2px 7px" }}>
          <span style={{ color: "#7a8a82" }}>⛓</span> {t("audit.immutable")}
        </span>
        <div style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="font-mono" style={{ ...selStyle, width: 180 }} />
        <select value={actor} onChange={(e) => setActor(e.target.value)} className="mos-select" style={selStyle}>
          <option value="all">{t("common.allActors")}</option>
          <option value="agent">{t("audit.actorAgent")}</option>
          <option value="operator">{t("audit.actorOperator")}</option>
          <option value="system">{t("audit.actorSystem")}</option>
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="mos-select" style={selStyle}>
          {actionTypes.map((a) => <option key={a} value={a}>{a === "all" ? t("common.allActions") : actionMeta(a).label}</option>)}
        </select>
      </div>

      <div className="font-mono" style={{
        display: "grid", gridTemplateColumns: "118px 150px 150px 1fr", gap: 14, padding: "6px 14px",
        borderBottom: "1px solid #1a3a2a", color: "#5f7269", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "#0c1110",
      }}>
        <span>{t("audit.colTime")}</span><span>{t("audit.colActor")}</span><span>{t("audit.colAction")}</span><span>{t("audit.colTarget")}</span>
      </div>

      <div className="mos-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {rows.length === 0 ? (
          <div className="font-mono" style={{ padding: 40, textAlign: "center", color: "#5f7269", fontSize: 13 }}>{t("audit.empty")}</div>
        ) : rows.map((ev) => <AuditRow key={ev.id} ev={ev as never} onOpenTicket={onOpenTicket} />)}
      </div>
    </div>
  );
}
