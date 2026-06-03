import type { Config } from "tailwindcss";

// The neon-green terminal identity, as Tailwind tokens.
// Inline styles in the prototype are preserved; these tokens make the same palette
// available as utilities (bg-mos-bg, text-status-running, border-mos-line, …).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mos: {
          bg: "#0a0d0c",
          bg2: "#0c1110",
          panel: "#0e1413",
          panel2: "#11161a",
          ink: "#080b0a",
          line: "#1a3a2a",
          lineDim: "#121b18",
          lineFaint: "#2a3a32",
          text: "#e6f1ec",
          text2: "#cfe0d7",
          muted: "#9fb3a9",
          dim: "#7a8a82",
          faint: "#5f7269",
          faintest: "#3a4a42",
        },
        status: {
          queued: "#00ddff",
          running: "#00ff88",
          done: "#2a8862",
          error: "#ff4466",
          approval: "#ffaa00",
          blocked: "#ff4466",
        },
        role: {
          ceo: "#00ddff",
          eng: "#00ff88",
          qa: "#ffaa00",
          planner: "#a78bfa",
        },
        verdict: {
          approve: "#00ff88",
          ship: "#00ff88",
          rework: "#ffaa00",
          escalate: "#00ddff",
          hold: "#ff4466",
          reject: "#ff4466",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
