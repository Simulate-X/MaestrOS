# MaestrOS — Faz 5: Provider/model "Test" button (Claude Code)

> Run this **after** the `build_adapter` registry migration (so adapter construction is uniform). Adds a "Test" button next to the model field in `AgentEditModal` that checks whether the selected **provider + model** actually responds, before you hire/save the agent. **Edit files in place — do NOT regenerate the project.** No new libraries.

## Goal

A small "does this provider + model actually work?" check. Click **Test** → the backend constructs the chosen adapter, sends a tiny prompt, and reports success (with latency) or the error. It's a **connectivity/config check, not real work** — so it must NOT create a Run record, write to audit, or charge any budget. It's ephemeral.

## 1. Backend — `POST /{provider}/test`

Add to `app/api/providers.py` (alongside the existing `GET /{provider}/models`):

```
POST /{provider}/test
body: { "model": str, "params": dict | null }
→ 1. adapter_cls = ADAPTER_REGISTRY.get(provider)   # 404 if not found
  2. construct the adapter for this model+params
  3. run ONE trivial RunPacket
  4. return { ok, message, latency_ms, cost_usd }
```

**Construction (no full agent here — just provider+model):** reuse the registry. Since `from_agent(agent)` now exists, the cleanest is a small sibling `from_config(cls, model, params)` classmethod on each adapter (and have `from_agent` delegate to it), OR pass a minimal stand-in object with `.model` and `.params` to `from_agent`. Pick whichever is cleaner in the actual code — match the existing construction pattern.

**The trivial run:** build a minimal `RunPacket` and call the adapter's existing `run()`:
```python
packet = RunPacket(
    skill_markdown="You are a connectivity test. Answer in one word.",
    ticket_title="ping",
    ticket_body="Reply with the single word: ok",
)
result = await adapter.run(packet)
```
Keep it tiny — set/keep `max_tokens` low (e.g. params `{"max_tokens": 16}`) so a cloud test costs almost nothing.

**Interpret the result + respond:**
```python
ok = result.status == "done" and bool(result.work_product)
return {
    "ok": ok,
    "message": result.work_product[:200] if ok else " | ".join(result.logs)[:300],
    "latency_ms": <measure around the run() call>,
    "cost_usd": float(result.cost_usd),
}
```
Wrap in `try/except` so a transport failure returns `{ok: false, message: <error>}` rather than a 500. **Do not persist anything** (no Run row, no audit, no budget) — `run()` itself doesn't persist; just don't add any DB writes around it.

## 2. Frontend — Test button in `AgentEditModal`

- Add a small **Test** button next to / under the model field.
- On click → `POST /{selectedProvider}/test` with `{ model: <current model>, params: {max_tokens: 16} }` (add `api.testProvider(provider, model)` in `lib/api.ts` + a `useTestProvider` mutation in `lib/queries.ts`, following the existing `USE_MOCK` pattern; mock returns `{ ok: true, message: "ok", latency_ms: 42 }`).
- States: idle → click → **spinner** ("testing…") → result:
  - success → green ✓ with `"responded in {latency_ms}ms"` (optionally show the short message)
  - failure → red ✗ with the error message
- Match the neon-green aesthetic. Disable the button while a test is in flight and when no model is selected.

## Don't

- Don't persist the test (no Run, no audit, no budget charge) — it's ephemeral.
- Don't regenerate files — edit `providers.py`, `AgentEditModal.tsx`, `lib/api.ts`, `lib/queries.ts` in place.
- Don't add a new library. No localStorage.
- Don't block the modal — Test is optional; hiring still works without it.

## Test

1. Provider Ollama + an installed model → Test → ✓ "responded in Xms".
2. Provider Ollama + a model that isn't pulled → Test → ✗ with a clear error (not a crash).
3. Provider openrouter/anthropic + a valid model → ✓ (tiny cost).
4. Stop Ollama → Test on ollama → ✗ "couldn't connect", modal still usable.
5. Confirm no new Run appears in Live Ops / Audit after a test (it's ephemeral).
