import { roleMeta } from "../lib/colors";

/* Role identity chip. Role identifier (CEO/ENG/QA/PLAN) is kept English — backend value. */
export default function RoleBadge({ role, size = "sm" }: { role: string | null | undefined; size?: "sm" | "lg" }) {
  const r = roleMeta(role);
  const big = size === "lg";
  return (
    <span className="font-mono" style={{
      display: "inline-flex", alignItems: "center", padding: big ? "3px 9px" : "1px 6px",
      fontSize: big ? 11 : 9.5, fontWeight: 700, letterSpacing: "0.12em", borderRadius: 4,
      color: r.color, background: r.dim, border: "1px solid " + r.border, lineHeight: 1.3,
    }}>{r.label}</span>
  );
}
