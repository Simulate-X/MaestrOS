import { verdictColor } from "../lib/colors";

/* Verdict decision — ALWAYS English (backend identifier). The label "VERDICT" is a
   fixed technical caption kept as-is across locales (it frames an English enum value). */
export default function VerdictBadge({ decision, size = "lg", note }: { decision: string | null | undefined; size?: "sm" | "lg"; note?: string | null }) {
  if (!decision) return null;
  const c = verdictColor(decision);
  const big = size === "lg";
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span className="font-mono" style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: big ? "8px 16px" : "3px 10px", fontSize: big ? "18px" : "12px", fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: 6, color: c,
        background: "rgba(255,255,255,0.02)", border: "1.5px solid " + c, boxShadow: "0 0 14px -4px " + c,
      }}>
        <span style={{ fontSize: big ? "11px" : "9px", opacity: 0.65, letterSpacing: "0.18em" }}>VERDICT</span>
        {decision}
      </span>
      {note && big && <span className="font-mono" style={{ fontSize: 11, color: "#7a8a82", paddingLeft: 2 }}>{note}</span>}
    </div>
  );
}
