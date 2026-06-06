/* MaestrOS — backend interfaces. Match the FastAPI control-plane shapes exactly.
   These are the single source of truth for both the mock layer and the live api client. */

export type TicketStatus = "queued" | "running" | "done" | "error" | "needs_approval" | "blocked";
export type AgentStatus = "active" | "paused" | "terminated";
export type BudgetPeriod = "daily" | "monthly" | "all_time";
export type Provider = "ollama" | "anthropic" | "openrouter" | "claude_code";
export type Gate = "auto" | "human_approval";
export type RunStatus = "done" | "needs_approval" | "blocked" | "error";

/** Verdict decisions an agent can emit (kept English everywhere — backend identifiers). */
export type Decision = "approve" | "rework" | "escalate" | "ship" | "hold" | "reject";

export interface Company {
  id: number;
  name: string;
  budget_usd_limit: number | null;
  budget_period: BudgetPeriod;
  cost_spent_period: number;
}

export interface Skill {
  id: number;
  name: string;
  version: string;
  markdown_body: string;
}

export interface Agent {
  id: number;
  company_id: number;
  role: string; // ceo | eng | qa | planner | <custom> — kept English
  title: string; // proper noun (Helm, Forge…)
  char_title?: string; // human title, e.g. "Chief Executive"
  provider: Provider;
  model: string;
  params: Record<string, unknown>;
  default_skill_id: number;
  status: AgentStatus;
  reporting_to: number | null;
  budget_usd_limit: number | null;
  budget_period: BudgetPeriod;
  cost_spent_period: number;
  paused_reason: string | null;
}

export interface Phase {
  id: number;
  workflow_id: number;
  ordinal: number;
  name: string;
  skill_id: number;
  gate: Gate;
  next_phase_id: number | null;
  max_reworks: number | null;
  default_verdict: string;
  branch_on_verdict: Record<string, string>;
  default_context_doc_names?: string[];
}

export interface Workflow {
  id: number;
  name: string;
  version: string;
  description?: string;
}
export interface WorkflowWithPhases extends Workflow {
  phases: Phase[];
}

export interface ContextDocument {
  id: number;
  company_id: number;
  name: string;
  kind: string;
  body: string;
}

export interface Ticket {
  id: number;
  company_id: number;
  workflow_id: number | null;
  current_phase_id: number | null;
  parent_ticket_id: number | null;
  assignee_agent_id: number;
  title: string;
  body: string;
  status: TicketStatus;
  priority: number;
  owner_agent_id?: number | null;
  locked_at?: string | null;
  blocked_reason: string | null;
  context_doc_ids: number[];
  phase_visit_count: Record<string, number>;
  created_at: string;
}

export interface Run {
  id: number;
  ticket_id: number;
  agent_id: number;
  status: RunStatus;
  work_product: string;
  logs: string[];
  cost_tokens: number;
  cost_usd: number;
  started_at: string;
  ended_at: string | null;
}

export interface AuditEvent {
  id: number;
  ts: string;
  actor_kind: "operator" | "agent" | "system";
  actor_id: number | null;
  actor_label: string;
  action: string;
  target_kind: "ticket" | "agent" | "company";
  target_id: number;
  target_label: string;
  detail: string | null;
  company_id: number | null;
}

/** A Live Ops feed event. In the mock it's seeded + synthesized; live it comes from SSE/poll. */
export interface ActivityEvent {
  id: number;
  ts: number; // epoch ms (mock stores tAgo and converts; live sends absolute)
  agent_id: number;
  action: string; // claimed | done | blocked | error | needs_approval | log | tick
  ticket_id: number;
  status: TicketStatus | string;
  cost_tokens: number;
  note?: string;
}

export interface CompanyScope {
  companyId: number | "all";
}

/** Selected company scope — shared by every view. */
export type CompanyId = number | "all";

export interface CreateTicketInput {
  company_id: number;
  assignee_agent_id: number;
  title: string;
  body: string;
  priority: number;
  workflow_id?: number | null;
  current_phase_id?: number | null;
  context_doc_ids?: number[];
}
