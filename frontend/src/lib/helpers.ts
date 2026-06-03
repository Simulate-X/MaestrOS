/* MaestrOS — pure + derivation helpers. Ported from window.LIB.
   Formatting helpers are pure. Cross-entity graph helpers (parentChain, decisionHistory…)
   read the in-memory store synchronously via `idx` — in standalone mode that's the mock store.
   In live mode (Part 3) these become selectors over already-fetched TanStack Query data;
   the call sites (by id) stay identical. */
import { idx, store } from "./mock";
import type { Agent, Ticket, Run, Decision } from "./types";
import { roleMeta } from "./colors";
import i18n from "../i18n";

/** Localized relative time. Uses the i18n catalog (time.*). English fallback keeps "18m ago". */
export function relTime(iso: string | number | null | undefined, nowMs?: number): string {
  if (!iso) return "—";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.floor(((nowMs || Date.now()) - t) / 1000));
  if (s < 60) return i18n.t("time.secondsAgo", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return i18n.t("time.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return i18n.t("time.hoursAgo", { n: h, m: m % 60 });
  return i18n.t("time.daysAgo", { n: Math.floor(h / 24) });
}

// ---- time / number formatting (pure) --------------------------------------
export function fromNow(iso: string | number | null | undefined, nowMs?: number): string {
  if (!iso) return "—";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.floor(((nowMs || Date.now()) - t) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h " + (m % 60) + "m ago";
  return Math.floor(h / 24) + "d ago";
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

export function tokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
}

export function usd(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Number(n).toFixed(2);
}

export function truncate(s: string, n: number): string {
  return s && s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ---- verdict extraction (pure) --------------------------------------------
export interface VerdictJson {
  decision?: string;
  reasons?: string[];
  note?: string;
  confidence?: number;
  [k: string]: unknown;
}
export interface ExtractedVerdict {
  decision: string | null;
  json: VerdictJson | null;
  raw: string | null;
  body: string;
}
export function extractVerdict(wp: string | null | undefined): ExtractedVerdict {
  if (!wp) return { decision: null, json: null, raw: null, body: wp || "" };
  const re = /```verdict\s*\n([\s\S]*?)\n```/i;
  const m = wp.match(re);
  if (!m) return { decision: null, json: null, raw: null, body: wp };
  let json: VerdictJson | null = null;
  try { json = JSON.parse(m[1]); } catch { json = null; }
  const decision = json && typeof json.decision === "string" ? json.decision : null;
  const body = wp.replace(re, "").trim();
  return { decision, json, raw: m[1].trim(), body };
}

export function reworkIteration(body: string | null | undefined): number | null {
  const m = (body || "").match(/^#\s*Rework Iteration\s+(\d+)/im);
  return m ? Number(m[1]) : null;
}

// ---- agent identity / activity --------------------------------------------
export function agentLabel(agentId: number): string {
  const a = idx.agent(agentId);
  if (!a) return "agent#" + agentId;
  return a.role + "·" + a.title;
}

export interface Activity {
  verb: string;
  status: "running" | "needs_approval" | "blocked" | "paused" | "terminated" | "idle" | "unknown";
  ticket: Ticket | null;
}
export function agentActivity(agentId: number): Activity {
  const a = idx.agent(agentId);
  if (!a) return { verb: "unknown", status: "unknown", ticket: null };
  if (a.status === "terminated") return { verb: "terminated", status: "terminated", ticket: null };
  if (a.status === "paused") return { verb: "paused", status: "paused", ticket: null };
  const order: Record<string, number> = { blocked: 0, needs_approval: 1, running: 2 };
  const live = store.tickets
    .filter((t) => t.assignee_agent_id === agentId && ["blocked", "needs_approval", "running"].includes(t.status))
    .sort((x, y) => (order[x.status] - order[y.status]) || (x.priority - y.priority));
  const t = live[0];
  if (!t) return { verb: "idle", status: "idle", ticket: null };
  if (t.status === "blocked") return { verb: "blocked", status: "blocked", ticket: t };
  const byRole: Record<string, string> = { planner: "planning", eng: "building", qa: "reviewing", ceo: "shipping" };
  if (t.status === "needs_approval") {
    const v = a.role === "ceo" ? "shipping" : a.role === "qa" ? "verifying" : "awaiting approval";
    return { verb: v, status: "needs_approval", ticket: t };
  }
  return { verb: byRole[a.role] || "working", status: "running", ticket: t };
}

export interface RecentRun { run: Run; ticket: Ticket | undefined; decision: string | null; status: string; title: string; }
export function agentRecentRuns(agentId: number, n = 2): RecentRun[] {
  return store.runs
    .filter((r) => r.agent_id === agentId)
    .sort((x, y) => +new Date(y.started_at) - +new Date(x.started_at))
    .slice(0, n)
    .map((r) => {
      const t = idx.ticket(r.ticket_id);
      const v = extractVerdict(r.work_product);
      const title = t ? t.title.replace(/^(build|review|ship|patch|verify|triage)(\s*\(rework\))?:\s*/i, "") : "ticket #" + r.ticket_id;
      return { run: r, ticket: t, decision: v.decision, status: r.status, title };
    });
}

// ---- budget gauge math -----------------------------------------------------
export interface Budget { capped: boolean; pct: number; color: string; label?: string; }
export function budget(spent: number, limit: number | null): Budget {
  if (limit == null) return { capped: false, pct: 0, color: "#7a8a82", label: "no budget cap" };
  const pct = limit === 0 ? 1 : Math.min(1, spent / limit);
  const color = pct >= 0.95 ? "#ff4466" : pct >= 0.7 ? "#ffaa00" : "#00ff88";
  return { capped: true, pct, color };
}

// ---- governance graph helpers ---------------------------------------------
export function parentChain(ticketId: number): Ticket[] {
  const chain: Ticket[] = [];
  let t = idx.ticket(ticketId);
  let guard = 0;
  while (t && guard++ < 50) {
    chain.unshift(t);
    t = t.parent_ticket_id ? idx.ticket(t.parent_ticket_id) : undefined;
  }
  return chain;
}
export const goalRoot = (ticketId: number): Ticket | undefined => parentChain(ticketId)[0] || idx.ticket(ticketId);

export interface DecisionRow {
  ticket: Ticket; run: Run; agent: Agent | undefined; role: string | null;
  decision: string | null; verb: string; reason: string | null; tokens: number; ts: string; status: string;
}
export function decisionHistory(ticketId: number): DecisionRow[] {
  const chain = parentChain(ticketId);
  const rows: DecisionRow[] = [];
  chain.forEach((t) => {
    const runs = idx.runsByTicket(t.id);
    const run = runs[runs.length - 1];
    if (!run) return;
    const v = extractVerdict(run.work_product);
    const agent = idx.agent(run.agent_id);
    const role = agent ? agent.role : null;
    let verb: string;
    if (v.decision) {
      const map: Record<string, string> = { approve: "approve", ship: "ship", rework: "rework", escalate: "escalate", hold: "hold", reject: "reject" };
      verb = map[v.decision] || v.decision;
    } else {
      const built = t.phase_visit_count && Object.values(t.phase_visit_count)[0] > 1 ? "built (rework)" : "built";
      const map: Record<string, string> = { planner: "planned", eng: built, qa: "reviewed", ceo: run.status === "needs_approval" ? "awaiting ship approval" : "shipped" };
      verb = (role && map[role]) || "ran";
    }
    const reason = v.json && v.json.reasons && v.json.reasons[0] ? v.json.reasons[0] : (v.json && v.json.note ? v.json.note : null);
    rows.push({ ticket: t, run, agent, role, decision: v.decision, verb, reason, tokens: run.cost_tokens, ts: run.ended_at || run.started_at, status: run.status });
  });
  return rows;
}

export function goalCost(ticketId: number): { tokens: number; usd: number } {
  const chain = parentChain(ticketId);
  let toks = 0, dollars = 0;
  chain.forEach((t) => idx.runsByTicket(t.id).forEach((r) => { toks += r.cost_tokens || 0; dollars += r.cost_usd || 0; }));
  return { tokens: toks, usd: dollars };
}

export function latestRun(ticketId: number): Run | null {
  const runs = idx.runsByTicket(ticketId);
  return runs[runs.length - 1] || null;
}

export interface PriorVerdict extends ExtractedVerdict { ticket: Ticket; run: Run; agent: Agent | undefined; }
export function priorVerdict(ticketId: number): PriorVerdict | null {
  const chain = parentChain(ticketId);
  for (let i = chain.length - 2; i >= 0; i--) {
    const run = latestRun(chain[i].id);
    if (!run) continue;
    const v = extractVerdict(run.work_product);
    if (v.decision) return { ticket: chain[i], run, agent: idx.agent(run.agent_id), ...v };
  }
  return null;
}

// agent-as-speaker verdict phrasing (ported from ticket.jsx). Kept English (data vocab).
export function verdictSpeech(decision: string | null): string {
  switch (decision) {
    case "approve": return "reviewed and approved";
    case "rework": return "reviewed and requested rework";
    case "escalate": return "reviewed and escalated";
    case "ship": return "gave the go-ahead to ship";
    case "hold": return "held the ship";
    case "reject": return "rejected this";
    default: return "returned a decision";
  }
}

export { roleMeta };
export type { Decision };
