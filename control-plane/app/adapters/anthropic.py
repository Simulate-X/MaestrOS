"""
AnthropicAdapter — native Anthropic Messages API (/v1/messages).

Güvenlik kuralları:
  - self.api_key asla repr/log/exception text'ine dahil edilmez.
  - HTTP headers loglanmaz; sadece response body (hata durumunda).
  - RunResult.logs'a prompt/response içeriği eklenmez (operational mesajlar only).
"""

import logging
from decimal import Decimal

import httpx

from app.adapters.base import ProviderAdapter, RunPacket, RunResult
from app.adapters.pricing import get_pricing, compute_cost_usd

log = logging.getLogger("anthropic_adapter")

_API_BASE = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicAdapter(ProviderAdapter):
    """Native Anthropic Messages API adapter."""

    def __init__(self, api_key: str, model: str, params: dict | None = None):
        if not api_key:
            raise ValueError("AnthropicAdapter requires ANTHROPIC_API_KEY")
        self._api_key = api_key      # asla dışarıya sızdırma
        self.model = model
        self.params = params or {}
        self.max_tokens = int(self.params.get("max_tokens", 4096))

    def __repr__(self) -> str:
        return f"AnthropicAdapter(model={self.model!r})"  # api_key gizli

    async def run(self, packet: RunPacket) -> RunResult:
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                r = await client.post(
                    _API_BASE,
                    headers={
                        "x-api-key": self._api_key,
                        "anthropic-version": _ANTHROPIC_VERSION,
                        "content-type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "max_tokens": self.max_tokens,
                        "system": packet.skill_markdown,
                        "messages": [{
                            "role": "user",
                            "content": f"{packet.ticket_title}\n\n{packet.ticket_body}",
                        }],
                    },
                )
                r.raise_for_status()
                data = r.json()

            # Response: { content: [{type:"text",text:...}], usage: {input_tokens, output_tokens} }
            text_parts = [
                b.get("text", "")
                for b in data.get("content", [])
                if b.get("type") == "text"
            ]
            work_product = "\n".join(text_parts)

            usage = data.get("usage", {})
            if not usage:
                log.warning("anthropic_adapter: usage missing in response | model=%s", self.model)
            input_tokens  = int(usage.get("input_tokens",  0))
            output_tokens = int(usage.get("output_tokens", 0))

            p_in, p_out = get_pricing(self.model, self.params)
            cost_usd = compute_cost_usd(input_tokens, output_tokens, p_in, p_out)
            total_tokens = input_tokens + output_tokens

            # Fix C: ücretli provider token harcadı ama cost $0 → pricing tablosu mismatch
            run_logs: list[str] = []
            if cost_usd == Decimal(0) and total_tokens > 0:
                msg = (
                    f"WARNING: cost resolved to $0 for model {self.model!r} "
                    f"with {total_tokens} tokens — no pricing table match. "
                    f"Budget enforcement cannot protect this agent."
                )
                run_logs.append(msg)
                log.warning("anthropic_adapter: %s", msg)

            if not work_product:
                log.error("anthropic_adapter: empty content | model=%s", self.model)
                return RunResult(
                    status="error",
                    work_product="",
                    logs=run_logs + [f"empty_content model={self.model}"],
                    cost_usd=cost_usd,
                )

            return RunResult(
                status="done",
                work_product=work_product,
                cost_tokens=total_tokens,
                cost_usd=cost_usd,
                logs=run_logs,
            )

        except httpx.HTTPStatusError as e:
            # Headers ASLA loglanmaz; sadece body excerpt
            body = e.response.text[:500] if e.response else ""
            status_code = e.response.status_code if e.response else "?"
            log.error("anthropic_adapter: HTTP %s | model=%s", status_code, self.model)
            return RunResult(
                status="error",
                work_product="",
                logs=[f"HTTP {status_code}: {body}"],
                cost_usd=Decimal(0),
            )
        except Exception as e:
            log.exception("anthropic_adapter: exception | model=%s", self.model)
            return RunResult(
                status="error",
                work_product="",
                logs=[f"{type(e).__name__}: {str(e)[:200]}"],
                cost_usd=Decimal(0),
            )
