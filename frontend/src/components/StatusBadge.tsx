import { statusMeta } from "../lib/colors";

/* Status enum value — ALWAYS English (backend identifier), never localized. */
export default function StatusBadge({ status, size = "sm", pulse }: { status: string; size?: "sm" | "lg"; pulse?: boolean }) {
  const m = statusMeta(status);
  const isRunning = status === "running";
  const isBlocked = status === "blocked";
  const pad = size === "lg" ? "4px 12px" : "2px 8px";
  const fs = size === "lg" ? "13px" : "11px";
  const stripe = isBlocked
    ? "repeating-linear-gradient(45deg, rgba(255,68,102,0.22) 0 7px, rgba(255,68,102,0.06) 7px 14px)"
    : m.dim;
  return (
    <span className="font-mono" style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: pad, fontSize: fs,
      letterSpacing: "0.04em", lineHeight: 1.2, borderRadius: 5, whiteSpace: "nowrap",
      color: m.color, background: stripe, border: "1px solid " + m.border, textTransform: "lowercase",
    }}>
      {(isRunning || pulse) && (
        <span className="mos-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: m.color, boxShadow: "0 0 8px " + m.color }} />
      )}
      {m.label}
    </span>
  );
}
