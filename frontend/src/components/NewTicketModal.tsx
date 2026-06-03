import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgents, useWorkflows, useWorkflow, useCreateTicket, useCompanies } from "../lib/queries";
import { roleMeta } from "../lib/colors";
import type { CompanyId, CreateTicketInput } from "../lib/types";
import RoleBadge from "./RoleBadge";

const ntInput: React.CSSProperties = {
  width: "100%", background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 7,
  color: "#e6f1ec", padding: "8px 10px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
};

function NTField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 15 }}>
      <div className="font-mono" style={{ fontSize: 10.5, color: "#7a8a82", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}{hint && <span style={{ color: "#3a4a42", textTransform: "none", letterSpacing: 0 }}> · {hint}</span>}
      </div>
      {children}
    </label>
  );
}

// priority: higher number = claimed first (backend orders desc). low=0 / normal=1 / high=2.
const PRIORITY = [
  { value: 0, key: "low", color: "#7a8a82" },
  { value: 1, key: "normal", color: "#00ddff" },
  { value: 2, key: "high", color: "#ffaa00" },
];

export default function NewTicketModal({ companyId, onClose, onCreated }: {
  companyId: CompanyId;
  onClose: () => void;
  onCreated?: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { data: companies = [] } = useCompanies();
  const create = useCreateTicket();

  // Company: default to header scope; if "all", force a choice.
  const [company, setCompany] = useState<number | "">(companyId === "all" ? "" : companyId);
  const [assignee, setAssignee] = useState<number | "">("");
  const [workflowId, setWorkflowId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const { data: agents = [] } = useAgents(company === "" ? "all" : company);
  const { data: workflows = [] } = useWorkflows();
  const { data: workflow } = useWorkflow(workflowId === "" ? null : workflowId);

  // agents selectable in the chosen company (exclude terminated)
  const assignable = useMemo(
    () => agents.filter((a) => a.company_id === company && a.status !== "terminated"),
    [agents, company]
  );

  // computed start phase: first phase (lowest ordinal) of the chosen workflow, else null
  const startPhaseId = useMemo(() => {
    if (workflowId === "" || !workflow || !workflow.phases?.length) return null;
    return workflow.phases.slice().sort((a, b) => a.ordinal - b.ordinal)[0].id;
  }, [workflowId, workflow]);

  function changeCompany(v: string) {
    const c = v === "" ? "" : Number(v);
    setCompany(c);
    setAssignee(""); // reset assignee when company changes
  }

  function submit() {
    if (company === "") { setError(t("newTicket.errCompany")); return; }
    if (assignee === "") { setError(t("newTicket.errAssignee")); return; }
    if (!title.trim()) { setError(t("newTicket.errTitle")); return; }
    const input: CreateTicketInput = {
      company_id: company,
      assignee_agent_id: assignee,
      title: title.trim(),
      body: body,
      priority,
      workflow_id: workflowId === "" ? null : workflowId,
      current_phase_id: startPhaseId,
      context_doc_ids: [],
    };
    create.mutate(input, {
      onSuccess: (tk) => { onClose(); if (tk && onCreated) onCreated(tk.id); },
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.66)", display: "grid", placeItems: "center", zIndex: 80, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="mos-scroll" style={{
        width: 540, maxHeight: "88vh", overflowY: "auto", background: "#0e1413",
        border: "1px solid #1a3a2a", borderTop: "2px solid #00ff88", borderRadius: 14, boxShadow: "0 24px 60px -20px rgba(0,0,0,0.9)",
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 20px 14px", borderBottom: "1px solid #1a3a2a" }}>
          <span className="font-mono" style={{ color: "#00ff88", fontSize: 18, fontWeight: 800 }}>+</span>
          <div style={{ flex: 1 }}>
            <div className="font-mono" style={{ color: "#e6f1ec", fontSize: 16, fontWeight: 700 }}>{t("newTicket.title")}</div>
            <div className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>{t("newTicket.subtitle")}</div>
          </div>
          <button onClick={onClose} className="font-mono" style={{ background: "transparent", border: "none", color: "#7a8a82", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* company */}
            <NTField label={t("newTicket.company")}>
              <select value={company} onChange={(e) => changeCompany(e.target.value)} className="mos-select" style={ntInput}>
                <option value="">{t("newTicket.companyPlaceholder")}</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </NTField>

            {/* assignee — role-colored option label, identifiers stay English */}
            <NTField label={t("newTicket.assignee")}>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value === "" ? "" : Number(e.target.value))} disabled={company === ""} className="mos-select" style={{ ...ntInput, opacity: company === "" ? 0.5 : 1 }}>
                <option value="">{company === "" ? t("newTicket.assigneeNoCompany") : t("newTicket.assigneePlaceholder")}</option>
                {assignable.map((a) => <option key={a.id} value={a.id}>{roleMeta(a.role).label} · {a.title} ({a.model})</option>)}
              </select>
            </NTField>
          </div>

          {/* selected assignee preview (role-colored, like Roster) */}
          {assignee !== "" && (() => {
            const a = assignable.find((x) => x.id === assignee);
            if (!a) return null;
            const r = roleMeta(a.role);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "-4px 0 14px" }}>
                <RoleBadge role={a.role} />
                <span className="font-mono" style={{ color: r.color, fontWeight: 700, fontSize: 13 }}>{a.title}</span>
                <span className="font-mono" style={{ color: "#5f7269", fontSize: 11.5 }}>{a.provider} · {a.model}</span>
              </div>
            );
          })()}

          {/* workflow (optional) */}
          <NTField label={t("newTicket.workflow")} hint={t("newTicket.workflowHint")}>
            <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value === "" ? "" : Number(e.target.value))} className="mos-select" style={ntInput}>
              <option value="">{t("newTicket.workflowNone")}</option>
              {workflows.map((w) => <option key={w.id} value={w.id}>{w.name} {w.version}</option>)}
            </select>
            {workflowId !== "" && startPhaseId && (
              <div className="font-mono" style={{ fontSize: 11, color: "#5f7269", marginTop: 6 }}>
                {t("newTicket.startsAt")} <span style={{ color: "#00ddff" }}>{workflow?.phases?.slice().sort((a, b) => a.ordinal - b.ordinal)[0].name}</span>
              </div>
            )}
          </NTField>

          {/* title */}
          <NTField label={t("newTicket.titleLabel")}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("newTicket.titlePlaceholder")} style={ntInput} />
          </NTField>

          {/* body */}
          <NTField label={t("newTicket.body")} hint={t("newTicket.bodyHint")}>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("newTicket.bodyPlaceholder")} spellCheck={false}
              style={{ ...ntInput, height: 140, resize: "vertical", lineHeight: 1.5 }} />
          </NTField>

          {/* priority */}
          <NTField label={t("newTicket.priority")} hint={t("newTicket.priorityHint")}>
            <div style={{ display: "flex", gap: 4, background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 8, padding: 3 }}>
              {PRIORITY.map((p) => (
                <button key={p.value} type="button" onClick={() => setPriority(p.value)} className="font-mono" style={{
                  flex: 1, padding: "7px 8px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", border: "none",
                  color: priority === p.value ? "#0a0d0c" : p.color, fontWeight: priority === p.value ? 700 : 500,
                  background: priority === p.value ? p.color : "transparent",
                }}>{t(`newTicket.prio.${p.key}`)}</button>
              ))}
            </div>
          </NTField>

          {error && <div className="font-mono" style={{ color: "#ff6680", fontSize: 12, marginTop: -4 }}>⚠ {error}</div>}
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 18px" }}>
          <button onClick={onClose} className="font-mono" style={{ padding: "9px 18px", borderRadius: 8, color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", cursor: "pointer", fontSize: 13 }}>{t("common.cancel")}</button>
          <button onClick={submit} disabled={create.isPending} className="font-mono" style={{ padding: "9px 22px", borderRadius: 8, color: "#0a0d0c", background: "#00ff88", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 0 16px -6px #00ff88", opacity: create.isPending ? 0.6 : 1 }}>
            {create.isPending ? t("newTicket.creating") : t("newTicket.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
