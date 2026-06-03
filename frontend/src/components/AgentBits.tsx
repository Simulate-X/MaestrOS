import { useTranslation } from "react-i18next";
import type { Activity } from "../lib/helpers";

/* cloud glyph for cloud providers, chip glyph for local. Provider name is DATA (English). */
export function ProviderMark({ provider }: { provider: string }) {
  const local = provider === "ollama";
  return (
    <span title={local ? "local model" : "cloud provider"} style={{ color: local ? "#9fb3a9" : "#00ddff", fontSize: 11 }}>
      {local ? "▢" : "☁"}
    </span>
  );
}

/* State as a VERB. Role-action verbs are chrome (localized); status words
   (blocked/paused/terminated) fall through to English to match badges. */
export function AgentVerb({ activity, color }: { activity: Activity; color?: string }) {
  const { t } = useTranslation();
  const running = activity.status === "running" || activity.status === "needs_approval";
  const c =
    activity.status === "blocked" ? "#ff4466"
    : activity.status === "paused" ? "#7a8a82"
    : activity.status === "terminated" ? "#5f7269"
    : activity.status === "idle" ? "#7a8a82"
    : color || "#00ff88";
  // localize only role-action verbs + idle; keep status-word verbs English
  const label = t(`roster.verb.${activity.verb}`, { defaultValue: activity.verb });
  return (
    <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: c, fontWeight: 600 }}>
      {running && <span className="mos-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: c, boxShadow: "0 0 8px " + c }} />}
      {label}
      {activity.ticket && <span style={{ color: "#5f7269", fontWeight: 400 }}>· #{activity.ticket.id}</span>}
    </span>
  );
}
