import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { useTicket, useApproveTicket, useRejectTicket } from "../lib/queries";
import { idx } from "../lib/mock";
import { statusMeta, roleMeta, verdictColor } from "../lib/colors";
import { extractVerdict, reworkIteration, verdictSpeech, decisionHistory, relTime, clock, tokens } from "../lib/helpers";
import type { Run } from "../lib/types";
import { store } from "../lib/mock";
import StatusBadge from "../components/StatusBadge";
import VerdictBadge from "../components/VerdictBadge";
import MarkdownView from "../components/MarkdownView";
import RoleBadge from "../components/RoleBadge";
import ParentChainBreadcrumb from "../components/ParentChainBreadcrumb";

function RunCard({ run, defaultOpen }: { run: Run; defaultOpen?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!defaultOpen);
  const v = extractVerdict(run.work_product);
  const agent = idx.agent(run.agent_id);
  const role = roleMeta(agent ? agent.role : null);
  const dur = run.ended_at ? Math.round((+new Date(run.ended_at) - +new Date(run.started_at)) / 1000) : null;
  const shortModel = agent ? agent.model.split("/").pop() : "";

  return (
    <div style={{ border: "1px solid " + ((run.status as string) === "running" ? "#00ff8855" : "#1a3a2a"), borderRadius: 10, overflow: "hidden", background: "#0e1413" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", cursor: "pointer" }}>
        <span className="font-mono" style={{ color: "#5f7269", fontSize: 11, width: 16 }}>{open ? "▾" : "▸"}</span>
        <RoleBadge role={agent ? agent.role : null} />
        <span className="font-mono" style={{ color: role.color, fontSize: 13, fontWeight: 700 }}>{agent ? agent.title : "?"}</span>
        <StatusBadge status={run.status} />
        {v.decision && <VerdictBadge decision={v.decision} size="sm" />}
        <div style={{ flex: 1 }} />
        <span className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>run #{run.id}</span>
        <span className="font-mono" style={{ color: "#7a8a82", fontSize: 11 }}>{tokens(run.cost_tokens)} tok{run.cost_usd ? " · $" + run.cost_usd.toFixed(4) : ""}</span>
        <span className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>{dur != null ? dur + "s" : t("tickets.running")}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #1a3a2a", padding: "14px" }}>
          {v.decision && (
            <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid #1a3a2a", borderRadius: 10, padding: "13px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="font-mono" style={{ fontSize: 14, color: "#cfe0d7" }}>
                  <span style={{ color: role.color, fontWeight: 700 }}>{agent ? agent.title : "Agent"}</span>
                  <span style={{ color: "#5f7269" }}> ({role.label} · {shortModel}) </span>
                  <span style={{ color: "#e6f1ec" }}>{t(`tickets.speech.${v.decision}`, { defaultValue: t("tickets.speech.default") })}</span>
                </span>
                <div style={{ flex: 1 }} />
                <VerdictBadge decision={v.decision} size="sm" />
              </div>
              {v.json && v.json.reasons && (
                <ul className="font-mono" style={{ margin: "10px 0 0", paddingLeft: 18, color: "#9fb3a9", fontSize: 12.5, lineHeight: 1.5 }}>
                  {v.json.reasons.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
                </ul>
              )}
              {v.json && v.json.note && (
                <div className="font-mono" style={{ marginTop: 8, fontSize: 12, color: "#7a8a82", fontStyle: "italic" }}>“{v.json.note}”</div>
              )}
            </div>
          )}
          {v.body ? <MarkdownView source={v.body} /> : <div className="font-mono" style={{ color: "#5f7269", fontSize: 12 }}>{t("tickets.noWorkProduct", { name: agent ? agent.title : "the agent" })}</div>}

          {run.logs && run.logs.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="font-mono" style={{ color: "#7a8a82", fontSize: 11.5, cursor: "pointer", letterSpacing: "0.06em" }}>{t("tickets.logs")} ({run.logs.length})</summary>
              <pre className="font-mono" style={{ marginTop: 8, background: "#080b0a", border: "1px solid #121b18", borderRadius: 7, padding: 12, fontSize: 11.5, color: "#9fb3a9", overflowX: "auto", whiteSpace: "pre-wrap" }}>
                {run.logs.map((l, i) => "[" + String(i).padStart(2, "0") + "] " + l).join("\n")}
              </pre>
            </details>
          )}
          <div className="font-mono" style={{ marginTop: 12, fontSize: 10.5, color: "#5f7269", display: "flex", gap: 16 }}>
            <span>{t("tickets.started")} {clock(run.started_at)}</span>
            <span>{t("tickets.ended")} {run.ended_at ? clock(run.ended_at) : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0e1413", border: "1px solid #1a3a2a", borderRadius: 10, padding: "11px 13px" }}>
      <div className="font-mono" style={{ color: "#5f7269", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 7 }}>{title}</div>
      <div className="font-mono" style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
    </div>
  );
}

function DecisionHistory({ ticketId, onOpenTicket }: { ticketId: number; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  const now = useNow();
  const rows = decisionHistory(ticketId);
  if (rows.length < 2) return null;
  return (
    <div>
      <div className="font-mono" style={{ color: "#5f7269", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", margin: "24px 0 10px" }}>
        {t("tickets.decisionHistory")} <span style={{ color: "#9fb3a9" }}>({rows.length})</span>
      </div>
      <div style={{ border: "1px solid #1a3a2a", borderRadius: 10, overflow: "hidden", background: "#0e1413" }}>
        {rows.map((r, i) => {
          const role = roleMeta(r.role);
          const isVerdict = !!r.decision;
          const accent = isVerdict ? verdictColor(r.decision) : "#2a3a32";
          return (
            <button key={r.run.id} onClick={() => onOpenTicket(r.ticket.id)} className="mos-row" style={{
              display: "grid", gridTemplateColumns: "150px 1fr 86px 96px", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              padding: "10px 14px", borderBottom: i < rows.length - 1 ? "1px solid #121b18" : "none",
              borderLeft: "2px solid " + accent, background: "transparent", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, overflow: "hidden" }}>
                <RoleBadge role={r.role} />
                <span style={{ color: role.color, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.agent ? r.agent.title : "?"}</span>
              </span>
              <span style={{ color: "#9fb3a9", overflow: "hidden" }}>
                {isVerdict
                  ? <span style={{ color: verdictColor(r.decision), fontWeight: 700 }}>{r.verb}</span>
                  : <span style={{ color: "#cfe0d7" }}>{r.verb}</span>}
                {r.reason && <span style={{ color: "#7a8a82" }}> — “{r.reason}”</span>}
              </span>
              <span style={{ color: r.tokens ? "#9fb3a9" : "#3a4a42", textAlign: "right" }}>{r.tokens ? tokens(r.tokens) + " tok" : "—"}</span>
              <span style={{ color: "#5f7269", textAlign: "right" }}>{relTime(r.ts, now)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TicketDetail({ ticketId, onOpenTicket, onBack, onOpenCanvas }: {
  ticketId: number; onOpenTicket: (id: number) => void; onBack: () => void; onOpenCanvas: () => void;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const { data: ticket } = useTicket(ticketId);
  const approve = useApproveTicket();
  const reject = useRejectTicket();
  const [decision, setDecision] = useState<null | "approved" | "rejected">(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!ticket) return <div className="font-mono" style={{ padding: 40, color: "#7a8a82" }}>Ticket #{ticketId} not found.</div>;

  const effectiveStatus = decision === "approved" ? "queued" : decision === "rejected" ? "error" : ticket.status;
  const phase = ticket.current_phase_id ? idx.phase(ticket.current_phase_id) : null;
  const company = idx.company(ticket.company_id);
  const assignee = idx.agent(ticket.assignee_agent_id);
  const runs = idx.runsByTicket(ticket.id);
  const iter = reworkIteration(ticket.body);

  return (
    <div className="mos-scroll" style={{ height: "100%", overflowY: "auto", minHeight: 0 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 28px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={onBack} className="font-mono" style={{ color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", borderRadius: 6, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>← {t("common.back")}</button>
          <ParentChainBreadcrumb ticketId={ticket.id} onNavigate={onOpenTicket} />
        </div>

        {effectiveStatus === "blocked" && ticket.blocked_reason && (
          <div className="mos-stripe" style={{ borderRadius: 10, border: "1.5px solid #ff4466", padding: "14px 16px", marginBottom: 16 }}>
            <div className="font-mono" style={{ color: "#ff6680", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚠</span> {t("tickets.blockedBanner")}
            </div>
            <div style={{ color: "#ffd0d8", fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{ticket.blocked_reason}</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="font-mono" style={{ color: "#5f7269", fontSize: 12 }}>
              {t("tickets.ticket")} #{ticket.id} · {company ? company.name : ""} {phase && <span>· {t("tickets.phase")} <span style={{ color: "#00ddff", cursor: "pointer" }} onClick={onOpenCanvas}>{phase.name}</span></span>}
            </div>
            <h1 style={{ color: "#e6f1ec", fontSize: 24, fontWeight: 700, margin: "6px 0 0", lineHeight: 1.2, letterSpacing: "-0.01em" }}>{ticket.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <StatusBadge status={effectiveStatus} size="lg" />
              {iter != null && (
                <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", borderRadius: 6, fontSize: 13, fontWeight: 700, color: "#ffaa00", background: "rgba(255,170,0,0.1)", border: "1px solid #ffaa0066" }}>
                  ↻ {t("tickets.reworkIteration", { n: iter })}
                </span>
              )}
              <span className="font-mono" style={{ color: "#7a8a82", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>{t("tickets.assignee")} {assignee ? <><RoleBadge role={assignee.role} /><span style={{ color: roleMeta(assignee.role).color, fontWeight: 700 }}>{assignee.title}</span></> : <span style={{ color: "#00ddff" }}>?</span>}</span>
              <span className="font-mono" style={{ color: "#7a8a82", fontSize: 12 }}>{t("tickets.created")} {relTime(ticket.created_at, now)}</span>
              {ticket.priority === 0 && <span className="font-mono" style={{ color: "#ff4466", fontSize: 12, fontWeight: 700 }}>P0</span>}
            </div>
          </div>

          {effectiveStatus === "needs_approval" && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setDecision("approved"); approve.mutate(ticket.id); }} className="font-mono" style={{ padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#0a0d0c", background: "#00ff88", border: "none", cursor: "pointer", boxShadow: "0 0 18px -6px #00ff88" }}>✓ {t("common.approve")}</button>
              <button onClick={() => setRejectOpen(true)} className="font-mono" style={{ padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#ff4466", background: "transparent", border: "1px solid #ff4466", cursor: "pointer" }}>✕ {t("common.reject")}</button>
            </div>
          )}
          {decision === "approved" && <div className="font-mono" style={{ color: "#00ff88", fontSize: 13, alignSelf: "center" }}>✓ {t("tickets.approvedRequeued")}</div>}
          {decision === "rejected" && <div className="font-mono" style={{ color: "#ff4466", fontSize: 13, alignSelf: "center" }}>✕ {t("tickets.rejected")}</div>}
        </div>

        {rejectOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 60 }} onClick={() => setRejectOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: "#11161a", border: "1px solid #1a3a2a", borderRadius: 12, padding: 20 }}>
              <div className="font-mono" style={{ color: "#e6f1ec", fontWeight: 700, fontSize: 15 }}>{t("tickets.rejectTitle", { id: ticket.id })}</div>
              <div className="font-mono" style={{ color: "#7a8a82", fontSize: 12, marginTop: 4 }}>{t("tickets.rejectBody")}</div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("tickets.rejectPlaceholder")} className="font-mono" style={{ width: "100%", height: 90, marginTop: 12, background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 8, color: "#e6f1ec", padding: 10, fontSize: 13, resize: "vertical" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button onClick={() => setRejectOpen(false)} className="font-mono" style={{ padding: "8px 16px", borderRadius: 7, color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", cursor: "pointer", fontSize: 13 }}>{t("common.cancel")}</button>
                <button onClick={() => { setDecision("rejected"); reject.mutate({ id: ticket.id, reason }); setRejectOpen(false); }} className="font-mono" style={{ padding: "8px 16px", borderRadius: 7, color: "#fff", background: "#ff4466", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{t("common.reject")}</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 22, marginTop: 22, alignItems: "start" }}>
          <div>
            <div className="font-mono" style={{ color: "#5f7269", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{t("tickets.body")}</div>
            <div style={{ background: "#0e1413", border: "1px solid #1a3a2a", borderRadius: 10, padding: "16px 18px" }}>
              <MarkdownView source={ticket.body} />
            </div>

            <DecisionHistory ticketId={ticket.id} onOpenTicket={onOpenTicket} />

            <div className="font-mono" style={{ color: "#5f7269", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", margin: "24px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              {t("tickets.runs")} <span style={{ color: "#9fb3a9" }}>({runs.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {runs.length === 0 ? (
                <div className="font-mono" style={{ color: "#5f7269", fontSize: 12, padding: 14, border: "1px dashed #1a3a2a", borderRadius: 8 }}>{t("tickets.noRuns")}</div>
              ) : runs.map((r, i) => <RunCard key={r.id} run={r} defaultOpen={i === runs.length - 1} />)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <MetaBlock title={t("tickets.metaPhase")}>
              {phase ? <span style={{ color: "#e6f1ec" }}>{phase.name} <span style={{ color: "#5f7269" }}>({phase.gate === "human_approval" ? t("tickets.humanGate") : t("tickets.auto")})</span></span> : <span style={{ color: "#5f7269" }}>—</span>}
            </MetaBlock>
            <MetaBlock title={t("tickets.metaVisits")}>
              {Object.keys(ticket.phase_visit_count || {}).length === 0 ? <span style={{ color: "#5f7269" }}>—</span> :
                Object.entries(ticket.phase_visit_count).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", color: "#9fb3a9" }}><span>{k}</span><span style={{ color: v > 1 ? "#ffaa00" : "#9fb3a9" }}>×{v}</span></div>
                ))}
            </MetaBlock>
            <MetaBlock title={t("tickets.metaContext")}>
              <ContextDocs ids={ticket.context_doc_ids || []} />
            </MetaBlock>
            <MetaBlock title={t("tickets.metaIds")}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb3a9" }}><span style={{ color: "#5f7269" }}>{t("tickets.idTicket")}</span><span>#{ticket.id}</span></div>
              {ticket.parent_ticket_id && <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb3a9" }}><span style={{ color: "#5f7269" }}>{t("tickets.idParent")}</span><span style={{ color: "#00ddff", cursor: "pointer" }} onClick={() => onOpenTicket(ticket.parent_ticket_id!)}>#{ticket.parent_ticket_id}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb3a9" }}><span style={{ color: "#5f7269" }}>{t("tickets.idWorkflow")}</span><span>{ticket.workflow_id ? idx.workflow(ticket.workflow_id)?.name || ticket.workflow_id : "—"}</span></div>
            </MetaBlock>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextDocs({ ids }: { ids: number[] }) {
  const { t } = useTranslation();
  if (ids.length === 0) return <span style={{ color: "#5f7269" }}>{t("common.none")}</span>;
  return (
    <>
      {ids.map((id) => {
        const d = store.contextDocs.find((x) => x.id === id);
        return d ? <div key={id} style={{ color: "#00ddff" }}>{d.name} <span style={{ color: "#5f7269" }}>· {d.kind}</span></div> : null;
      })}
    </>
  );
}
