import { useEffect, useState, ReactNode } from "react";

export function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="font-mono" style={{
      padding: "4px 10px", borderRadius: 5, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap",
      color: active ? (color || "#00ff88") : "#7a8a82",
      background: active ? "rgba(255,255,255,0.04)" : "transparent",
      border: "1px solid " + (active ? ((color || "#00ff88") + "66") : "#1a3a2a"),
    }}>{label}</button>
  );
}

export function Count({ value, label, color, onClick, active }: { value: number; label: string; color: string; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className="font-mono" style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
      padding: "5px 11px", borderRadius: 6, cursor: onClick ? "pointer" : "default",
      background: active ? "rgba(255,255,255,0.04)" : "transparent",
      border: "1px solid " + (active ? color + "66" : "transparent"),
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#7a8a82", textTransform: "uppercase" }}>{label}</span>
    </button>
  );
}

interface KebabItem { label: string; onClick: () => void; danger?: boolean; }
export function Kebab({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="font-mono" style={{
        width: 28, height: 28, borderRadius: 6, background: open ? "rgba(255,255,255,0.05)" : "transparent",
        border: "1px solid " + (open ? "#1a3a2a" : "transparent"), color: "#7a8a82", cursor: "pointer", fontSize: 16, lineHeight: 1,
      }}>⋯</button>
      {open && (
        <div style={{
          position: "absolute", top: 32, right: 0, minWidth: 150, background: "#11161a", border: "1px solid #1a3a2a",
          borderRadius: 8, padding: 5, zIndex: 50, boxShadow: "0 12px 32px -12px rgba(0,0,0,0.85)",
        }}>
          {items.map((it, i) => (
            <button key={i} onClick={() => { setOpen(false); it.onClick(); }} className="font-mono" style={{
              display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 12.5,
              cursor: "pointer", background: "transparent", color: it.danger ? "#ff6680" : "#c5d6cd", border: "none",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = it.danger ? "rgba(255,68,102,0.1)" : "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolbarTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
      <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{title}</span>
      {subtitle && <span className="font-mono" style={{ color: "#7a8a82", fontSize: 11.5 }}>{subtitle}</span>}
      {children}
    </div>
  );
}
