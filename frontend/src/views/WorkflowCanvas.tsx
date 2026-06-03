import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MarkerType,
  type Node, type Edge, ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkflows } from "../lib/queries";
import { idx, store } from "../lib/mock";
import { statusMeta } from "../lib/colors";
import { relTime, agentLabel } from "../lib/helpers";
import type { CompanyId, Phase, Ticket } from "../lib/types";
import { PhaseFlowNode, BranchEdge, type PhaseNodeData } from "../components/CanvasNodes";
import StatusBadge from "../components/StatusBadge";

const GAP_X = 280, MARGIN_X = 40, ROW_Y = 60;

function phaseActiveTickets(phase: Phase, companyId: CompanyId): Ticket[] {
  return store.tickets.filter((tk) =>
    tk.current_phase_id === phase.id &&
    (companyId === "all" || tk.company_id === companyId) &&
    ["running", "queued", "needs_approval", "blocked"].includes(tk.status));
}
function phaseRecentTickets(phase: Phase, companyId: CompanyId): Ticket[] {
  return store.tickets
    .filter((tk) => tk.current_phase_id === phase.id && (companyId === "all" || tk.company_id === companyId))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

const nodeTypes = { phase: PhaseFlowNode };
const edgeTypes = { branch: BranchEdge };

function CanvasInner({ companyId, onOpenTicket }: { companyId: CompanyId; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  const now = useNow();
  const { data: workflows = [] } = useWorkflows();
  const [wfId, setWfId] = useState(1);
  const [selPhaseId, setSelPhaseId] = useState<number | null>(null);

  const phases = useMemo(() => idx.phasesByWorkflow(wfId), [wfId]);
  const ordinalOf = useMemo(() => {
    const m: Record<number, number> = {};
    phases.forEach((p, i) => { m[p.id] = i; });
    return m;
  }, [phases]);

  const nodes: Node<PhaseNodeData>[] = useMemo(() => phases.map((p, i) => ({
    id: String(p.id),
    type: "phase",
    position: { x: MARGIN_X + i * GAP_X, y: ROW_Y },
    data: { phase: p, active: phaseActiveTickets(p, companyId), selected: selPhaseId === p.id, onClick: () => setSelPhaseId(p.id) },
    draggable: false,
  })), [phases, companyId, selPhaseId, now]);

  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    phases.forEach((p) => {
      if (p.next_phase_id && ordinalOf[p.next_phase_id] != null) {
        out.push({
          id: `f-${p.id}-${p.next_phase_id}`, source: String(p.id), target: String(p.next_phase_id),
          sourceHandle: "r", targetHandle: "l", type: "default",
          style: { stroke: "#00ff88", strokeWidth: 2, opacity: 0.85 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#00ff88", width: 16, height: 16 },
        });
      }
      Object.entries(p.branch_on_verdict || {}).forEach(([verdict, targetName]) => {
        const target = phases.find((q) => q.name === targetName);
        if (!target) return;
        const backward = ordinalOf[target.id] < ordinalOf[p.id];
        const color = verdict === "escalate" ? "#00ddff" : verdict === "hold" ? "#ff4466" : "#ffaa00";
        out.push({
          id: `b-${p.id}-${target.id}-${verdict}`, source: String(p.id), target: String(target.id),
          sourceHandle: backward ? "b" : "t", targetHandle: backward ? "bt" : "tt",
          type: "branch", data: { verdict, backward, color },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        });
      });
    });
    return out;
  }, [phases, ordinalOf]);

  const wf = workflows.find((w) => w.id === wfId);
  const selPhase = selPhaseId ? idx.phase(selPhaseId) : null;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
          <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{t("canvas.title")}</span>
          <select value={wfId} onChange={(e) => { setWfId(Number(e.target.value)); setSelPhaseId(null); }} className="font-mono mos-select" style={{
            background: "#11161a", color: "#cfe0d7", border: "1px solid #1a3a2a", borderRadius: 6, padding: "5px 9px", fontSize: 12.5,
          }}>
            {workflows.map((w) => <option key={w.id} value={w.id}>{w.name} {w.version}</option>)}
          </select>
          {wf && <span className="font-mono" style={{ color: "#7a8a82", fontSize: 12 }}>{wf.description}</span>}
          <div style={{ flex: 1 }} />
          <div className="font-mono" style={{ display: "flex", gap: 14, fontSize: 10.5, color: "#7a8a82" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#00ff88" strokeWidth="2" /></svg>{t("canvas.legendNext")}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#ffaa00" strokeWidth="2" strokeDasharray="4 3" /></svg>{t("canvas.legendRework")}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#00ddff" strokeWidth="2" strokeDasharray="4 3" /></svg>{t("canvas.legendEscalate")}</span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, background: "#090d0c" }}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.4} maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
            onPaneClick={() => setSelPhaseId(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1a3a2a" />
            <Controls showInteractive={false} style={{ filter: "invert(0.9) hue-rotate(120deg)" }} />
          </ReactFlow>
        </div>
      </div>

      {selPhase && (
        <div style={{ width: 360, flexShrink: 0, borderLeft: "1px solid #1a3a2a", background: "#0c1110", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a3a2a", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div className="font-mono" style={{ color: "#e6f1ec", fontSize: 16, fontWeight: 700 }}>{selPhase.name}</div>
              <div className="font-mono" style={{ color: "#7a8a82", fontSize: 11, marginTop: 3 }}>
                {t("canvas.skill")} <span style={{ color: "#00ddff" }}>{idx.skill(selPhase.skill_id)?.name}</span> · {t("canvas.gate")} {selPhase.gate === "human_approval" ? t("canvas.human") : t("canvas.auto")}
                {selPhase.max_reworks != null && <span> · {t("canvas.max")} ↻ {selPhase.max_reworks}</span>}
              </div>
            </div>
            <button onClick={() => setSelPhaseId(null)} className="font-mono" style={{ color: "#7a8a82", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>
          {(selPhase.default_context_doc_names || []).length > 0 && (
            <div className="font-mono" style={{ padding: "10px 16px", borderBottom: "1px solid #121b18", fontSize: 11, color: "#7a8a82" }}>
              {t("canvas.context")}: {selPhase.default_context_doc_names!.map((n) => <span key={n} style={{ color: "#00ddff", marginRight: 8 }}>{n}</span>)}
            </div>
          )}
          <div style={{ padding: "10px 16px 6px", color: "#5f7269", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase" }} className="font-mono">{t("canvas.recentAtPhase")}</div>
          <div className="mos-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 12px 14px", minHeight: 0 }}>
            {phaseRecentTickets(selPhase, companyId).length === 0 ? (
              <div className="font-mono" style={{ color: "#5f7269", fontSize: 12, padding: 14 }}>{t("canvas.noTicketsPhase", { scope: companyId !== "all" ? t("canvas.forCompany") : "" })}</div>
            ) : phaseRecentTickets(selPhase, companyId).map((tk) => {
              const m = statusMeta(tk.status);
              return (
                <div key={tk.id} onClick={() => onOpenTicket(tk.id)} className="mos-row" style={{
                  padding: "10px 11px", borderRadius: 8, marginTop: 8, cursor: "pointer",
                  background: "#11161a", border: "1px solid " + (tk.status === "blocked" || tk.status === "needs_approval" ? m.border : "#1a3a2a"),
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>#{tk.id}</span>
                    <StatusBadge status={tk.status} />
                  </div>
                  <div style={{ color: "#cfe0d7", fontSize: 12.5, marginTop: 5 }}>{tk.title}</div>
                  {tk.blocked_reason && (
                    <div className="font-mono" style={{ marginTop: 6, fontSize: 11, color: "#ff8099", background: "rgba(255,68,102,0.08)", border: "1px solid #ff446633", borderRadius: 5, padding: "5px 7px" }}>
                      ⚠ {tk.blocked_reason}
                    </div>
                  )}
                  <div className="font-mono" style={{ color: "#5f7269", fontSize: 10.5, marginTop: 6 }}>
                    {agentLabel(tk.assignee_agent_id)} · {relTime(tk.created_at, now)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowCanvas(props: { companyId: CompanyId; onOpenTicket: (id: number) => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
