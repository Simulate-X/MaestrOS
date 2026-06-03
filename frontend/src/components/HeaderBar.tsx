import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useNow } from "../ui/Now";
import { useTickets, useAgents, useCompanies } from "../lib/queries";
import { agentActivity } from "../lib/helpers";
import { store } from "../lib/mock";
import type { CompanyId, RosterState } from "../App";
import { Count } from "./atoms";
import LocaleSwitcher from "./LocaleSwitcher";

export type View = "live" | "inbox" | "roster" | "canvas" | "tickets" | "audit";

export default function HeaderBar({ companyId, setCompanyId, setView, setRosterState }: {
  companyId: CompanyId;
  setCompanyId: (c: CompanyId) => void;
  setView: (v: View) => void;
  openTicket: (id: number) => void;
  setRosterState: (s: RosterState) => void;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const { data: companies = [] } = useCompanies();
  const { data: tickets = [] } = useTickets(companyId);
  const { data: agents = [] } = useAgents(companyId);

  const c = (s: string) => tickets.filter((tk) => tk.status === s).length;
  const doneToday = tickets.filter((tk) => tk.status === "done").length;
  const activeWorkflows = new Set(tickets.filter((tk) => ["running", "needs_approval", "blocked", "queued"].includes(tk.status)).map((tk) => tk.workflow_id)).size;
  const pendingCount = c("needs_approval");

  const agActive = agents.filter((a) => a.status === "active").length;
  const agPaused = agents.filter((a) => a.status === "paused").length;
  const agBlocked = agents.filter((a) => a.status === "active" && agentActivity(a.id).status === "blocked").length;
  const goRoster = (st: RosterState) => { setRosterState(st); setView("roster"); };

  const lastTick = store.runs.reduce((mx, r) => (r.ended_at && new Date(r.ended_at).getTime() > mx ? new Date(r.ended_at).getTime() : mx), 0);
  const sinceSec = Math.floor((now - lastTick) / 1000);
  const healthy = sinceSec < 30;
  const healthColor = healthy ? "#00ff88" : sinceSec < 120 ? "#ffaa00" : "#ff4466";

  const company = companyId === "all" ? null : companies.find((co) => co.id === companyId);
  const view = (loc.pathname.split("/")[1] || "live") as View;

  const navBtn = (id: View, label: string, badge?: number) => (
    <button onClick={() => setView(id)} className="font-mono" style={{
      position: "relative", padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
      color: view === id ? "#0a0d0c" : "#9fb3a9",
      background: view === id ? "#00ff88" : "transparent",
      border: "1px solid " + (view === id ? "#00ff88" : "transparent"),
      fontWeight: view === id ? 700 : 500, letterSpacing: "0.02em",
      display: "inline-flex", alignItems: "center", gap: 7,
    }}>
      {label}
      {badge ? (
        <span style={{
          minWidth: 17, height: 17, padding: "0 5px", borderRadius: 99, fontSize: 10.5, fontWeight: 700,
          display: "grid", placeItems: "center",
          color: view === id ? "#0a0d0c" : "#ffaa00",
          background: view === id ? "rgba(10,13,12,0.18)" : "rgba(255,170,0,0.15)",
          border: view === id ? "none" : "1px solid #ffaa0055",
        }}>{badge}</span>
      ) : null}
    </button>
  );

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 18, padding: "0 18px", height: 58,
      borderBottom: "1px solid #1a3a2a", background: "#0c1110", flexShrink: 0, position: "relative", zIndex: 30,
    }}>
      {/* logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="font-mono" style={{
          width: 30, height: 30, borderRadius: 7, border: "1.5px solid #00ff88", color: "#00ff88",
          display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16, boxShadow: "0 0 16px -6px #00ff88",
        }}>M</div>
        <div style={{ lineHeight: 1 }}>
          <div className="font-mono" style={{ color: "#e6f1ec", fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>MaestrOS</div>
          <div className="font-mono" style={{ color: "#7a8a82", fontSize: 9.5, letterSpacing: "0.16em" }}>{t("brand.subtitle")}</div>
        </div>
      </div>

      {/* company selector */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} className="font-mono" style={{
          display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 7,
          background: "#11161a", border: "1px solid #1a3a2a", color: "#e6f1ec", fontSize: 13, cursor: "pointer", minWidth: 184,
        }}>
          <span style={{ color: "#00ddff" }}>▣</span>
          <span style={{ flex: 1, textAlign: "left" }}>{company ? company.name : t("common.allCompanies")}</span>
          <span style={{ color: "#7a8a82", fontSize: 10 }}>▾</span>
        </button>
        {open && (
          <div style={{
            position: "absolute", top: 44, left: 0, minWidth: 200, background: "#11161a",
            border: "1px solid #1a3a2a", borderRadius: 8, padding: 5, zIndex: 40, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.8)",
          }}>
            {[{ id: "all" as CompanyId, name: t("common.allCompanies") }, ...companies].map((co) => (
              <button key={co.id} onClick={() => { setCompanyId(co.id as CompanyId); setOpen(false); }} className="font-mono" style={{
                display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 13,
                cursor: "pointer", background: companyId === co.id ? "rgba(0,255,136,0.1)" : "transparent",
                color: companyId === co.id ? "#00ff88" : "#c5d6cd", border: "none",
              }}>{co.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* nav */}
      <nav style={{ display: "flex", gap: 4 }}>
        {navBtn("live", t("nav.liveOps"))}
        {navBtn("inbox", t("nav.inbox"), pendingCount)}
        {navBtn("roster", t("nav.roster"))}
        {navBtn("canvas", t("nav.canvas"))}
        {navBtn("tickets", t("nav.tickets"))}
        {navBtn("audit", t("nav.audit"))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* counts (category labels are chrome → localized; the status BADGE stays English) */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Count value={activeWorkflows} label={t("counters.workflows")} color="#00ddff" />
        <div style={{ width: 1, height: 26, background: "#1a3a2a", margin: "0 6px" }} />
        <Count value={c("running")} label={t("counters.running")} color="#00ff88" />
        <Count value={c("queued")} label={t("counters.queued")} color="#00ddff" />
        <Count value={c("needs_approval")} label={t("counters.approval")} color="#ffaa00" />
        <Count value={c("blocked") + c("error")} label={t("counters.blocked")} color="#ff4466" />
        <Count value={doneToday} label={t("counters.done")} color="#2a8862" />
      </div>

      <div style={{ width: 1, height: 26, background: "#1a3a2a", margin: "0 4px" }} />

      {/* agents online — label is chrome; active/paused/blocked stay English (status words) */}
      <button onClick={() => goRoster("all")} className="font-mono" style={{
        display: "flex", alignItems: "center", gap: 9, padding: "6px 11px", borderRadius: 7,
        background: view === "roster" ? "rgba(0,255,136,0.06)" : "#11161a", border: "1px solid #1a3a2a", cursor: "pointer",
      }}>
        <span style={{ fontSize: 9.5, color: "#5f7269", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("counters.agents")}</span>
        <span onClick={(e) => { e.stopPropagation(); goRoster("active"); }} style={{ color: "#00ff88", fontWeight: 700 }}>{agActive}<span style={{ color: "#5f7269", fontWeight: 400 }}> active</span></span>
        {agPaused > 0 && <span onClick={(e) => { e.stopPropagation(); goRoster("paused"); }} style={{ color: "#ffaa00", fontWeight: 700 }}>{agPaused}<span style={{ color: "#5f7269", fontWeight: 400 }}> paused</span></span>}
        {agBlocked > 0 && <span onClick={(e) => { e.stopPropagation(); goRoster("blocked"); }} style={{ color: "#ff4466", fontWeight: 700 }}>{agBlocked}<span style={{ color: "#5f7269", fontWeight: 400 }}> blocked</span></span>}
      </button>

      <div style={{ width: 1, height: 26, background: "#1a3a2a", margin: "0 4px" }} />

      {/* health pulse */}
      <div className="font-mono" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 7,
        background: "#11161a", border: "1px solid " + healthColor + "44",
      }}>
        <span className="mos-pulse" style={{ width: 8, height: 8, borderRadius: 99, background: healthColor, boxShadow: "0 0 10px " + healthColor }} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 11, color: healthColor, fontWeight: 700 }}>{healthy ? t("health.live") : t("health.stale")}</div>
          <div style={{ fontSize: 9.5, color: "#7a8a82" }}>{t("health.tick", { n: sinceSec })}</div>
        </div>
      </div>

      <LocaleSwitcher />
    </header>
  );
}
