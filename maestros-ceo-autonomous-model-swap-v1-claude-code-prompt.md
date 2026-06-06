# MaestrOS — Autonomous CEO Model-Swap (v1)
## Claude Code Implementation Prompt

---

### Context & Goal

The CEO agent is becoming an **adaptive orchestrator**, not just a one-shot planner.
Its first management power: when a worker repeatedly fails review (a ticket hits
`max_reworks` for the review phase), the CEO **autonomously** judges whether the
worker's *model* is too weak and, if so, **swaps it for a stronger local model and
retries the build once** — instead of immediately blocking for human input.

The human (Sude) stays as the **board of directors**: she owns the outer budget
envelope and approves money-spending moves (cloud-model swaps). Everything inside
that envelope, the CEO runs on its own.

This is v1. Keep it small, transparent, and bounded.

---

### Design principles (read these before writing any code)

1. **Structured-decision, NOT tool-calling loops.**
   The CEO call returns a single JSON *decision*; the orchestrator code executes it.
   Reuse the exact pattern the QA Lead already uses to return `{"decision": "rework"}`.
   This fits the current adapter contract (`RunPacket → RunResult`), is fully visible
   in the Glass Box / audit log, and is far easier to debug than a multi-turn tool-use
   loop. Native tool-use is a deliberate **v2** upgrade — do not build it now.

2. **Defense in depth on autonomy.**
   The CEO is *told* in its prompt that it may only swap among **local** models, AND
   the service code *enforces* the same rule. Never trust the model alone to respect a
   money/safety boundary — the code is the real guardrail; the prompt is a hint.

3. **Bounded autonomy.**
   Max **1** CEO-initiated swap per ticket. After that, escalate to human. This is the
   same principle as `max_reworks`, now applied to the CEO itself so an autonomous
   manager can't loop forever swapping models.

4. **Nothing is silent.**
   Every CEO decision (action + reason) is written to the audit log and surfaced like
   any other run/event. The CEO's reasoning must always be visible.

---

### Aşama 1 — `swap_worker_model` service + validation

Add a service function (suggested: `app/services/agents.py` or wherever agent writes live):

```
async def swap_worker_model(
    session, *, agent_id: int, new_provider: str, new_model: str,
    initiated_by: str = "ceo",   # "ceo" | "human"
) -> Agent
```

Behavior:
- Load the agent; 404-style error if missing.
- **Validate the target model actually exists** by calling the provider's
  `list_models()` through the existing adapter registry (the dynamic discovery you
  built). Reject hallucinated model names. (This is exactly why you built the registry —
  now the CEO uses it.)
- **Enforce the autonomous boundary:** if `initiated_by == "ceo"` and `new_provider` is
  NOT in the local-allowed set (`{"ollama"}` for v1), raise/return a clear
  `needs_human_approval` error. A human-initiated swap may target any registered provider.
- Update `agent.provider` and `agent.model`.
- Write an **audit entry**: who/what initiated, old → new model, reason if provided.
- Return the updated agent.

Manual test surface (for Aşama 3 testing too):
- `POST /agents/{id}/swap-model` body `{new_provider, new_model}` → calls the service
  with `initiated_by="human"`.

**Acceptance (Aşama 1):**
- Swap agent 2 from `ollama/qwen2.5-coder:7b-instruct-q4_K_M` → `ollama/qwen2.5-coder:14b`
  via the endpoint succeeds and is audited.
- A nonexistent model name is rejected.
- A `ceo`-initiated swap to a cloud provider (e.g. `anthropic`) is rejected with
  `needs_human_approval`.

---

### Aşama 2 — `ceo_adjudicate_blocked_ticket` (the CEO brain)

Add a function (suggested: `app/services/ceo.py`):

```
async def ceo_adjudicate_blocked_ticket(session, *, ticket_id: int) -> CeoDecision
```

Gather context for the CEO:
- The ticket spec / original input.
- The worker's attempts (work products from the build runs).
- The QA verdicts / rework feedback for this ticket.
- The worker agent: its role, current provider/model.
- The **available stronger local models** for that role's provider, via `list_models()`.
- The rework history (how many times, what kept failing).

Build a CEO prompt (system + user). The CEO's role: **orchestrator / CEO of the AI
company**. Instruct it to:
- Classify the failure as one of: `capability_gap` | `spec_ambiguity` | `genuinely_hard`.
- Choose ONE action accordingly.
- Output **strictly** the JSON below and nothing else (no prose, no fences):

