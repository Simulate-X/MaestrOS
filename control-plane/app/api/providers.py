"""
GET /{provider}/models — provider'a göre model listesi döndürür.

Her adapter kendi @register_provider dekoratörüyle ADAPTER_REGISTRY'ye kaydolur.
Bu endpoint hangi adapter'ın var olduğunu bilmez — sadece registry'ye sorar.
Yeni provider eklemek için bu dosyaya dokunmak gerekmez.
"""

import httpx
from fastapi import APIRouter, HTTPException

from app.adapters.base import ADAPTER_REGISTRY

# Bu import'lar sadece @register_provider dekoratörlerini tetiklemek için.
# Dosyalar yüklenince sınıflar registry'ye otomatik yazar.
import app.adapters.ollama       # noqa: F401
import app.adapters.openrouter   # noqa: F401
import app.adapters.anthropic    # noqa: F401

router = APIRouter(tags=["providers"])


@router.get("/{provider}/models")
async def get_models(provider: str):
    """
    Provider'ın model listesini döndür.

    Registry'de yoksa 404.
    Servise bağlanamazsa 503.
    """
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
