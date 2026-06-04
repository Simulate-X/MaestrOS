/* MaestrOS — TanStack Query hooks. ONE env switch flips the whole app between
   standalone-mock and live-backend. Components import only these hooks. */
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mock, syncLiveAgents, syncLiveCompanies, syncLiveTickets, syncLiveRuns } from "./mock";
import { api } from "./api";
import type { Agent, Ticket, ActivityEvent, TicketStatus, CreateTicketInput } from "./types";

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false"; // default true → standalone

// polling cadences (refetchInterval). Background refetch off everywhere.
const FAST = 2000; // Live Ops / active views
const SLOW = 5000; // aggregates, roster, ticket detail
const common = { refetchIntervalInBackground: false as const };

export function useCompanies() {
  const q = useQuery({
    queryKey: ["companies"],
    queryFn: () => (USE_MOCK ? mock.getCompanies() : api.getCompanies()),
    refetchInterval: SLOW, ...common,
  });
  // Sync live data into idx/store so cross-entity helpers work in live mode
  useEffect(() => {
    if (!USE_MOCK && q.data) syncLiveCompanies(q.data);
  }, [q.data]);
  return q;
}

export function useAgents(companyId?: number | "all") {
  const q = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => (USE_MOCK ? mock.getAgents(companyId) : api.getAgents(companyId)),
    refetchInterval: SLOW, ...common,
  });
  useEffect(() => {
    if (!USE_MOCK && q.data) syncLiveAgents(q.data);
  }, [q.data]);
  return q;
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => (USE_MOCK ? mock.getSkills() : api.getSkills()) });
}

export function useWorkflows() {
  return useQuery({ queryKey: ["workflows"], queryFn: () => (USE_MOCK ? mock.getWorkflows() : api.getWorkflows()) });
}

export function useWorkflow(id: number | null) {
  return useQuery({
    queryKey: ["workflow", id],
    queryFn: () => (USE_MOCK ? mock.getWorkflowWithPhases(id as number) : api.getWorkflowWithPhases(id as number)),
    enabled: id != null,
  });
}

export function useContextDocs() {
  return useQuery({ queryKey: ["context-docs"], queryFn: () => (USE_MOCK ? mock.getContextDocs() : api.getContextDocs()) });
}

export function useTickets(companyId?: number | "all", status?: string) {
  const q = useQuery({
    queryKey: ["tickets", companyId, status],
    queryFn: () => (USE_MOCK ? mock.getTickets(companyId, status) : api.getTickets(companyId, status)),
    refetchInterval: SLOW, ...common,
  });
  useEffect(() => {
    if (!USE_MOCK && q.data) syncLiveTickets(q.data);
  }, [q.data]);
  return q;
}

export function useTicket(id: number) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn: () => (USE_MOCK ? mock.getTicket(id) : api.getTicket(id)),
    refetchInterval: SLOW, ...common,
  });
}

export function useRuns(params: { ticket_id?: number; agent_id?: number } = {}) {
  const q = useQuery({
    queryKey: ["runs", params],
    queryFn: () => (USE_MOCK ? mock.getRuns(params) : api.getRuns(params)),
    refetchInterval: SLOW, ...common,
  });
  useEffect(() => {
    // Only sync when fetching all runs (no filter) — partial lists would clobber the store
    if (!USE_MOCK && q.data && !params.ticket_id && !params.agent_id) syncLiveRuns(q.data);
  }, [q.data, params.ticket_id, params.agent_id]);
  return q;
}

export function useAudit(companyId?: number | "all", filters: { actor_kind?: string; action?: string } = {}) {
  return useQuery({
    queryKey: ["audit", companyId, filters],
    queryFn: () => (USE_MOCK
      ? mock.getAudit(companyId)
      : api.getAudit({ company_id: companyId && companyId !== "all" ? companyId : undefined, ...filters })),
    refetchInterval: SLOW, ...common,
  });
}

// Live Ops seed — in mock mode: pre-seeded events; in live mode: recent runs as ActivityEvents.
export function useActivitySeed() {
  return useQuery({
    queryKey: ["activity-seed"],
    queryFn: () => (USE_MOCK
      ? mock.getActivitySeed()
      : api.getRuns({ limit: 200 }).then((runs) => {
          // Also sync runs store so idx.runsByTicket works in live mode
          syncLiveRuns(runs);
          // Convert Run records to ActivityEvent shape for the live feed
          return runs.map<ActivityEvent>((r) => ({
            id: r.id,
            ts: r.ended_at
              ? new Date(r.ended_at).getTime()
              : new Date(r.started_at).getTime(),
            agent_id: r.agent_id,
            action: r.status,                              // "done" | "error" | "needs_approval" | "blocked"
            ticket_id: r.ticket_id,
            status: r.status as TicketStatus,
            cost_tokens: r.cost_tokens,
          }));
        })),
    refetchInterval: FAST, ...common,
  });
}

export function useOllamaModels(enabled: boolean) {
  return useQuery({
    queryKey: ["ollama-models"],
    queryFn: () => (USE_MOCK ? mock.getOllamaModels() : api.getOllamaModels()),
    enabled,
    staleTime: 60_000,
  });
}

// ---- mutations -------------------------------------------------------------
export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => (USE_MOCK ? mock.createTicket(input) : api.createTicket(input)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); },
  });
}

export function useUpsertAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agent: Agent) => (USE_MOCK ? mock.upsertAgent(agent) : api.upsertAgent(agent)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agents"] }); },
  });
}

export function useApproveTicket() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => { await (USE_MOCK ? mock.setTicketStatus(id, "queued") : api.approveTicket(id)); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["ticket"] }); },
  });
}

export function useRejectTicket() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; reason: string }>({
    mutationFn: async ({ id }: { id: number; reason: string }) => { await (USE_MOCK ? mock.setTicketStatus(id, "error") : api.rejectTicket(id, "")); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["ticket"] }); },
  });
}

export { USE_MOCK };
export type { Agent, Ticket };
