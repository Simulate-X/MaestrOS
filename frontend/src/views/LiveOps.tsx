import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { useActivitySeed, useAgents, USE_MOCK } from "../lib/queries";
import { mock, idx } from "../lib/mock";
import { statusMeta, roleMeta } from "../lib/colors";
import { clock, tokens } from "../lib/helpers";
import type { ActivityEvent, CompanyId } from "../lib/types";
import StatusBadge from "../components/StatusBadge";
import { FilterChip } from "../components/atoms";

function useLiveFeed() {
  const { data: seed } = useActivitySeed();
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const seq = useRef(99000);
  const seeded = useRef(false);

  useEffect(() => {
    if (seed && !seeded.current) { setFeed(seed); seeded.current = true; }
  }, [seed]);

  useEffect(() => {
    // In live mode, the seed (from useActivitySeed → real runs) provides the feed.
    // Synthetic event generation only runs in mock/standalone mode to animate the UI.
    if (!USE_MOCK) return;
    const id = setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      const tpls = mock.getLiveTemplates();
      const tpl = tpls[Math.floor(Math.random() * tpls.length)];
      const ev: ActivityEvent = { ...tpl, id: ++seq.current, ts: Date.now() };
      setFeed((f) => [ev, ...f].slice(0, 200));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return { feed, paused, setPaused };
}

function EventRow({ ev, onOpen }: { ev: ActivityEvent; onOpen: (id: number) => void }) {
  const { t } = useTranslation();
  const tk = idx.ticket(ev.ticket_id);
  const agent = idx.agent(ev.agent_id);
  const role = roleMeta(agent ? agent.role : null);
  const m = statusMeta(ev.status);
  const isAttention = ev.status === "blocked" || ev.status === "needs_approval" || ev.status === "error";
  const verb = ["claimed", "done", "blocked", "error", "needs_approval"].includes(ev.action)
    ? t(`live.verb.${ev.action}`) : "";
  const obj = ev.note ? null : tk ? tk.title : "ticket #" + ev.ticket_id;
  return (
    <div onClick={() => tk && onOpen(tk.id)} className="mos-row" style={{
      display: "grid", gridTemplateColumns: "78px 1fr 132px 60px", alignItems: "center", gap: 14,
      padding: "9px 14px", borderBottom: "1px solid #121b18", cursor: "pointer", fontSize: 13,
      background: isAttention ? m.dim : "transparent",
      borderLeft: "2px solid " + (isAttention ? m.color : "transparent"),
    }}>
      <span className="font-mono" style={{ color: "#5f7269", fontSize: 11.5 }}>{clock(new Date(ev.ts).toISOString())}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#9fb3a9" }}>
        <span className="font-mono" style={{ color: role.color, fontWeight: 700 }}>{agent ? agent.title : "—"}</span>
        <span className="font-mono" style={{ color: role.color, opacity: 0.55, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", margin: "0 7px 0 6px" }}>{role.label}</span>
        {verb && <span style={{ color: "#7a8a82" }}>{verb} </span>}
        {ev.note
          ? <code className="font-mono" style={{ color: "#9fe6c4", background: "#11161a", border: "1px solid #1a3a2a", borderRadius: 4, padding: "1px 5px", fontSize: 11.5 }}>{ev.note}</code>
          : <span style={{ color: "#cfe0d7" }}>{obj}</span>}
        <span className="font-mono" style={{ color: "#3a4a42", fontSize: 11, marginLeft: 8 }}>#{ev.ticket_id}</span>
      </span>
      <span style={{ justifySelf: "start" }}><StatusBadge status={ev.status} /></span>
      <span className="font-mono" style={{ color: ev.cost_tokens ? "#9fb3a9" : "#3a4a42", textAlign: "right", fontSize: 11.5 }}>
        {ev.cost_tokens ? tokens(ev.cost_tokens) + " tok" : "—"}
      </span>
    </div>
  );
}

export default function LiveOps({ companyId, onOpenTicket }: { companyId: CompanyId; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  const now = useNow();
  const { feed, paused, setPaused } = useLiveFeed();
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState("all");

  // Live mode: use the real agents query (also syncs store for idx lookups below).
  // Mock mode: read from store directly (matches original mock-only behaviour).
  const { data: liveAgents = [] } = useAgents(companyId);
  const agentsInScope = useMemo(
    () => liveAgents.filter((a) => companyId === "all" || a.company_id === companyId),
    [liveAgents, companyId],
  );

  const filtered = useMemo(() => {
    const cutoff = windowFilter === "5m" ? now - 5 * 60000 : windowFilter === "1h" ? now - 60 * 60000 : 0;
    return feed.filter((ev) => {
      const tk = idx.ticket(ev.ticket_id);
      if (companyId !== "all" && (!tk || tk.company_id !== companyId)) return false;
      if (statusFilter !== "all" && ev.status !== statusFilter) return false;
      if (agentFilter !== "all" && ev.agent_id !== Number(agentFilter)) return false;
      if (cutoff && ev.ts < cutoff) return false;
      return true;
    });
  }, [feed, companyId, statusFilter, agentFilter, windowFilter, now]);

  const statuses = ["all", "running", "needs_approval", "blocked", "error", "done", "queued"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="mos-pulse" style={{ width: 9, height: 9, borderRadius: 99, background: paused ? "#7a8a82" : "#00ff88", boxShadow: paused ? "none" : "0 0 10px #00ff88" }} />
          <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{t("live.title")}</span>
          <span className="font-mono" style={{ color: "#7a8a82", fontSize: 11 }}>
            {paused ? t("live.paused") : t("live.polling")} · {t("live.events", { n: filtered.length })}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {statuses.map((s) => (
            <FilterChip key={s} label={s === "all" ? t("common.all") : statusMeta(s).label}
              active={statusFilter === s} color={s === "all" ? "#00ff88" : statusMeta(s).color}
              onClick={() => setStatusFilter(s)} />
          ))}
        </div>

        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="font-mono mos-select" style={{
          background: "#11161a", color: "#cfe0d7", border: "1px solid #1a3a2a", borderRadius: 5, padding: "5px 8px", fontSize: 11.5,
        }}>
          <option value="all">{t("common.allAgents")}</option>
          {agentsInScope.map((a) => <option key={a.id} value={a.id}>{a.role}·{a.title}</option>)}
        </select>

        <div style={{ display: "flex", gap: 5 }}>
          {["all", "1h", "5m"].map((w) => (
            <FilterChip key={w} label={w === "all" ? t("common.allTime") : w === "1h" ? t("common.last1h") : t("common.last5m")} active={windowFilter === w} color="#00ddff" onClick={() => setWindowFilter(w)} />
          ))}
        </div>

        <button onClick={() => setPaused((p) => !p)} className="font-mono" style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700,
          color: paused ? "#0a0d0c" : "#ffaa00", background: paused ? "#00ff88" : "transparent",
          border: "1px solid " + (paused ? "#00ff88" : "#ffaa0066"),
        }}>{paused ? "▶ " + t("live.resumeBtn") : "⏸ " + t("live.pauseBtn")}</button>
      </div>

      <div className="font-mono" style={{
        display: "grid", gridTemplateColumns: "78px 1fr 132px 60px", gap: 14, padding: "6px 14px",
        borderBottom: "1px solid #1a3a2a", color: "#5f7269", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "#0c1110",
      }}>
        <span>{t("live.colTime")}</span><span>{t("live.colActivity")}</span><span>{t("live.colStatus")}</span><span style={{ textAlign: "right" }}>{t("live.colCost")}</span>
      </div>

      <div className="mos-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div className="font-mono" style={{ padding: 40, textAlign: "center", color: "#5f7269", fontSize: 13 }}>{t("live.empty")}</div>
        ) : filtered.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={onOpenTicket} />)}
      </div>
    </div>
  );
}

