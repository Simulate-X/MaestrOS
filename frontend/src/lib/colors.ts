/* MaestrOS — status / role / verdict color maps. Ported 1:1 from the prototype.
   These are visual identity, NOT chrome — never localized. */

export interface ColorMeta {
  key: string;
  label: string;
  color: string;
  dim: string;
  border: string;
}

export const STATUS: Record<string, ColorMeta> = {
  queued: { key: "queued", label: "queued", color: "#00ddff", dim: "rgba(0,221,255,0.12)", border: "rgba(0,221,255,0.45)" },
  running: { key: "running", label: "running", color: "#00ff88", dim: "rgba(0,255,136,0.12)", border: "rgba(0,255,136,0.5)" },
  done: { key: "done", label: "done", color: "#2a8862", dim: "rgba(42,136,98,0.14)", border: "rgba(42,136,98,0.5)" },
  error: { key: "error", label: "error", color: "#ff4466", dim: "rgba(255,68,102,0.12)", border: "rgba(255,68,102,0.5)" },
  needs_approval: { key: "needs_approval", label: "needs approval", color: "#ffaa00", dim: "rgba(255,170,0,0.12)", border: "rgba(255,170,0,0.5)" },
  blocked: { key: "blocked", label: "blocked", color: "#ff4466", dim: "rgba(255,68,102,0.14)", border: "rgba(255,68,102,0.6)" },
};

export const statusMeta = (s: string): ColorMeta =>
  STATUS[s] || { key: s, label: s, color: "#7a8a82", dim: "rgba(122,138,130,0.12)", border: "rgba(122,138,130,0.4)" };

export const VERDICT: Record<string, string> = {
  approve: "#00ff88",
  ship: "#00ff88",
  rework: "#ffaa00",
  escalate: "#00ddff",
  hold: "#ff4466",
  reject: "#ff4466",
};
export const verdictColor = (d: string | null | undefined): string => (d ? VERDICT[d] || "#7a8a82" : "#7a8a82");

// CEO cyan / Engineer green / QA amber / Planner purple.
export interface RoleMeta {
  key: string;
  label: string;
  title: string;
  color: string;
  dim: string;
  border: string;
}
export const ROLE: Record<string, RoleMeta> = {
  ceo: { key: "ceo", label: "CEO", title: "Chief Executive", color: "#00ddff", dim: "rgba(0,221,255,0.12)", border: "rgba(0,221,255,0.45)" },
  eng: { key: "eng", label: "ENG", title: "Senior Engineer", color: "#00ff88", dim: "rgba(0,255,136,0.12)", border: "rgba(0,255,136,0.45)" },
  qa: { key: "qa", label: "QA", title: "QA Reviewer", color: "#ffaa00", dim: "rgba(255,170,0,0.12)", border: "rgba(255,170,0,0.45)" },
  planner: { key: "planner", label: "PLAN", title: "Lead Planner", color: "#a78bfa", dim: "rgba(167,139,250,0.14)", border: "rgba(167,139,250,0.5)" },
};
export const roleMeta = (r: string | null | undefined): RoleMeta =>
  (r && ROLE[r]) || { key: r || "?", label: (r || "?").toUpperCase(), title: "Agent", color: "#7a8a82", dim: "rgba(122,138,130,0.12)", border: "rgba(122,138,130,0.4)" };
