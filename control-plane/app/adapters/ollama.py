import json
import logging
from decimal import Decimal

import httpx

from app.adapters.base import ProviderAdapter, RunPacket, RunResult, register_provider

log = logging.getLogger("ollama_adapter")


def _parse_ollama_body(body: str) -> tuple[str, int, int]:
    """
    Ollama /api/chat yanitini parse et.

    Iki mod:
      - stream=false (beklenen): tek JSON object → dogrudan parse
      - NDJSON (stream=false ignore eden versiyonlar): satir satir JSON →
        content parcalari birlestirilir, son 'done' satirindan token sayilari alinir

    Donus: (content, prompt_eval_count, eval_count)
    """
    body = body.strip()
    if not body:
        return "", 0, 0

    # --- Once tek JSON olarak dene (stream=false modeli) ---
    try:
        data = json.loads(body)
        content = (data.get("message") or {}).get("content") or ""
        return (
            content,
            data.get("prompt_eval_count", 0),
            data.get("eval_count", 0),
        )
    except json.JSONDecodeError:
        pass

    # --- NDJSON fallback (streaming response) ---
    # Her satir bir JSON chunk; content parcalari birlestirilir.
    content_parts: list[str] = []
    prompt_tokens = 0
    eval_tokens = 0

    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            chunk = json.loads(line)
        except json.JSONDecodeError:
            continue
        part = (chunk.get("message") or {}).get("content") or ""
        if part:
            content_parts.append(part)
        if chunk.get("done"):
            prompt_tokens = chunk.get("prompt_eval_count", 0)
            eval_tokens = chunk.get("eval_count", 0)

    return "".join(content_parts), prompt_tokens, eval_tokens


@register_provider("ollama")
class OllamaAdapter(ProviderAdapter):
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    @classmethod
    def from_agent(cls, agent) -> "OllamaAdapter":
        from app.config import settings
        return cls(settings.OLLAMA_BASE_URL, agent.model)

    @classmethod
    async def list_models(cls) -> list[str]:
        """
        Ollama'daki kurulu model isimlerini döndür.

        Tek sorumluluk: Ollama'ya git, isimleri topla, döndür.
        Bağımlılığını (base_url) kendi içinde settings'ten çözer.
        Hata yönetimi çağırana ait — exception fırlatır, yakalamaz.

        Filtre: embedding modelleri çıkar (ajan olarak çalıştırılamaz).
        """
        from app.config import settings  # döngüsel import'tan kaçınmak için lazy
        base_url = settings.OLLAMA_BASE_URL
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/api/tags")
            resp.raise_for_status()
        data = resp.json()
        return [
            m["name"]
            for m in data.get("models", [])
            if "embed" not in m.get("name", "").lower()
        ]

    async def run(self, packet: RunPacket) -> RunResult:
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                r = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": packet.skill_markdown},
                            {
                                "role": "user",
                                "content": (
                                    f"{packet.ticket_title}\n\n{packet.ticket_body}"
                                ),
                            },
                        ],
                        "stream": False,
                    },
                )
                r.raise_for_status()
                body = r.text  # .json() degil — NDJSON fallback icin ham metin

            content, prompt_tokens, eval_tokens = _parse_ollama_body(body)

            if not content:
                log.error(
                    "Ollama bos content | model=%s | body_preview=%.300s",
                    self.model, body,
                )
                return RunResult(
                    status="error",
                    work_product="",
                    logs=[
                        f"empty_content model={self.model}",
                        f"body_preview={body[:300]}",
                    ],
                )

            return RunResult(
                status="done",
                work_product=content,
                cost_tokens=prompt_tokens + eval_tokens,
                cost_usd=Decimal(0),   # lokal model — ücretsiz
            )

        except Exception as e:
            log.exception("OllamaAdapter exception | model=%s", self.model)
            return RunResult(status="error", work_product="", logs=[repr(e)])
