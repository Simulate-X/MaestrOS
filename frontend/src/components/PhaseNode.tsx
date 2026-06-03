import { useTranslation } from "react-i18next";
import { idx } from "../lib/mock";
import type { Phase, Ticket } from "../lib/types";

const NODE_W = 196, NODE_H = 104;

/* A workflow phase node. skill name + verdict words stay English (data);
   the "skill / human / auto / idle" framing is chrome. "active" stays English (status word). */
export default function PhaseNode({ phase, x, y, active, onClick, selected, embedded }: {
  phase: Phase; x: number; y: number; active: Ticket[]; onClick: () => void; selected: boolean; embedded?: boolean;
}) {
  const { t } = useTranslation();
  const skill = idx.skill(phase.skill_id);
  const isHuman = phase.gate === "human_approval";
  const pressure = active.reduce((mx, tk) => Math.max(mx, (tk.phase_visit_count && tk.phase_visit_count[phase.name]) || 0), 0);
  const blockedHere = active.some((tk) => tk.status === "blocked");
  const needsApprovalHere = active.some((tk) => tk.status === "needs_approval");
  const glowColor = blockedHere ? "#ff4466" : needsApprovalHere ? "#ffaa00" : active.length ? "#00ff88" : null;

  const posStyle: React.CSSProperties = embedded
    ? { position: "relative", width: "100%" }
    : { position: "absolute", left: x, top: y };

  return (
    <div onClick={onClick} style={{
      ...posStyle, width: embedded ? "100%" : NODE_W, minHeight: NODE_H, cursor: "pointer",
      background: "#11161a", borderRadius: 12,
      border: "1.5px solid " + (selected ? "#00ddff" : glowColor || "#1a3a2a"),
      boxShadow: glowColor ? "0 0 0 1px " + glowColor + "55, 0 0 24px -2px " + glowColor + "aa" : "none",
      padding: "12px 13px", transition: "box-shadow .3s, border-color .2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {glowColor && <span className="mos-pulse" style={{ width: 8, height: 8, borderRadius: 99, background: glowColor, boxShadow: "0 0 8px " + glowColor }} />}
          <span style={{ color: "#e6f1ec", fontWeight: 700, fontSize: 15, letterSpacing: "0.01em" }}>{phase.name}</span>
        </div>
        <span className="font-mono" style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em",
          color: isHuman ? "#ffaa00" : "#5f7269", border: "1px solid " + (isHuman ? "#ffaa0055" : "#1a3a2a"),
          background: isHuman ? "rgba(255,170,0,0.08)" : "transparent",
        }}>{isHuman ? "⚷ " + t("canvas.human") : t("canvas.auto")}</span>
      </div>

      <div className="font-mono" style={{ marginTop: 8, fontSize: 11, color: "#7a8a82" }}>
        <span style={{ color: "#5f7269" }}>{t("canvas.skill")} </span>
        <span style={{ color: "#00ddff" }}>{skill ? skill.name : "?"}</span>
        <span style={{ color: "#3a4a42" }}> {skill ? skill.version : ""}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
        {active.length > 0 && (
          <span className="font-mono" style={{
            fontSize: 10.5, padding: "2px 8px", borderRadius: 99, fontWeight: 700,
            color: glowColor || "#00ff88", background: (glowColor || "#00ff88") + "1f", border: "1px solid " + (glowColor || "#00ff88") + "55",
          }}>{active.length} {t("canvas.active")}</span>
        )}
        {phase.max_reworks != null && (
          <span className="font-mono" style={{
            fontSize: 10.5, padding: "2px 8px", borderRadius: 99,
            color: pressure >= phase.max_reworks ? "#ff4466" : pressure > 0 ? "#ffaa00" : "#5f7269",
            border: "1px solid " + (pressure >= phase.max_reworks ? "#ff446655" : pressure > 0 ? "#ffaa0055" : "#1a3a2a"),
            background: pressure > 0 ? "rgba(255,170,0,0.06)" : "transparent",
          }}>↻ {pressure}/{phase.max_reworks}</span>
        )}
        {active.length === 0 && phase.max_reworks == null && (
          <span className="font-mono" style={{ fontSize: 10.5, color: "#3a4a42" }}>{t("canvas.idle")}</span>
        )}
      </div>
    </div>
  );
}

export { NODE_W, NODE_H };
