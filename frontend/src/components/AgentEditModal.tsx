import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { roleMeta } from "../lib/colors";
import { usd } from "../lib/helpers";
import { store, mock } from "../lib/mock";
import type { Agent, Provider } from "../lib/types";
import RoleBadge from "./RoleBadge";

const MODEL_CATALOG: Record<Provider, { recommended: string[]; all: string[]; kind: "local" | "cloud" }> = {
  ollama: { recommended: ["qwen2.5-coder:14b", "qwen2.5-coder:32b", "deepseek-coder-v2:16b"], all: ["qwen2.5-coder:14b", "qwen2.5-coder:32b", "deepseek-coder-v2:16b", "codellama:13b", "llama3.3:70b", "mistral-small:24b"], kind: "local" },
  anthropic: { recommended: ["claude-sonnet-4", "claude-haiku-4.5"], all: ["claude-sonnet-4", "claude-haiku-4.5", "claude-opus-4"], kind: "cloud" },
  openrouter: { recommended: ["anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4", "meta-llama/llama-3.3-70b-instruct"], all: ["anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4", "meta-llama/llama-3.3-70b-instruct", "google/gemini-2.0-flash", "qwen/qwen-2.5-coder-32b-instruct"], kind: "cloud" },
};
const ROLE_OPTS = ["ceo", "eng", "qa", "planner", "custom"];

const amInput: React.CSSProperties = {
  width: "100%", background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 7,
  color: "#e6f1ec", padding: "8px 10px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
};