```json
{
  "action": "swap_model | escalate_human | replan",
  "target_agent_id": 0,
  "new_provider": "ollama",
  "new_model": "qwen2.5-coder:14b",
  "reason": "one short sentence"
}
```

- Tell it explicitly: it may only choose `swap_model` toward a **local** model from the
  provided roster. For anything needing a paid/cloud model, it must `escalate_human`.

Execution:
- Call the CEO **through its own agent's adapter** (the CEO agent should be configured
  with the `anthropic` provider so this works inside Docker with an env-var API key —
  the in-container, policy-aligned path).
- Parse the JSON from `RunResult.work_product` using the **same verdict-parsing helper**
  the QA flow uses (strip ``` fences, `json.loads`, validate keys).
- Validate the decision: if `swap_model`, confirm `target_agent_id` exists and
  `new_provider/new_model` is in the allowed local roster; otherwise downgrade to
  `escalate_human`.

**Acceptance (Aşama 2):**
- Given the blocked health-check ticket, the function returns a well-formed decision.
- On that ticket (worker = qwen-7b producing dummy `get_db`, un-awaited `ping`) the CEO
  should reasonably pick `swap_model` → `qwen2.5-coder:14b` with a `capability_gap` reason.
  (Don't hard-code this — verify the *reasoning* lands there.)

---

### Aşama 3 — `handle_max_reworks_block` wiring + trigger

Add a per-ticket swap counter:
- Alembic migration: add `ceo_swaps_used INT NOT NULL DEFAULT 0` to the ticket model.

Add the orchestrator function:

```
async def handle_max_reworks_block(session, *, ticket_id: int) -> None
```

Logic:
1. If `ticket.ceo_swaps_used >= 1` → block for human as today, with reason
   `"max_reworks exceeded; CEO swap budget exhausted"`. Stop.
2. Else call `ceo_adjudicate_blocked_ticket`.
3. Execute the decision:
   - `swap_model` → call `swap_worker_model(initiated_by="ceo", ...)`, increment
     `ceo_swaps_used`, **reset the review rework counter**, **re-queue the ticket to the
     build phase**, and audit the CEO decision + reason (Glass Box).
   - `escalate_human` / `replan` → block (or route to planner) as appropriate, with the
     CEO's `reason` attached so the human sees *why* the CEO gave up.

Trigger — two paths, build both:
- **Manual (test first):** `POST /tickets/{id}/ceo-adjudicate` → calls
  `handle_max_reworks_block`. Use this to watch the CEO act on the existing blocked ticket
  before letting it fire automatically.
- **Auto (flip on after manual testing):** at the existing point in the scheduler/workflow
  where a ticket is set to `blocked` with reason `"max_reworks (N) exceeded for review"`,
  instead call `handle_max_reworks_block` FIRST — but only when feature flag
  `CEO_AUTONOMOUS_SWAP` is true (default **false**). When the flag is off, behavior is
  exactly as today.

**Acceptance (Aşama 3):**
- Manual `POST /tickets/{id}/ceo-adjudicate` on a maxed-out ticket → CEO swaps the worker
  7b → 14b, the ticket re-runs its build with the 14b model, and you can watch the new
  build → review in Live Ops / decision history. The audit log shows the CEO's decision
  and reason.
- A second failure on the same ticket → human block (swap budget exhausted), with reason.
- With `CEO_AUTONOMOUS_SWAP=false`, the system behaves exactly as it does now.

---

### Guardrails that MUST hold (re-check after implementing)

- Autonomous (`ceo`) swap: local provider only. Cloud ⇒ `needs_human_approval`.
- ≤ 1 CEO swap per ticket, then human.
- The outer total budget envelope is unchanged and the CEO cannot raise it.
- Every CEO decision is audited and visible.

### Explicitly out of scope (v2+, do NOT build now)

- Native tool-calling / multi-turn tool-use loop.
- CEO hiring brand-new agents (only swaps an existing worker's model).
- Cloud-model swaps on the autonomous path.
- CEO adjusting budgets or rework limits.
- Multi-step CEO planning / re-spec authoring.

### Suggested commit sequence

1. Aşama 1: service + endpoint → test the three acceptance cases.
2. Aşama 2: CEO brain → test as a *dry run* (return + log the decision, don't act yet).
3. Aşama 3: wiring with the **manual** trigger → test on the existing blocked ticket.
4. Flip `CEO_AUTONOMOUS_SWAP=true` → watch one real auto-recovery, then decide if you
   trust it on by default.
