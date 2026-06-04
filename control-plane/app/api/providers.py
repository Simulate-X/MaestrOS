"""
Provider endpoint'leri:
  GET  /{provider}/models  — kurulu/desteklenen modelleri listeler
  POST /{provider}/test    — provider+model kombinasyonunu test eder (ephemeral, DB yazısı yok)
"""

import time
import httpx
from types import SimpleNamespace
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from app.adapters.base import ADAPTER_REGISTRY, RunPacket
from app.adapters import build_adapter

# Dekoratörleri tetikle — dosyalar yüklenince sınıflar registry'ye otomatik girer.
import app.adapters.ollama       # noqa: F401
import app.adapters.openrouter   # noqa: F401
import app.adapters.anthropic    # noqa: F401

router = APIRouter(tags=["providers"])


# ---------------------------------------------------------------------------
# GET /{provider}/models
# ---------------------------------------------------------------------------

@router.get("/{provider}/models")
async def get_models(provider: str):
    """Provider'ın model listesini döndür. Registry'de yoksa 404, servise ulaşılamazsa 503."""
    adapter_cls = ADAPTER_REGISTRY.get(provider.lower())
    if not adapter_cls:
        raise HTTPException(
            status_code=404,
            detail=f"Bilinmeyen provider: {provider!r}. "
                   f"Desteklenenler: {list(ADAPTER_REGISTRY.keys())}",
        )
    try:
        models = await adapter_cls.list_models()
    except httpx.HTTPError:
        raise HTTPException(503, f"{provider} servisine bağlanılamadı.")
    return {"provider": provider, "models": models}


# ---------------------------------------------------------------------------
# POST /{provider}/test
# ---------------------------------------------------------------------------

class TestRequest(BaseModel):
    model: str
    params: dict | None = None


@router.post("/{provider}/test")
async def test_provider(provider: str, body: TestRequest):
    """
    Provider + model kombinasyonunun çalışıp çalışmadığını test et.

    Ephemeral: Run kaydı oluşturmaz, audit yazmaz, bütçe harcamaz.
    Sadece adapter'ı kurar, tek cümlelik bir RunPacket gönderir, sonucu döner.
    """
    if ADAPTER_REGISTRY.get(provider.lower()) is None:
        raise HTTPException(404, f"Bilinmeyen provider: {provider!r}")

    # max_tokens'ı zorla 16'ya sabitle — bulut testleri neredeyse sıfır maliyet
    test_params = {**(body.params or {}), "max_tokens": 16}

    try:
        # build_adapter bir agent nesnesi bekler — SimpleNamespace ile sağlıyoruz.
        # Tam agent kaydı oluşturmadan mevcut factory'yi yeniden kullanmak için.
        dummy = SimpleNamespace(
            provider=provider.lower(),
            model=body.model,
            params=test_params,
        )
        adapter = build_adapter(dummy)

        packet = RunPacket(
            skill_markdown="You are a connectivity test. Answer in one word.",
            ticket_title="ping",
            ticket_body="Reply with the single word: ok",
        )

        start = time.monotonic()
        result = await adapter.run(packet)
        latency_ms = int((time.monotonic() - start) * 1000)

        ok = result.status == "done" and bool(result.work_product)
        return {
            "ok": ok,
            "message": result.work_product[:200] if ok else " | ".join(result.logs)[:300],
            "latency_ms": latency_ms,
            "cost_usd": float(result.cost_usd),
        }

    except Exception as e:
        return {
            "ok": False,
            "message": str(e)[:300],
            "latency_ms": 0,
            "cost_usd": 0.0,
        }
