"""
OpenRouterAdapter — OpenAI-compatible chat completions.

100+ modele tek implementasyonla erişim (minimax, GPT, Mistral, Llama, Claude via OR).
API ref: https://openrouter.ai/docs/api-reference/chat-completion

Güvenlik kuralları: AnthropicAdapter ile aynı — headers loglanmaz, key gizlenir.
"""

import logging
from decimal import Decimal

import httpx

from app.adapters.base import ProviderAdapter, RunPacket, RunResult, register_provider
from app.adapters.pricing import get_pricing, compute_cost_usd

log = logging.getLogger("openrouter_adapter")

_API_BASE = "https://openrouter.ai/api/v1/chat/completions"


@register_provider("openrouter")
class OpenRouterAdapter(ProviderAdapter):
    """OpenRouter chat completions (OpenAI-compatible) adapter."""

    @classmethod
    def from_agent(cls, agent) -> "OpenRouterAdapter":
        from app.config import settings
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("agent.provider='openrouter' requires OPENROUTER_API_KEY in .env")
        return cls(
            api_key=settings.OPENROUTER_API_KEY.get_secret_value(),
            model=agent.model,
            params=agent.params or {},
        )

    def __init__(self, api_key: str, model: str, params: dict | None = None):
        if not api_key:
            raise ValueError("OpenRouterAdapter requires OPENROUTER_API_KEY")
        self._api_key = api_key
        self.model = model
        self.params = params or {}
        self.max_tokens = int(self.params.get("max_tokens", 4096))

    def __repr__(self) -> str:
        return f"OpenRouterAdapter(model={self.model!r})"

    @classmethod
    async def list_models(cls) -> list[str]:
        """
        OpenRouter'daki aktif modellerin listesini döndür.

        Bağımlılığını (api_key) kendi içinde settings'ten çözer.
        API key olmadan da çalışır (public endpoint), ama key varsa daha
        kapsamlı sonuç dönebilir.
        """
        from app.config import settings  # lazy import
        headers = {
            "HTTP-Referer": "https://maestros.local",
            "X-Title": "MaestrOS",
        }
        if settings.OPENROUTER_API_KEY:
            headers["Authorization"] = f"Bearer {settings.OPENROUTER_API_KEY.get_secret_value()}"

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            resp.raise_for_status()

        data = resp.json()
        return [
            m["id"]
            for m in data.get("data", [])
            if m.get("id")
        ]

    async def run(self, packet: RunPacket) -> RunResult:
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                r = await client.post(
                    _API_BASE,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "content-type": "application/json",
                        "HTTP-Referer": "https://maestros.local",
                        "X-Title": "MaestrOS",
                    },
                    json={
                        "model": self.model,
                        "max_tokens": self.max_tokens,
                        "usage": {"include": True},   # Fix A: gerçek cost'u döndürsün
                        "messages": [
                            {"role": "system", "content": packet.skill_markdown},
                            {
                                "role": "user",
                                "content": f"{packet.ticket_title}\n\n{packet.ticket_body}",
                            },
                        ],
                    },
                )
                r.raise_for_status()
                data = r.json()

            # OpenAI-compat: { choices:[{message:{content}}], usage:{prompt_tokens, completion_tokens} }
            choices = data.get("choices") or []
            work_product = (
                choices[0]["message"]["content"] if choices else ""
            ) or ""

            usage = data.get("usage", {})
            if not usage:
                log.warning("openrouter_adapter: usage missing in response | model=%s", self.model)
            input_tokens  = int(usage.get("prompt_tokens",     0))
            output_tokens = int(usage.get("completion_tokens", 0))
            total_tokens  = input_tokens + output_tokens

            # Fix A: OpenRouter gerçek charge'ı usage.cost'ta verebilir — statik tablodan önce dene
            real_cost = usage.get("cost")
            if real_cost is not None:
                cost_usd = Decimal(str(real_cost))
            else:
                p_in, p_out = get_pricing(self.model, self.params)
                cost_usd = compute_cost_usd(input_tokens, output_tokens, p_in, p_out)

            # Fix C: ücretli provider token harcadı ama cost $0 → budget enforcement bypass riski
            run_logs: list[str] = []
            if cost_usd == Decimal(0) and total_tokens > 0:
                msg = (
                    f"WARNING: cost resolved to $0 for model {self.model!r} "
                    f"with {total_tokens} tokens — no usage.cost and no pricing table match. "
                    f"Budget enforcement cannot protect this agent."
                )
                run_logs.append(msg)
                log.warning("openrouter_adapter: %s", msg)

            if not work_product:
                log.error("openrouter_adapter: empty content | model=%s", self.model)
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
            body = e.response.text[:500] if e.response else ""
            status_code = e.response.status_code if e.response else "?"
            log.error("openrouter_adapter: HTTP %s | model=%s", status_code, self.model)
            return RunResult(
                status="error",
                work_product="",
                logs=[f"HTTP {status_code}: {body}"],
                cost_usd=Decimal(0),
            )
        except Exception as e:
            log.exception("openrouter_adapter: exception | model=%s", self.model)
            return RunResult(
                status="error",
                work_product="",
                logs=[f"{type(e).__name__}: {str(e)[:200]}"],
                cost_usd=Decimal(0),
            )