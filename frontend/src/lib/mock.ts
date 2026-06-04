/* MaestrOS — mock data layer (standalone mode).
   Ported from the prototype's window.DB. Same data, now typed + ES-exported.
   queries.ts reads this when VITE_USE_MOCK === "true"; in live mode the same
   shapes come from api.ts instead, so components never change. */
import type {
  Company, Skill, Agent, Workflow, Phase, ContextDocument, Ticket, Run, AuditEvent, ActivityEvent, CreateTicketInput,
} from "./types";

// ---- Companies ------------------------------------------------------------
const companies = [
  { id: 1, name: "Helios Labs",        budget_usd_limit: 50,   budget_period: "monthly", cost_spent_period: 18.40 },
  { id: 2, name: "Northwind Robotics", budget_usd_limit: 30,   budget_period: "monthly", cost_spent_period: 9.05 },
  { id: 3, name: "Vega Systems",       budget_usd_limit: 25,   budget_period: "daily",   cost_spent_period: 23.10 }, // near cap (92%)
];

  // ---- Skills (versioned markdown system prompts) ---------------------------
  const skills = [
    { id: 1, name: "planning", version: "v3", markdown_body: "# Planning role\nDecompose the goal into a build-ready spec. Emit acceptance criteria. Never write code." },
    { id: 2, name: "engineering", version: "v5", markdown_body: "# Engineering role\nImplement the spec exactly. Patch, don't rewrite, on rework iterations. Touch only files named in the spec." },
    { id: 3, name: "qa_review", version: "v4", markdown_body: "# QA review role\nVerify against acceptance criteria. Emit a ```verdict block with decision approve|rework|escalate." },
    { id: 4, name: "ceo_ship", version: "v2", markdown_body: "# CEO ship role\nFinal go/no-go. Emit a ```verdict block with decision ship|hold." },
  ];

  // ---- Agents ---------------------------------------------------------------
  // Each agent is a CHARACTER: a role, a brain (model), a wallet (budget), a chain of command.
  // role titles: planner→"Lead Planner", eng→"Senior Engineer", qa→"QA Reviewer", ceo→"Chief Executive"
  const agents = [
    // ===== Helios Labs — CEO Helm at top; planner/eng/qa report to Helm =====
    { id: 14, company_id: 1, role: "ceo", title: "Helm", char_title: "Chief Executive", provider: "openrouter", model: "anthropic/claude-haiku-4.5", params: { max_tokens: 4096, temperature: 0.4 }, default_skill_id: 4,
      status: "active", reporting_to: null, budget_usd_limit: 20, budget_period: "monthly", cost_spent_period: 6.05, paused_reason: null }, // healthy cloud, 30% green, "shipping"
    { id: 11, company_id: 1, role: "planner", title: "Atlas", char_title: "Lead Planner", provider: "anthropic", model: "claude-sonnet-4", params: { max_tokens: 8192, temperature: 0.3 }, default_skill_id: 1,
      status: "active", reporting_to: 14, budget_usd_limit: 5, budget_period: "daily", cost_spent_period: 1.10, paused_reason: null }, // 22% green, idle
    { id: 12, company_id: 1, role: "eng", title: "Forge", char_title: "Senior Engineer", provider: "ollama", model: "qwen2.5-coder:14b", params: { num_ctx: 32768, temperature: 0.2 }, default_skill_id: 2,
      status: "active", reporting_to: 14, budget_usd_limit: null, budget_period: "daily", cost_spent_period: 0.0, paused_reason: null }, // local, no cap, "drafting"
    { id: 13, company_id: 1, role: "qa", title: "Sentinel", char_title: "QA Reviewer", provider: "anthropic", model: "claude-sonnet-4", params: { max_tokens: 4096, temperature: 0.1 }, default_skill_id: 3,
      status: "active", reporting_to: 14, budget_usd_limit: 3, budget_period: "daily", cost_spent_period: 0.97, paused_reason: null }, // 32% green, idle

    // ===== Northwind Robotics =====
    { id: 24, company_id: 2, role: "ceo", title: "Captain", char_title: "Chief Executive", provider: "openrouter", model: "anthropic/claude-haiku-4.5", params: { max_tokens: 4096 }, default_skill_id: 4,
      status: "active", reporting_to: null, budget_usd_limit: 15, budget_period: "monthly", cost_spent_period: 3.40, paused_reason: null },
    { id: 21, company_id: 2, role: "planner", title: "Beacon", char_title: "Lead Planner", provider: "anthropic", model: "claude-sonnet-4", params: {}, default_skill_id: 1,
      status: "active", reporting_to: 24, budget_usd_limit: 4, budget_period: "daily", cost_spent_period: 0.62, paused_reason: null },
    { id: 22, company_id: 2, role: "eng", title: "Bolt", char_title: "Senior Engineer", provider: "ollama", model: "deepseek-coder-v2:16b", params: { num_ctx: 16384 }, default_skill_id: 2,
      status: "active", reporting_to: 24, budget_usd_limit: null, budget_period: "daily", cost_spent_period: 0.0, paused_reason: null }, // local, idle
    { id: 23, company_id: 2, role: "qa", title: "Audit", char_title: "QA Reviewer", provider: "anthropic", model: "claude-sonnet-4", params: { max_tokens: 4096 }, default_skill_id: 3,
      status: "active", reporting_to: 24, budget_usd_limit: 2, budget_period: "daily", cost_spent_period: 1.76, paused_reason: null }, // 88% amber, "reviewing"

    // ===== Vega Systems — the 2am fire =====
    { id: 34, company_id: 3, role: "ceo", title: "Director", char_title: "Chief Executive", provider: "openrouter", model: "anthropic/claude-haiku-4.5", params: { max_tokens: 4096 }, default_skill_id: 4,
      status: "paused", reporting_to: null, budget_usd_limit: 5, budget_period: "daily", cost_spent_period: 5.01,
      paused_reason: "budget exhausted: $5.01 >= $5.00 daily" }, // PAUSED for budget, red full
    { id: 31, company_id: 3, role: "planner", title: "Compass", char_title: "Lead Planner", provider: "anthropic", model: "claude-sonnet-4", params: {}, default_skill_id: 1,
      status: "active", reporting_to: 34, budget_usd_limit: 4, budget_period: "daily", cost_spent_period: 0.21, paused_reason: null },
    { id: 32, company_id: 3, role: "eng", title: "Anvil", char_title: "Senior Engineer", provider: "ollama", model: "qwen2.5-coder:32b", params: { num_ctx: 32768 }, default_skill_id: 2,
      status: "active", reporting_to: 34, budget_usd_limit: null, budget_period: "daily", cost_spent_period: 0.0, paused_reason: null }, // local, "blocked"
    { id: 33, company_id: 3, role: "qa", title: "Probe", char_title: "QA Reviewer", provider: "anthropic", model: "claude-sonnet-4", params: { max_tokens: 4096 }, default_skill_id: 3,
      status: "active", reporting_to: 34, budget_usd_limit: 6, budget_period: "daily", cost_spent_period: 2.55, paused_reason: null }, // "verifying"
    // a fired crew member — kept in roster history, dimmed
    { id: 35, company_id: 3, role: "eng", title: "Rivet", char_title: "Junior Engineer", provider: "ollama", model: "codellama:13b", params: {}, default_skill_id: 2,
      status: "terminated", reporting_to: 34, budget_usd_limit: 3, budget_period: "daily", cost_spent_period: 0.0,
      paused_reason: "terminated by operator — superseded by Anvil (qwen2.5-coder:32b)" },
  ];

  // ---- Workflows + phases ---------------------------------------------------
  const workflows = [
    { id: 1, name: "standard_delivery", version: "v6", description: "plan → build → review → ship, with rework loop and a human ship gate" },
    { id: 2, name: "hotfix_express", version: "v2", description: "fast path: triage → patch → verify, human gate on verify" },
  ];

  const phases = [
    // workflow 1 — standard_delivery
    { id: 1, workflow_id: 1, ordinal: 0, name: "plan", skill_id: 1, gate: "auto", next_phase_id: 2, max_reworks: null, default_verdict: "approve", branch_on_verdict: {}, default_context_doc_names: ["project_context"] },
    { id: 2, workflow_id: 1, ordinal: 1, name: "build", skill_id: 2, gate: "auto", next_phase_id: 3, max_reworks: 3, default_verdict: "approve", branch_on_verdict: {}, default_context_doc_names: ["api_schema", "project_style"] },
    { id: 3, workflow_id: 1, ordinal: 2, name: "review", skill_id: 3, gate: "auto", next_phase_id: 4, max_reworks: 2, default_verdict: "approve", branch_on_verdict: { rework: "build", escalate: "ship" }, default_context_doc_names: ["project_style"] },
    { id: 4, workflow_id: 1, ordinal: 3, name: "ship", skill_id: 4, gate: "human_approval", next_phase_id: null, max_reworks: null, default_verdict: "ship", branch_on_verdict: { hold: "review" }, default_context_doc_names: [] },
    // workflow 2 — hotfix_express
    { id: 5, workflow_id: 2, ordinal: 0, name: "triage", skill_id: 1, gate: "auto", next_phase_id: 6, max_reworks: null, default_verdict: "approve", branch_on_verdict: {}, default_context_doc_names: ["project_context"] },
    { id: 6, workflow_id: 2, ordinal: 1, name: "patch", skill_id: 2, gate: "auto", next_phase_id: 7, max_reworks: 2, default_verdict: "approve", branch_on_verdict: {}, default_context_doc_names: ["api_schema"] },
    { id: 7, workflow_id: 2, ordinal: 2, name: "verify", skill_id: 3, gate: "human_approval", next_phase_id: null, max_reworks: 1, default_verdict: "approve", branch_on_verdict: { rework: "patch" }, default_context_doc_names: [] },
  ];

  // ---- Context documents ----------------------------------------------------
  const contextDocs = [
    { id: 1, company_id: 1, name: "api_schema", kind: "api_schema", body: "# API Schema\n`POST /oauth/device/code` → `{ device_code, user_code, verification_uri, interval }`\n`POST /oauth/token` (grant_type=device_code) → `{ access_token, refresh_token }`" },
    { id: 2, company_id: 1, name: "project_style", kind: "style_guide", body: "# Style Guide\n- TypeScript strict mode.\n- No default exports.\n- Errors via `Result<T, E>`; never throw across module boundaries." },
    { id: 3, company_id: 1, name: "project_context", kind: "project_context", body: "# Project Context\nHelios is a B2B identity platform. Auth surface is security-critical; all changes require QA sign-off and a human ship gate." },
    { id: 4, company_id: 3, name: "api_schema", kind: "api_schema", body: "# API Schema (incomplete)\nPayment webhook verification requires `WEBHOOK_SIGNING_SECRET` — **not present in this document**." },
  ];

  // ---- Tickets --------------------------------------------------------------
  // Helper to keep ISO timestamps relative to load time so the demo always feels fresh.
  const now = Date.now();
  const ago = (mins: number) => new Date(now - mins * 60000).toISOString();

  const tickets = [
    // ===== Helios — OAuth2 goal: full rework loop, ending at a human ship gate =====
    { id: 4001, company_id: 1, workflow_id: 1, current_phase_id: 1, parent_ticket_id: null, assignee_agent_id: 11, title: "Ship OAuth2 device-code login", body: "# Goal\nAdd OAuth2 **device-code** login so CLI users can authenticate without a browser redirect.\n\n## Acceptance criteria\n- `POST /oauth/device/code` issues a `user_code`\n- Polling `POST /oauth/token` returns tokens once approved\n- Tokens stored in the existing secure token store", status: "done", priority: 1, owner_agent_id: 14, locked_at: null, blocked_reason: null, context_doc_ids: [3], phase_visit_count: { plan: 1 }, created_at: ago(96) },
    { id: 4002, company_id: 1, workflow_id: 1, current_phase_id: 2, parent_ticket_id: 4001, assignee_agent_id: 12, title: "build: OAuth2 device-code login", body: "# Build task\nImplement the device-code flow per the plan. Files: `auth/device.ts`, `auth/token-store.ts`.\n\nFollow `api_schema` and `project_style` context docs.", status: "done", priority: 1, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [1, 2], phase_visit_count: { build: 1 }, created_at: ago(88) },
    { id: 4003, company_id: 1, workflow_id: 1, current_phase_id: 3, parent_ticket_id: 4002, assignee_agent_id: 13, title: "review: OAuth2 device-code login", body: "# Review task\nVerify the device-code implementation against acceptance criteria. Emit a verdict.", status: "done", priority: 1, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [2], phase_visit_count: { review: 1 }, created_at: ago(74) },
    { id: 4004, company_id: 1, workflow_id: 1, current_phase_id: 2, parent_ticket_id: 4003, assignee_agent_id: 12, title: "build (rework): OAuth2 device-code login", body: "# Rework Iteration 1\n\n## Original Input\nImplement the device-code flow per the plan.\n\n## Previous Attempt\n`auth/device.ts` stored the `device_code` in plaintext localStorage.\n\n## Feedback\nQA flagged: `device_code` must live in the secure token store, never localStorage. Refresh-token rotation missing.\n\n> Patch, don't rewrite. Touch only `auth/device.ts` and `auth/token-store.ts`.", status: "done", priority: 1, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [1, 2], phase_visit_count: { build: 2 }, created_at: ago(58) },
    { id: 4005, company_id: 1, workflow_id: 1, current_phase_id: 3, parent_ticket_id: 4004, assignee_agent_id: 13, title: "review: OAuth2 device-code login", body: "# Review task\nRe-verify after rework iteration 1. Emit a verdict.", status: "done", priority: 1, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [2], phase_visit_count: { review: 2 }, created_at: ago(34) },
    { id: 4006, company_id: 1, workflow_id: 1, current_phase_id: 4, parent_ticket_id: 4005, assignee_agent_id: 14, title: "ship: OAuth2 device-code login", body: "# Ship decision\nReview passed (approve) after one rework. Awaiting human ship approval — this touches the security-critical auth surface.", status: "needs_approval", priority: 1, owner_agent_id: 14, locked_at: ago(4), blocked_reason: null, context_doc_ids: [3], phase_visit_count: { ship: 1 }, created_at: ago(12) },

    // ===== Helios — two builds running right now =====
    { id: 4101, company_id: 1, workflow_id: 1, current_phase_id: 1, parent_ticket_id: null, assignee_agent_id: 11, title: "Add rate limiting to public API", body: "# Goal\nToken-bucket rate limiting on all public endpoints, 100 req/min/key.", status: "done", priority: 2, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [3], phase_visit_count: { plan: 1 }, created_at: ago(40) },
    { id: 4102, company_id: 1, workflow_id: 1, current_phase_id: 2, parent_ticket_id: 4101, assignee_agent_id: 12, title: "build: rate limiting middleware", body: "# Build task\nImplement token-bucket middleware. Files: `mw/rate-limit.ts`.", status: "running", priority: 2, owner_agent_id: null, locked_at: ago(1), blocked_reason: null, context_doc_ids: [1, 2], phase_visit_count: { build: 1 }, created_at: ago(9) },
    { id: 4201, company_id: 1, workflow_id: 1, current_phase_id: 2, parent_ticket_id: null, assignee_agent_id: 12, title: "build: refactor token store to KMS", body: "# Build task\nMove token encryption keys to KMS. Files: `auth/token-store.ts`, `infra/kms.ts`.", status: "running", priority: 2, owner_agent_id: null, locked_at: ago(0.5), blocked_reason: null, context_doc_ids: [2], phase_visit_count: { build: 1 }, created_at: ago(6) },

    // ===== Northwind — clean, shipped =====
    { id: 5001, company_id: 2, workflow_id: 1, current_phase_id: 1, parent_ticket_id: null, assignee_agent_id: 21, title: "Nightly Postgres backup job", body: "# Goal\npg_dump nightly to object storage, 30-day retention, alert on failure.", status: "done", priority: 3, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { plan: 1 }, created_at: ago(150) },
    { id: 5002, company_id: 2, workflow_id: 1, current_phase_id: 2, parent_ticket_id: 5001, assignee_agent_id: 22, title: "build: nightly backup job", body: "# Build task\nImplement the cron job and retention sweep.", status: "done", priority: 3, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { build: 1 }, created_at: ago(140) },
    { id: 5003, company_id: 2, workflow_id: 1, current_phase_id: 3, parent_ticket_id: 5002, assignee_agent_id: 23, title: "review: nightly backup job", body: "# Review task\nVerify backup + restore round-trip.", status: "done", priority: 3, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { review: 1 }, created_at: ago(128) },
    { id: 5004, company_id: 2, workflow_id: 1, current_phase_id: 4, parent_ticket_id: 5003, assignee_agent_id: 24, title: "ship: nightly backup job", body: "# Ship decision\nApproved and shipped. Restore verified on staging.", status: "done", priority: 3, owner_agent_id: 24, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { ship: 1 }, created_at: ago(120) },
    { id: 5101, company_id: 2, workflow_id: 1, current_phase_id: 1, parent_ticket_id: null, assignee_agent_id: 21, title: "Add /health readiness endpoint", body: "# Goal\nKubernetes readiness + liveness probes.", status: "done", priority: 4, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { plan: 1 }, created_at: ago(30) },
    { id: 5102, company_id: 2, workflow_id: 1, current_phase_id: 2, parent_ticket_id: 5101, assignee_agent_id: 22, title: "build: /health endpoint", body: "# Build task\nImplement `/health` returning dependency checks.", status: "done", priority: 4, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { build: 1 }, created_at: ago(22) },
    { id: 5103, company_id: 2, workflow_id: 1, current_phase_id: 3, parent_ticket_id: 5102, assignee_agent_id: 23, title: "review: /health endpoint", body: "# Review task\nVerify probe semantics under dependency outage.", status: "running", priority: 4, owner_agent_id: null, locked_at: ago(0.7), blocked_reason: null, context_doc_ids: [], phase_visit_count: { review: 1 }, created_at: ago(5) },

    // ===== Vega — the 2am fire: blocked + error + a human gate =====
    { id: 6001, company_id: 3, workflow_id: 2, current_phase_id: 5, parent_ticket_id: null, assignee_agent_id: 31, title: "Hotfix: payment webhook returning 500", body: "# Goal\nProd payment webhooks 500 on signature verification. Restore processing ASAP.", status: "done", priority: 0, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [4], phase_visit_count: { triage: 1 }, created_at: ago(46) },
    { id: 6002, company_id: 3, workflow_id: 2, current_phase_id: 6, parent_ticket_id: 6001, assignee_agent_id: 32, title: "patch: payment webhook signature verify", body: "# Patch task\nFix signature verification on the payment webhook.\n\nNeeds `WEBHOOK_SIGNING_SECRET` from the `api_schema` context doc.", status: "blocked", priority: 0, owner_agent_id: null, locked_at: ago(18), blocked_reason: "Context doc 'api_schema' is missing WEBHOOK_SIGNING_SECRET — the agent cannot author signature verification without it. Human input required: add the secret to the context doc or provide it out-of-band.", context_doc_ids: [4], phase_visit_count: { patch: 1 }, created_at: ago(38) },
    { id: 6003, company_id: 3, workflow_id: 2, current_phase_id: 6, parent_ticket_id: null, assignee_agent_id: 32, title: "patch: cache invalidation race", body: "# Patch task\nFix the stale-cache race on product price updates.", status: "error", priority: 1, owner_agent_id: null, locked_at: null, blocked_reason: null, context_doc_ids: [], phase_visit_count: { patch: 1 }, created_at: ago(52) },
    { id: 6101, company_id: 3, workflow_id: 2, current_phase_id: 7, parent_ticket_id: null, assignee_agent_id: 33, title: "verify: refund flow idempotency", body: "# Verify task\nConfirm refund flow is idempotent under retries. Human gate before close.", status: "needs_approval", priority: 1, owner_agent_id: 33, locked_at: ago(7), blocked_reason: null, context_doc_ids: [], phase_visit_count: { verify: 1 }, created_at: ago(20) },
  ];

  // ---- Runs -----------------------------------------------------------------
  const V = (obj: unknown) => "\n\n```verdict\n" + JSON.stringify(obj, null, 2) + "\n```\n";
  const runs = [
    // OAuth chain
    { id: 7001, ticket_id: 4001, agent_id: 11, status: "done", work_product: "## Plan\nDecomposed into build + review + ship. Acceptance criteria attached to the goal. Hand off to engineering.", logs: ["loaded skill planning@v3", "injected context: project_context", "emitted spec, 3 acceptance criteria"], cost_tokens: 3210, cost_usd: 0.0096, started_at: ago(95), ended_at: ago(94) },
    { id: 7002, ticket_id: 4002, agent_id: 12, status: "done", work_product: "## Build\nImplemented `auth/device.ts` and wired into `auth/token-store.ts`.\n\n```ts\nexport async function startDeviceFlow(): Promise<DeviceCode> { /* ... */ }\n```\n\nDevice code persisted client-side for polling.", logs: ["loaded skill engineering@v5", "injected context: api_schema, project_style", "wrote 2 files", "ran type-check: pass"], cost_tokens: 18420, cost_usd: 0.0000, started_at: ago(86), ended_at: ago(82) },
    { id: 7003, ticket_id: 4003, agent_id: 13, status: "done", work_product: "## Review\nAcceptance criteria 1 & 2 met. **Security issue**: `device_code` is persisted to `localStorage` in plaintext — must use the secure token store. Refresh-token rotation is also missing.\n\nVerdict: rework." + V({ decision: "rework", reasons: ["device_code stored in plaintext localStorage", "refresh-token rotation missing"], target_phase: "build" }), logs: ["loaded skill qa_review@v4", "ran acceptance checks", "2 failures"], cost_tokens: 5410, cost_usd: 0.0162, started_at: ago(73), ended_at: ago(72) },
    { id: 7004, ticket_id: 4004, agent_id: 12, status: "done", work_product: "## Build — rework iteration 1\nPatched per feedback: `device_code` now stored via `token-store.put()` (encrypted), added refresh-token rotation. Did not rewrite — diff touches only the two named files.", logs: ["loaded skill engineering@v5", "rework body parsed: iteration 1", "patched 2 files", "type-check: pass"], cost_tokens: 12030, cost_usd: 0.0000, started_at: ago(57), ended_at: ago(54) },
    { id: 7005, ticket_id: 4005, agent_id: 13, status: "done", work_product: "## Review — pass\nAll acceptance criteria met. `device_code` now in the secure store; rotation present. No regressions.\n\nVerdict: approve." + V({ decision: "approve", reasons: ["all acceptance criteria met", "security findings resolved"], target_phase: "ship" }), logs: ["loaded skill qa_review@v4", "ran acceptance checks", "all pass"], cost_tokens: 4830, cost_usd: 0.0145, started_at: ago(33), ended_at: ago(32) },
    { id: 7006, ticket_id: 4006, agent_id: 14, status: "needs_approval", work_product: "## Ship recommendation\nReview approved after one rework. Recommend ship. Because this touches the auth surface, routing to the **human ship gate** for final go/no-go.\n\nVerdict: ship." + V({ decision: "ship", confidence: 0.86, note: "human gate required per project_context" }), logs: ["loaded skill ceo_ship@v2", "gate=human_approval → awaiting operator"], cost_tokens: 2240, cost_usd: 0.0067, started_at: ago(12), ended_at: ago(11) },

    // Rate limiting (running build, no ended_at yet)
    { id: 7101, ticket_id: 4101, agent_id: 11, status: "done", work_product: "## Plan\nToken-bucket, 100 rpm/key, 429 with Retry-After.", logs: ["loaded skill planning@v3"], cost_tokens: 2890, cost_usd: 0.0087, started_at: ago(39), ended_at: ago(38) },
    { id: 7102, ticket_id: 4102, agent_id: 12, status: "running", work_product: "", logs: ["loaded skill engineering@v5", "injected context: api_schema, project_style", "writing mw/rate-limit.ts ..."], cost_tokens: 6100, cost_usd: 0.0, started_at: ago(1), ended_at: null },
    { id: 7201, ticket_id: 4201, agent_id: 12, status: "running", work_product: "", logs: ["loaded skill engineering@v5", "planning KMS key migration ..."], cost_tokens: 4300, cost_usd: 0.0, started_at: ago(0.5), ended_at: null },

    // Northwind clean chain
    { id: 7501, ticket_id: 5001, agent_id: 21, status: "done", work_product: "## Plan\nNightly pg_dump + retention sweep + failure alert.", logs: [], cost_tokens: 2600, cost_usd: 0.0078, started_at: ago(149), ended_at: ago(148) },
    { id: 7502, ticket_id: 5002, agent_id: 22, status: "done", work_product: "## Build\nCron + retention implemented.", logs: ["type-check: pass"], cost_tokens: 9800, cost_usd: 0.0, started_at: ago(139), ended_at: ago(135) },
    { id: 7503, ticket_id: 5003, agent_id: 23, status: "done", work_product: "## Review\nRestore round-trip verified.\n\nVerdict: approve." + V({ decision: "approve", target_phase: "ship" }), logs: [], cost_tokens: 4100, cost_usd: 0.0123, started_at: ago(127), ended_at: ago(126) },
    { id: 7504, ticket_id: 5004, agent_id: 24, status: "done", work_product: "## Ship\nApproved and shipped.\n\nVerdict: ship." + V({ decision: "ship" }), logs: ["operator approved"], cost_tokens: 1900, cost_usd: 0.0057, started_at: ago(120), ended_at: ago(119) },
    { id: 7511, ticket_id: 5102, agent_id: 22, status: "done", work_product: "## Build\n`/health` implemented with dependency checks.", logs: ["type-check: pass"], cost_tokens: 7200, cost_usd: 0.0, started_at: ago(21), ended_at: ago(18) },
    { id: 7512, ticket_id: 5103, agent_id: 23, status: "running", work_product: "", logs: ["loaded skill qa_review@v4", "simulating dependency outage ..."], cost_tokens: 3300, cost_usd: 0.0, started_at: ago(0.7), ended_at: null },

    // Vega fire
    { id: 7601, ticket_id: 6001, agent_id: 31, status: "done", work_product: "## Triage\nSignature verification regressed after a dependency bump. Hand to patch.", logs: [], cost_tokens: 2100, cost_usd: 0.0063, started_at: ago(45), ended_at: ago(44) },
    { id: 7602, ticket_id: 6002, agent_id: 32, status: "blocked", work_product: "## Patch — blocked\nCannot author signature verification: `WEBHOOK_SIGNING_SECRET` absent from the `api_schema` context doc. Escalating to human.", logs: ["loaded skill engineering@v5", "injected context: api_schema", "ERROR: required secret not found → block"], cost_tokens: 1500, cost_usd: 0.0, started_at: ago(19), ended_at: ago(18) },
    { id: 7603, ticket_id: 6003, agent_id: 32, status: "error", work_product: "## Patch — error\nModel call failed: provider timeout after 3 retries.", logs: ["loaded skill engineering@v5", "provider ollama timeout", "retry 1/3", "retry 2/3", "retry 3/3", "give up → error"], cost_tokens: 800, cost_usd: 0.0, started_at: ago(53), ended_at: ago(51) },
    { id: 7611, ticket_id: 6101, agent_id: 33, status: "needs_approval", work_product: "## Verify\nRefund flow appears idempotent across 1k simulated retries. Human gate before close.\n\nVerdict: approve." + V({ decision: "approve", note: "human gate on verify phase" }), logs: ["loaded skill qa_review@v4", "1000 retry simulations, 0 double-refunds", "gate=human_approval"], cost_tokens: 5600, cost_usd: 0.0168, started_at: ago(20), ended_at: ago(19) },
  ];

  // ---- Activity events (Live Ops) ------------------------------------------
  // Derived feed; each references a ticket. tAgo = seconds ago at load.
  const events = [
    { id: 9001, tAgo: 6, agent_id: 12, action: "claimed", ticket_id: 4201, status: "running", cost_tokens: 0 },
    { id: 9002, tAgo: 30, agent_id: 12, action: "claimed", ticket_id: 4102, status: "running", cost_tokens: 0 },
    { id: 9003, tAgo: 42, agent_id: 23, action: "claimed", ticket_id: 5103, status: "running", cost_tokens: 0 },
    { id: 9004, tAgo: 240, agent_id: 14, action: "needs_approval", ticket_id: 4006, status: "needs_approval", cost_tokens: 2240 },
    { id: 9005, tAgo: 420, agent_id: 33, action: "needs_approval", ticket_id: 6101, status: "needs_approval", cost_tokens: 5600 },
    { id: 9006, tAgo: 1080, agent_id: 32, action: "blocked", ticket_id: 6002, status: "blocked", cost_tokens: 1500 },
    { id: 9007, tAgo: 1140, agent_id: 13, action: "done", ticket_id: 4005, status: "done", cost_tokens: 4830 },
    { id: 9008, tAgo: 1200, agent_id: 23, action: "done", ticket_id: 5102, status: "done", cost_tokens: 7200 },
    { id: 9009, tAgo: 1320, agent_id: 12, action: "done", ticket_id: 4004, status: "done", cost_tokens: 12030 },
    { id: 9010, tAgo: 1380, agent_id: 22, action: "claimed", ticket_id: 5102, status: "running", cost_tokens: 0 },
    { id: 9011, tAgo: 2280, agent_id: 13, action: "done", ticket_id: 4003, status: "done", cost_tokens: 5410 },
    { id: 9012, tAgo: 2400, agent_id: 31, action: "done", ticket_id: 6001, status: "done", cost_tokens: 2100 },
    { id: 9013, tAgo: 2760, agent_id: 11, action: "done", ticket_id: 4101, status: "done", cost_tokens: 2890 },
    { id: 9014, tAgo: 3060, agent_id: 32, action: "error", ticket_id: 6003, status: "error", cost_tokens: 800 },
    { id: 9015, tAgo: 4920, agent_id: 12, action: "done", ticket_id: 4002, status: "done", cost_tokens: 18420 },
    { id: 9016, tAgo: 5640, agent_id: 11, action: "done", ticket_id: 4001, status: "done", cost_tokens: 3210 },
    { id: 9017, tAgo: 7140, agent_id: 24, action: "done", ticket_id: 5004, status: "done", cost_tokens: 1900 },
    { id: 9018, tAgo: 7560, agent_id: 23, action: "done", ticket_id: 5003, status: "done", cost_tokens: 4100 },
    { id: 9019, tAgo: 8100, agent_id: 22, action: "done", ticket_id: 5002, status: "done", cost_tokens: 9800 },
    { id: 9020, tAgo: 8880, agent_id: 21, action: "done", ticket_id: 5001, status: "done", cost_tokens: 2600 },
  ];

  // Templates for the simulated live feed (new events injected over time).
  const liveTemplates = [
    { agent_id: 12, action: "log", ticket_id: 4102, status: "running", cost_tokens: 0, note: "wrote mw/rate-limit.ts" },
    { agent_id: 12, action: "log", ticket_id: 4201, status: "running", cost_tokens: 0, note: "drafting infra/kms.ts" },
    { agent_id: 23, action: "log", ticket_id: 5103, status: "running", cost_tokens: 0, note: "outage simulation 3/5" },
    { agent_id: 12, action: "tick", ticket_id: 4102, status: "running", cost_tokens: 0, note: "type-check pass" },
  ];

  // ---- Audit events (immutable governance record) ---------------------------
  // NOTE: in the live backend this becomes a dedicated audit_log table with explicit
  // event emission. Some events are derivable from runs+ticket status, but operator
  // decisions and config changes are NOT logged yet — see README "open question".
  const auditEvents = [
    { id: 8001, tAgo: 240,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "approved",      target_kind: "ticket",  target_id: 5004, target_label: "ship: nightly backup job",        detail: "approved ship — restore verified on staging", company_id: 2 },
    { id: 8002, tAgo: 1140, actor_kind: "agent",    actor_id: 24,   actor_label: "Captain",  action: "shipped",       target_kind: "ticket",  target_id: 5004, target_label: "Nightly Postgres backup job",       detail: "CEO verdict: ship", company_id: 2 },
    { id: 8003, tAgo: 18,   actor_kind: "agent",    actor_id: 13,   actor_label: "Sentinel", action: "approved",      target_kind: "ticket",  target_id: 4005, target_label: "review: OAuth2 device-code login",   detail: "QA verdict: approve — all acceptance criteria met after 1 rework", company_id: 1 },
    { id: 8004, tAgo: 38,   actor_kind: "agent",    actor_id: 13,   actor_label: "Sentinel", action: "requested_rework", target_kind: "ticket", target_id: 4003, target_label: "review: OAuth2 device-code login", detail: "QA verdict: rework — device_code in plaintext localStorage; refresh rotation missing", company_id: 1 },
    { id: 8005, tAgo: 11,   actor_kind: "agent",    actor_id: 14,   actor_label: "Helm",     action: "awaiting_approval", target_kind: "ticket", target_id: 4006, target_label: "ship: OAuth2 device-code login", detail: "CEO routed to human ship gate — auth surface", company_id: 1 },
    { id: 8006, tAgo: 7,    actor_kind: "agent",    actor_id: 33,   actor_label: "Probe",    action: "awaiting_approval", target_kind: "ticket", target_id: 6101, target_label: "verify: refund flow idempotency", detail: "QA verdict: approve — human gate on verify phase", company_id: 3 },
    { id: 8007, tAgo: 18,   actor_kind: "system",   actor_id: null, actor_label: "scheduler", action: "blocked",      target_kind: "ticket",  target_id: 6002, target_label: "patch: payment webhook signature verify", detail: "blocked: WEBHOOK_SIGNING_SECRET missing from api_schema context doc", company_id: 3 },
    { id: 8008, tAgo: 51,   actor_kind: "system",   actor_id: null, actor_label: "scheduler", action: "error",        target_kind: "ticket",  target_id: 6003, target_label: "patch: cache invalidation race", detail: "provider ollama timeout after 3 retries", company_id: 3 },
    { id: 8009, tAgo: 60,   actor_kind: "system",   actor_id: null, actor_label: "budget",    action: "paused_budget", target_kind: "agent",  target_id: 34,   target_label: "Director",                         detail: "paused: budget exhausted $5.01 ≥ $5.00 daily", company_id: 3 },
    { id: 8010, tAgo: 62,   actor_kind: "system",   actor_id: null, actor_label: "budget",    action: "budget_exceeded", target_kind: "company", target_id: 3, target_label: "Vega Systems",                     detail: "daily spend $23.10 at 92% of $25.00 cap", company_id: 3 },
    { id: 8011, tAgo: 200,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "terminated",    target_kind: "agent",   target_id: 35,   target_label: "Rivet",                            detail: "terminated — superseded by Anvil (qwen2.5-coder:32b)", company_id: 3 },
    { id: 8012, tAgo: 210,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "hired",         target_kind: "agent",   target_id: 32,   target_label: "Anvil",                            detail: "hired Senior Engineer · ollama qwen2.5-coder:32b", company_id: 3 },
    { id: 8013, tAgo: 95,   actor_kind: "agent",    actor_id: 11,   actor_label: "Atlas",    action: "planned",       target_kind: "ticket",  target_id: 4001, target_label: "Ship OAuth2 device-code login",     detail: "planner emitted spec + 3 acceptance criteria", company_id: 1 },
    { id: 8014, tAgo: 320,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "edited",        target_kind: "agent",   target_id: 13,   target_label: "Sentinel",                         detail: "lowered temperature 0.2 → 0.1 for stricter review", company_id: 1 },
    { id: 8015, tAgo: 480,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "rejected",      target_kind: "ticket",  target_id: 4101, target_label: "Add rate limiting to public API",   detail: "rejected: spec ambiguous on burst window — clarify before build", company_id: 1 },
    { id: 8016, tAgo: 520,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "resumed",       target_kind: "agent",   target_id: 23,   target_label: "Audit",                            detail: "resumed after daily budget reset", company_id: 2 },
    { id: 8017, tAgo: 540,  actor_kind: "agent",    actor_id: 23,   actor_label: "Audit",    action: "approved",      target_kind: "ticket",  target_id: 5003, target_label: "review: nightly backup job",        detail: "QA verdict: approve — restore round-trip verified", company_id: 2 },
    { id: 8018, tAgo: 30,   actor_kind: "agent",    actor_id: 12,   actor_label: "Forge",    action: "claimed",       target_kind: "ticket",  target_id: 4102, target_label: "build: rate limiting middleware",   detail: "engineer claimed build task", company_id: 1 },
    { id: 8019, tAgo: 760,  actor_kind: "system",   actor_id: null, actor_label: "scheduler", action: "shipped",      target_kind: "ticket",  target_id: 5004, target_label: "Nightly Postgres backup job",       detail: "goal closed — shipped to production", company_id: 2 },
    { id: 8020, tAgo: 900,  actor_kind: "operator", actor_id: null, actor_label: "operator", action: "hired",         target_kind: "agent",   target_id: 14,   target_label: "Helm",                             detail: "hired Chief Executive · openrouter claude-haiku-4.5", company_id: 1 },
  ];

  // ---- Typed store + indexes ------------------------------------------------
  const byId = <T extends { id: number }>(arr: T[]): Record<number, T> =>
    arr.reduce((m, x) => { m[x.id] = x; return m; }, {} as Record<number, T>);

  // A mutable in-memory store mirroring the prototype's window.DB. Mutations write here.
  export const store = {
    loadedAt: now,
    companies: companies as unknown as Company[],
    skills: skills as unknown as Skill[],
    agents: agents as unknown as Agent[],
    workflows: workflows as unknown as Workflow[],
    phases: phases as unknown as Phase[],
    contextDocs: contextDocs as unknown as ContextDocument[],
    tickets: tickets as unknown as Ticket[],
    runs: runs as unknown as Run[],
    events: events as unknown as Array<Record<string, unknown>>,
    liveTemplates: liveTemplates as unknown as Array<Record<string, unknown>>,
    auditEvents: auditEvents as unknown as AuditEvent[],
  };

  // index caches (rebuilt after agent mutations)
  let agentsById = byId(store.agents);
  const skillsById = byId(store.skills);
  const phasesById = byId(store.phases);
  let ticketsById = byId(store.tickets);
  let companiesById = byId(store.companies);
  const workflowsById = byId(store.workflows);

  // ---- synchronous accessors (used by cross-entity helpers in helpers.ts) ---
  export const idx = {
    agent: (id: number): Agent | undefined => agentsById[id],
    skill: (id: number): Skill | undefined => skillsById[id],
    phase: (id: number): Phase | undefined => phasesById[id],
    ticket: (id: number): Ticket | undefined => ticketsById[id],
    company: (id: number): Company | undefined => companiesById[id],
    workflow: (id: number): Workflow | undefined => workflowsById[id],
    phasesByWorkflow: (wfId: number): Phase[] =>
      store.phases.filter((p) => p.workflow_id === wfId).sort((a, b) => a.ordinal - b.ordinal),
    runsByTicket: (tid: number): Run[] =>
      store.runs.filter((r) => r.ticket_id === tid).sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at)),
  };

  // ===========================================================================
  // Mock query functions — queries.ts calls these in standalone mode.
  // Each mirrors a live api.ts endpoint, returning a resolved Promise.
  // ===========================================================================
  const ok = <T>(v: T): Promise<T> => Promise.resolve(v);
  const scopedCompany = <T extends { company_id: number }>(arr: T[], companyId?: number | "all") =>
    companyId == null || companyId === "all" ? arr : arr.filter((x) => x.company_id === companyId);

  export const mock = {
    getCompanies: () => ok(store.companies.slice()),
    getAgents: (companyId?: number | "all") => ok(scopedCompany(store.agents, companyId).slice()),
    getSkills: () => ok(store.skills.slice()),
    getWorkflows: () => ok(store.workflows.slice()),
    getWorkflowWithPhases: (id: number) => ok({ ...workflowsById[id], phases: idx.phasesByWorkflow(id) }),
    getContextDocs: () => ok(store.contextDocs.slice()),
    getTickets: (companyId?: number | "all", status?: string) =>
      ok(scopedCompany(store.tickets, companyId).filter((t) => !status || t.status === status).slice()),
    getTicket: (id: number) => ok(ticketsById[id]),
    getRuns: (params: { ticket_id?: number; agent_id?: number } = {}) =>
      ok(store.runs
        .filter((r) => (params.ticket_id == null || r.ticket_id === params.ticket_id) && (params.agent_id == null || r.agent_id === params.agent_id))
        .sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at))),
    getAudit: (companyId?: number | "all") =>
      ok(store.auditEvents
        .filter((e) => companyId == null || companyId === "all" || e.company_id === companyId)
        .map((e) => ({ ...e, ts: store.loadedAt - (e as unknown as { tAgo: number }).tAgo * 1000 }))
        .sort((a, b) => (b.ts as number) - (a.ts as number)) as unknown as Array<AuditEvent & { ts: number }>),
    // seed feed for Live Ops (tAgo → absolute ms), newest first
    getActivitySeed: () =>
      ok(store.events
        .map((e) => ({ ...e, ts: store.loadedAt - (e as unknown as { tAgo: number }).tAgo * 1000 }))
        .sort((a, b) => (b.ts as number) - (a.ts as number)) as unknown as ActivityEvent[]),
    getLiveTemplates: () => store.liveTemplates as unknown as ActivityEvent[],
    testProvider: (_provider: string, _model: string) =>
      ok({ ok: true, message: "ok", latency_ms: 42, cost_usd: 0 }),
    getProviderModels: (provider: string) => ok(
      provider === "ollama"      ? ["qwen2.5-coder:14b", "llama3.1:latest", "gemma-msi:latest"]
      : provider === "anthropic" ? ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"]
      : /* openrouter */           ["anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4", "meta-llama/llama-3.3-70b-instruct"]
    ),

    // ---- mutations (Hire / Edit / Fire, approve / reject) -------------------
    nextAgentId: (() => { let n = 40; return () => ++n; })(),
    upsertAgent: (agent: Agent) => {
      const i = store.agents.findIndex((a) => a.id === agent.id);
      if (i >= 0) store.agents[i] = { ...store.agents[i], ...agent };
      else store.agents.push(agent);
      agentsById = byId(store.agents);
      return ok(agent);
    },
    setTicketStatus: (id: number, status: Ticket["status"]) => {
      const t = ticketsById[id];
      if (t) t.status = status;
      return ok(t);
    },
    nextTicketId: (() => { let n = 90000; return () => ++n; })(),
    createTicket: (input: CreateTicketInput) => {
      const ticket: Ticket = {
        id: mock.nextTicketId(),
        company_id: input.company_id,
        workflow_id: input.workflow_id ?? null,
        current_phase_id: input.current_phase_id ?? null,
        parent_ticket_id: null,
        assignee_agent_id: input.assignee_agent_id,
        title: input.title,
        body: input.body,
        status: "queued",
        priority: input.priority,
        owner_agent_id: null,
        locked_at: null,
        blocked_reason: null,
        context_doc_ids: input.context_doc_ids ?? [],
        phase_visit_count: {},
        created_at: new Date().toISOString(),
      };
      store.tickets.unshift(ticket);
      ticketsById[ticket.id] = ticket;
      return ok(ticket);
    },
  };

  // ---- Live-mode store sync (Part 3) -----------------------------------------
  // Called from queries.ts when live data arrives so idx.* helpers work with
  // real backend data.  Components and helpers never change — the call sites
  // (by id) stay identical whether data comes from mock or live API.

  export function syncLiveAgents(agents: Agent[]): void {
    store.agents = agents;
    agentsById = byId(agents);
  }

  export function syncLiveCompanies(companies: Company[]): void {
    store.companies = companies;
    companiesById = byId(companies);
  }

  export function syncLiveTickets(tickets: Ticket[]): void {
    store.tickets = tickets;
    ticketsById = byId(tickets);
  }

  export function syncLiveRuns(runs: Run[]): void {
    store.runs = runs;
  }
