/* MaestrOS — live API client. Targets the FastAPI control plane.
   Only used when VITE_USE_MOCK === "false" (Part 3). Endpoints match the contract 1:1.
   Returns the same shapes as mock.ts so queries.ts can switch transparently. */
import axios from "axios";
import type {
  Company, Skill, Agent, Workflow, WorkflowWithPhases, ContextDocument, Ticket, Run, AuditEvent, CreateTicketInput,
} from "./types";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8080",
  timeout: 15000,
});

const data = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

export const api = {
  getCompanies: () => data<Company[]>(client.get("/companies")),
  getAgents: (companyId?: number | "all") =>
    data<Agent[]>(client.get("/agents", { params: companyId && companyId !== "all" ? { company_id: companyId } : {} })),
  getSkills: () => data<Skill[]>(client.get("/skills")),
  getWorkflows: () => data<Workflow[]>(client.get("/workflows")),
  getWorkflowWithPhases: (id: number) => data<WorkflowWithPhases>(client.get(`/workflows/${id}`)),
  getContextDocs: () => data<ContextDocument[]>(client.get("/context-docs")),
  getTickets: (companyId?: number | "all", status?: string) =>
    data<Ticket[]>(client.get("/tickets", {
      params: { ...(companyId && companyId !== "all" ? { company_id: companyId } : {}), ...(status ? { status } : {}) },
    })),
  getTicket: (id: number) => data<Ticket>(client.get(`/tickets/${id}`)),
  getRuns: (params: { ticket_id?: number; agent_id?: number; since?: string; limit?: number; offset?: number } = {}) =>
    data<Run[]>(client.get("/runs", { params })),
  getAudit: (params: { company_id?: number; actor_kind?: string; action?: string; target_kind?: string; since?: string; limit?: number; offset?: number } = {}) =>
    data<AuditEvent[]>(client.get("/audit", { params })),

  getProviderModels: async (provider: string): Promise<string[]> => {
    const { data } = await client.get(`/${provider}/models`);
    return data.models ?? [];
  },
  testProvider: async (provider: string, model: string) => {
    const { data } = await client.post(`/${provider}/test`, { model, params: { max_tokens: 16 } });
    return data as { ok: boolean; message: string; latency_ms: number; cost_usd: number };
  },

  // mutations
  createTicket: (input: CreateTicketInput) =>
    data<Ticket>(client.post("/tickets", { ...input, status: "queued" })),
  upsertAgent: (agent: Partial<Agent> & { id?: number }) =>
    agent.id ? data<Agent>(client.patch(`/agents/${agent.id}`, agent)) : data<Agent>(client.post("/agents", agent)),
  approveTicket: (id: number) => data<void>(client.post(`/tickets/${id}/approve`)),
  rejectTicket: (id: number, reason: string) => data<void>(client.post(`/tickets/${id}/reject`, { reason })),
  patchCompany: (id: number, body: { budget_usd_limit?: number | null; budget_period?: string }) =>
    data<Company>(client.patch(`/companies/${id}`, body)),
};