function AMField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 15 }}>
      <div className="font-mono" style={{ fontSize: 10.5, color: "#7a8a82", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}{hint && <span style={{ color: "#3a4a42", textTransform: "none", letterSpacing: 0 }}> · {hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#0a0d0c", border: "1px solid #1a3a2a", borderRadius: 8, padding: 3 }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className="font-mono" style={{
          flex: 1, padding: "6px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer",
          color: value === o.value ? "#0a0d0c" : "#9fb3a9", fontWeight: value === o.value ? 700 : 500,
          background: value === o.value ? "#00ff88" : "transparent", border: "none",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export default function AgentEditModal({ agent, companyId, onSave, onClose }: {
  agent: Agent | null;
  companyId: number;
  onSave: (a: Agent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isNew = !agent;
  const cid = agent ? agent.company_id : companyId;
  const [tab, setTab] = useState<"identity" | "governance">("identity");
  const [role, setRole] = useState(agent ? agent.role : "eng");
  const [title, setTitle] = useState(agent ? agent.title : "");
  const [charTitle, setCharTitle] = useState(agent ? agent.char_title || "" : "");
  const [provider, setProvider] = useState<Provider>(agent ? agent.provider : "ollama");
  const [model, setModel] = useState(agent ? agent.model : "qwen2.5-coder:14b");
  const [maxTokens, setMaxTokens] = useState<string>(agent && agent.params && (agent.params as any).max_tokens != null ? String((agent.params as any).max_tokens) : "");
  const [paramsText, setParamsText] = useState(JSON.stringify(agent ? agent.params || {} : {}, null, 2));
  const [paramsErr, setParamsErr] = useState<string | null>(null);
  const [skillId, setSkillId] = useState<number>(agent ? agent.default_skill_id : store.skills[0].id);
  const [budgetLimit, setBudgetLimit] = useState<string>(agent && agent.budget_usd_limit != null ? String(agent.budget_usd_limit) : "");
  const [budgetPeriod, setBudgetPeriod] = useState(agent ? agent.budget_period : "daily");
  const [reportsTo, setReportsTo] = useState<string>(agent && agent.reporting_to != null ? String(agent.reporting_to) : "");
  const [status, setStatus] = useState(agent ? agent.status : "active");

  const catalog = MODEL_CATALOG[provider] || MODEL_CATALOG.ollama;
  const bosses = useMemo(() => store.agents.filter((a) => a.company_id === cid && a.status !== "terminated" && (!agent || a.id !== agent.id)), [cid, agent]);
  const r = roleMeta(role);

  function changeProvider(p: string) {
    const pp = p as Provider;
    setProvider(pp);
    const cat = MODEL_CATALOG[pp];
    if (cat && !cat.all.includes(model)) setModel(cat.recommended[0]);
  }

  function submit() {
    let params: Record<string, unknown> = {};
    try { params = paramsText.trim() ? JSON.parse(paramsText) : {}; }
    catch { setParamsErr(t("agentModal.invalidJson")); setTab("identity"); return; }
    if (maxTokens !== "" && !isNaN(Number(maxTokens))) params.max_tokens = Number(maxTokens);
    const data: Agent = {
      id: agent ? agent.id : mock.nextAgentId(),
      company_id: cid, role, title: title.trim() || "Unnamed",
      char_title: charTitle.trim() || roleMeta(role).title,
      provider, model: model.trim(), params, default_skill_id: Number(skillId),
      budget_usd_limit: budgetLimit.trim() === "" ? null : Number(budgetLimit),
      budget_period: budgetPeriod,
      reporting_to: reportsTo === "" ? null : Number(reportsTo),
      status,
      paused_reason: status === "paused" ? (agent && agent.paused_reason) || "paused by operator" : status === "terminated" ? "terminated by operator" : null,
      cost_spent_period: agent ? agent.cost_spent_period : 0,
    };
    onSave(data);
  }

  const TabBtn = ({ id, label }: { id: "identity" | "governance"; label: string }) => (
    <button type="button" onClick={() => setTab(id)} className="font-mono" style={{
      padding: "8px 16px", fontSize: 13, cursor: "pointer", background: "transparent", border: "none",
      color: tab === id ? "#00ff88" : "#7a8a82", fontWeight: tab === id ? 700 : 500,
      borderBottom: "2px solid " + (tab === id ? "#00ff88" : "transparent"),
    }}>{label}</button>
  );

  const customRole = !["ceo", "eng", "qa", "planner"].includes(role);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.66)", display: "grid", placeItems: "center", zIndex: 80, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="mos-scroll" style={{
        width: 520, maxHeight: "88vh", overflowY: "auto", background: "#0e1413",
        border: "1px solid #1a3a2a", borderTop: "2px solid " + r.color, borderRadius: 14, boxShadow: "0 24px 60px -20px rgba(0,0,0,0.9)",
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 20px 0" }}>
          <RoleBadge role={role} size="lg" />
          <div style={{ flex: 1 }}>
            <div className="font-mono" style={{ color: "#e6f1ec", fontSize: 16, fontWeight: 700 }}>
              {isNew ? t("agentModal.hireTitle") : t("agentModal.editTitle", { name: title || "agent" })}
            </div>
            <div className="font-mono" style={{ color: "#5f7269", fontSize: 11 }}>{store.companies.find((c) => c.id === cid)?.name || ""}</div>
          </div>
          <button onClick={onClose} className="font-mono" style={{ background: "transparent", border: "none", color: "#7a8a82", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 20px 0", borderBottom: "1px solid #1a3a2a" }}>
          <TabBtn id="identity" label={t("agentModal.tabIdentity")} />
          <TabBtn id="governance" label={t("agentModal.tabGovernance")} />
        </div>

        <div style={{ padding: "18px 20px" }}>
          {tab === "identity" && (
            <div>
              <AMField label={t("agentModal.role")}>
                <Segmented value={customRole ? "custom" : role} onChange={(v) => setRole(v === "custom" ? "" : v)} options={ROLE_OPTS.map((o) => ({ value: o, label: o }))} />
                {customRole && <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("agentModal.customRole")} style={{ ...amInput, marginTop: 8 }} />}
              </AMField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <AMField label={t("agentModal.name")} hint={t("agentModal.nameHint")}>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("agentModal.namePlaceholder")} style={amInput} />
                </AMField>
                <AMField label={t("agentModal.title")} hint={t("agentModal.titleHint")}>
                  <input value={charTitle} onChange={(e) => setCharTitle(e.target.value)} placeholder={r.title} style={amInput} />
                </AMField>
              </div>
              <AMField label={t("agentModal.provider")}>
                <Segmented value={provider} onChange={changeProvider} options={[
                  { value: "ollama", label: "ollama" }, { value: "anthropic", label: "anthropic" }, { value: "openrouter", label: "openrouter" },
                ]} />
              </AMField>
              <AMField label={t("agentModal.model")} hint={t("agentModal.modelHint", { kind: catalog.kind === "local" ? t("agentModal.localModel") : t("agentModal.cloud") })}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                  {catalog.recommended.map((mdl) => (
                    <button key={mdl} type="button" onClick={() => setModel(mdl)} className="font-mono" style={{
                      padding: "3px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                      color: model === mdl ? "#00ff88" : "#9fb3a9", background: model === mdl ? "rgba(0,255,136,0.1)" : "#0a0d0c",
                      border: "1px solid " + (model === mdl ? "#00ff8866" : "#1a3a2a"),
                    }}>★ {mdl}</button>
                  ))}
                </div>
                <input list="am-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("agentModal.modelPlaceholder")} style={amInput} />
                <datalist id="am-models">{catalog.all.map((mdl) => <option key={mdl} value={mdl} />)}</datalist>
              </AMField>
              <AMField label={t("agentModal.defaultSkill")}>
                <select value={skillId} onChange={(e) => setSkillId(Number(e.target.value))} className="mos-select" style={amInput}>
                  {store.skills.map((s) => <option key={s.id} value={s.id}>{s.name} {s.version}</option>)}
                </select>
              </AMField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <AMField label={t("agentModal.maxTokens")}>
                  <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder={t("agentModal.maxTokensPlaceholder")} style={amInput} />
                </AMField>
                <div />
              </div>
              <details style={{ marginTop: 2 }}>
                <summary className="font-mono" style={{ color: "#7a8a82", fontSize: 11.5, cursor: "pointer", letterSpacing: "0.04em" }}>{t("agentModal.paramsRaw")}</summary>
                <textarea value={paramsText} onChange={(e) => { setParamsText(e.target.value); setParamsErr(null); }} spellCheck={false} style={{ ...amInput, marginTop: 8, height: 100, resize: "vertical", color: "#9fe6c4", fontSize: 12 }} />
                {paramsErr && <div className="font-mono" style={{ color: "#ff6680", fontSize: 11, marginTop: 4 }}>⚠ {paramsErr}</div>}
              </details>
            </div>
          )}

          {tab === "governance" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14 }}>
                <AMField label={t("agentModal.budgetLimit")} hint={t("agentModal.budgetLimitHint")}>
                  <input type="number" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} placeholder="∞" style={amInput} />
                </AMField>
                <AMField label={t("agentModal.budgetPeriod")}>
                  <Segmented value={budgetPeriod} onChange={(v) => setBudgetPeriod(v as typeof budgetPeriod)} options={[
                    { value: "daily", label: "daily" }, { value: "monthly", label: "monthly" }, { value: "all_time", label: "all-time" },
                  ]} />
                </AMField>
              </div>
              <AMField label={t("agentModal.reportsTo")} hint={t("agentModal.reportsToHint")}>
                <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} className="mos-select" style={amInput}>
                  <option value="">{t("agentModal.reportsToNone")}</option>
                  {bosses.map((b) => <option key={b.id} value={b.id}>{b.title} ({roleMeta(b.role).label})</option>)}
                </select>
              </AMField>
              <AMField label={t("agentModal.status")}>
                <Segmented value={status} onChange={(v) => setStatus(v as typeof status)} options={[
                  { value: "active", label: "active" }, { value: "paused", label: "paused" }, { value: "terminated", label: "terminated" },
                ]} />
              </AMField>
              {budgetLimit.trim() !== "" && (
                <div className="font-mono" style={{ fontSize: 11.5, color: "#5f7269", marginTop: 4 }}>
                  {t("agentModal.autoPauseNote", { amount: usd(Number(budgetLimit)), period: budgetPeriod })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 18px" }}>
          <button onClick={onClose} className="font-mono" style={{ padding: "9px 18px", borderRadius: 8, color: "#7a8a82", background: "transparent", border: "1px solid #1a3a2a", cursor: "pointer", fontSize: 13 }}>{t("common.cancel")}</button>
          <button onClick={submit} className="font-mono" style={{ padding: "9px 20px", borderRadius: 8, color: "#0a0d0c", background: "#00ff88", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 0 16px -6px #00ff88" }}>
            {isNew ? t("common.hire") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
