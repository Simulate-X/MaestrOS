import { clock } from "../lib/helpers";
import { roleMeta } from "../lib/colors";
import { idx } from "../lib/mock";
import type { AuditEvent } from "../lib/types";
import RoleBadge from "./RoleBadge";

/* Action labels are backend governance identifiers — kept English everywhere.
   Only the surrounding column chrome (handled in the Audit view) is localized. */
const ACTION_META: Record<string, { glyph: string; color: string; label: string }> = {
  approved: { glyph: "✓", color: "#00ff88", label: "approved" },
  rejected: { glyph: "✕", color: "#ff4466", label: "rejected" },
  requested_rework: { glyph: "↻", color: "#ffaa00", label: "requested rework" },
  awaiting_approval: { glyph: "◆", color: "#ffaa00", label: "awaiting approval" },
  shipped: { glyph: "▲", color: "#00ff88", label: "shipped" },
  planned: { glyph: "✎", color: "#a78bfa", label: "planned" },
  claimed: { glyph: "▸", color: "#00ddff", label: "claimed" },
  blocked: { glyph: "✕", color: "#ff4466", label: "blocked" },
  error: { glyph: "!", color: "#ff4466", label: "error" },
  paused_budget: { glyph: "⏸", color: "#ffaa00", label: "paused (budget)" },
  budget_exceeded: { glyph: "$", color: "#ff4466", label: "budget exceeded" },
  resumed: { glyph: "▶", color: "#00ff88", label: "resumed" },
  hired: { glyph: "+", color: "#00ff88", label: "hired" },
  edited: { glyph: "✎", color: "#00ddff", label: "edited" },
  terminated: { glyph: "×", color: "#7a8a82", label: "terminated" },
};
export const actionMeta = (a: string) => ACTION_META[a] || { glyph: "·", color: "#7a8a82", label: a };

function ActorChip({ ev }: { ev: AuditEvent }) {
  if (ev.actor_kind === "operator") {
    return (
      <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, border: "1px solid #00ddff88", display: "grid", placeItems: "center", color: "#9fe6ff", fontSize: 10 }}>☻</span>
        <span style={{ color: "#bfe9ff", fontWeight: 700 }}>operator</span>
      </span>
    );
  }
  if (ev.actor_kind === "system") {
    return (
      <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        <span style={{ color: "#5f7269", fontSize: 11 }}>⚙</span>
        <span style={{ color: "#9fb3a9", fontWeight: 600 }}>{ev.actor_label}</span>
      </span>
    );
  }
  const agent = ev.actor_id ? idx.agent(ev.actor_id) : null;
  const role = roleMeta(agent ? agent.role : null);
  return (
    <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
      <RoleBadge role={agent ? agent.role : null} />
      <span style={{ color: role.color, fontWeight: 700 }}>{ev.actor_label}</span>
    </span>
  );
}

export default function AuditRow({ ev, onOpenTicket }: { ev: AuditEvent & { ts: number }; onOpenTicket: (id: number) => void }) {
  const m = actionMeta(ev.action);
  const clickable = ev.target_kind === "ticket";
  return (
    <div className="mos-row" style={{
      display: "grid", gridTemplateColumns: "118px 150px 150px 1fr", alignItems: "center", gap: 14,
      padding: "8px 14px", borderBottom: "1px solid #121b18", fontSize: 12.5,
    }}>
      <span className="font-mono" style={{ color: "#5f7269", fontSize: 11.5 }}>{clock(new Date(ev.ts).toISOString())}</span>
      <ActorChip ev={ev} />
      <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: m.color, fontWeight: 600 }}>
        <span style={{ width: 16, textAlign: "center" }}>{m.glyph}</span>{m.label}
      </span>
      <span className="font-mono" style={{ color: "#9fb3a9", overflow: "hidden" }}>
        <button onClick={() => clickable && onOpenTicket(ev.target_id)} disabled={!clickable} style={{
          background: "transparent", border: "none", padding: 0, cursor: clickable ? "pointer" : "default",
          color: clickable ? "#cfe0d7" : "#9fb3a9", fontWeight: 600, fontFamily: "inherit", fontSize: "inherit",
        }}>
          <span style={{ color: "#5f7269", fontWeight: 400 }}>{ev.target_kind} </span>{ev.target_label}
        </button>
        {ev.detail && <span style={{ color: "#7a8a82", display: "block", marginTop: 2 }}>{ev.detail}</span>}
      </span>
    </div>
  );
}
