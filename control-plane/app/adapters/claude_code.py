import asyncio
import json

from app.adapters.base import ProviderAdapter, RunPacket, RunResult, register_provider


@register_provider("claude_code")
class ClaudeCodeAdapter(ProviderAdapter):
    """Subprocess adapter — Claude CLI (Pro/Max subscription, no API key)."""

    def __init__(self, model: str | None = None, params: dict | None = None):
        self.model = model
        self.params = params or {}

    @classmethod
    def from_agent(cls, agent) -> "ClaudeCodeAdapter":
        return cls(agent.model, agent.params)

    @classmethod
    async def list_models(cls) -> list[str]:
        return ["default", "opus", "sonnet", "haiku"]

    async def run(self, packet: RunPacket) -> RunResult:
        prompt = f"{packet.skill_markdown}\n\n---\n\n{packet.ticket_title}\n\n{packet.ticket_body}"

        cmd = ["claude", "-p", prompt, "--output-format", "json"]
        if self.model and self.model != "default":
            cmd += ["--model", self.model]
        # No tools: prevents interactive approval prompts that would hang a headless scheduler.
        cmd += ["--allowedTools", ""]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
        except FileNotFoundError:
            return RunResult(
                status="error", work_product="",
                logs=["claude CLI not found / not authenticated"],
                cost_tokens=0, cost_usd=0.0,
            )
        except asyncio.TimeoutError:
            proc.kill()
            return RunResult(
                status="error", work_product="",
                logs=["claude CLI timed out (180s)"],
                cost_tokens=0, cost_usd=0.0,
            )

        if proc.returncode != 0:
            return RunResult(
                status="error", work_product="",
                logs=[stderr.decode()[:500]],
                cost_tokens=0, cost_usd=0.0,
            )

        try:
            data = json.loads(stdout.decode())
        except json.JSONDecodeError:
            return RunResult(
                status="error", work_product="",
                logs=["could not parse claude JSON output", stdout.decode()[:300]],
                cost_tokens=0, cost_usd=0.0,
            )

        ok = data.get("subtype") == "success"
        return RunResult(
            status="done" if ok else "error",
            work_product=data.get("result", ""),
            logs=[] if ok else [str(data)[:500]],
            cost_tokens=0,
            cost_usd=float(data.get("total_cost_usd") or 0.0),
        )
