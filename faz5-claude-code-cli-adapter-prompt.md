# MaestrOS — Faz 5: Claude Code (CLI) adapter (Claude Code)

> Add a new provider `claude_code` that reaches Claude through the **`claude` CLI in headless mode** (the Pro/Max subscription, no API key) instead of the Anthropic HTTP API. This is a **subprocess adapter** — a different execution mechanism than the existing HTTP adapters, but it implements the exact same `ProviderAdapter` interface, so it plugs into the registry with **zero changes to existing code**. **Create a new file + edit in place — do NOT regenerate the project.** No new Python libraries (stdlib `asyncio` + `json`).

## Prerequisite (read first)

This adapter shells out to the `claude` command. It only works where the CLI is **installed and authenticated** (logged in via Pro/Max). MaestrOS runs in Docker — so either run control-plane on the host where you're already logged in, or make the CLI + its auth available inside the container. The adapter must **fail gracefully** (clear error, not a crash) if `claude` isn't found. Also note: per Anthropic's docs, from **June 15, 2026** headless `claude -p` usage on subscription plans draws from a separate monthly "Agent SDK credit" — so this isn't unlimited; a 24/7 scheduler will consume that quota.

## 1. Backend — new file `app/adapters/claude_code.py`

Mirror the structure of the existing adapters (same `ProviderAdapter` base, same `@register_provider` decorator, same `from_agent` / `list_models` / `run` shape). Adapt field names to your **actual** `RunPacket` / `RunResult` constructors and reuse your existing prompt-composition helper (the one your other adapters use to combine `skill_markdown` + `ticket_title` + `ticket_body`).

```python
import asyncio
import json
from app.adapters.base import ProviderAdapter, RunPacket, RunResult, register_provider


@register_provider("claude_code")
class ClaudeCodeAdapter(ProviderAdapter):
    def __init__(self, model: str | None = None, params: dict | None = None):
        self.model = model                 # no api_key, no base_url — subscription auth
        self.params = params or {}

    @classmethod
    def from_agent(cls, agent):
        return cls(agent.model, agent.params)

    @classmethod
    async def list_models(cls) -> list[str]:
        # Claude Code uses the subscription's Claude models — small static list
        # (refine to whatever `claude --model` accepts on your version)
        return ["default", "opus", "sonnet", "haiku"]

    async def run(self, packet: RunPacket) -> RunResult:
        prompt = self._compose_prompt(packet)   # same composition your HTTP adapters use

        cmd = ["claude", "-p", prompt, "--output-format", "json"]
        if self.model and self.model != "default":
            cmd += ["--model", self.model]
        # CRITICAL: no tools → pure text gen, so it can NEVER block waiting for an
        # interactive tool-approval prompt (that would hang the scheduler forever).
        # Verify the exact current flag with `claude --help`; the intent is "no tools".
        cmd += ["--allowedTools", ""]

        try:
            proc = await asyncio.create_subprocess_exec(   # exec (not shell) → no injection
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
        except FileNotFoundError:
            return RunResult(status="error", work_product="",
                             logs=["claude CLI not found / not authenticated"],
                             cost_tokens=0, cost_usd=0.0)
        except asyncio.TimeoutError:
            proc.kill()
            return RunResult(status="error", work_product="",
                             logs=["claude CLI timed out"], cost_tokens=0, cost_usd=0.0)

        if proc.returncode != 0:
            return RunResult(status="error", work_product="",
                             logs=[stderr.decode()[:500]], cost_tokens=0, cost_usd=0.0)

        try:
            data = json.loads(stdout.decode())
        except json.JSONDecodeError:
            return RunResult(status="error", work_product="",
                             logs=["could not parse claude JSON", stdout.decode()[:300]],
                             cost_tokens=0, cost_usd=0.0)

        ok = data.get("subtype") == "success"
        return RunResult(
            status="done" if ok else "error",
            work_product=data.get("result", ""),
            logs=[] if ok else [str(data)[:500]],
            cost_tokens=0,                                  # JSON has no token count → 0
            cost_usd=float(data.get("total_cost_usd") or 0.0),  # notional API-equivalent cost
        )
```

Why each guard matters (these are the new bits vs an HTTP adapter):
- **`create_subprocess_exec` with an args list**, not `shell=True` / a command string → no shell-escaping or injection issues with the prompt text.
- **`asyncio.wait_for(..., timeout=...)`** → an unattended scheduler can never hang on a stuck CLI; on timeout we kill the process and return an error.
- **no-tools flag** → the run can't pause for an interactive permission prompt (headless has no one to approve).
- **`FileNotFoundError`** → clear message when the CLI isn't installed/authed instead of a 500.

## 2. Register it (the load-bearing import)

In `app/adapters/__init__.py`, add the side-effect import so the `@register_provider` decorator runs (same pattern as the other three — without this the registry won't know about it):

```python
from app.adapters.claude_code import ClaudeCodeAdapter  # noqa: F401  # registers adapter
```

That's the **only** change needed for the backend to fully support the new provider — `build_adapter`, `GET /{provider}/models`, and `POST /{provider}/test` all already dispatch through the registry. (This is the open/closed payoff: a brand-new execution mechanism, zero edits to those files.)

## 3. Frontend — add `claude_code` as a provider option

In `AgentEditModal.tsx`:
- Add **claude_code** to the SAĞLAYICI / provider toggle (alongside ollama / anthropic / openrouter). Label it e.g. "claude code".
- The model combobox should fetch from `/{provider}/models` for it too (it'll get the static list from `list_models`). If your `useOllamaModels` hook is provider-specific, generalize it to `useProviderModels(provider)` or add a parallel fetch — match how you wired the other cloud providers.
- The existing **Test** button should work unchanged (it dispatches through the same registry → `run()`). Note a test will actually invoke `claude -p` once.
- Optional: the MODEL hint label can read "abonelik" (subscription) for this provider, vs "yerel"/"bulut" for the others.

## Don't

- Don't add a new Python library (stdlib `asyncio` + `json` only).
- Don't use `shell=True` — use `create_subprocess_exec` with an args list.
- Don't let the subprocess run without a timeout or with tools enabled (both can hang a headless run).
- Don't touch `build_adapter`, the providers endpoints, or the other adapters — the registry already covers them.
- Don't regenerate files. No localStorage.

## Test

1. Ensure `claude` is installed + logged in where control-plane runs. `GET /claude_code/models` → returns the static list.
2. Hire an agent with provider **claude_code** → click **Test** → ✓ with a latency (a real `claude -p` call ran).
3. Give that agent a ticket → it runs through the scheduler, produces a work product, and `cost_usd` is populated from the JSON.
4. Temporarily rename/break the `claude` binary → Test → ✗ "not found", no crash; the rest of the app keeps working.
5. Confirm a `claude_code` run never hangs (timeout + no-tools guards working).
