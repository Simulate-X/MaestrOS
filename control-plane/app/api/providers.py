"""
Provider model keşfi endpoint'leri.
"""

import httpx
from fastapi import APIRouter, HTTPException
from app.adapters.ollama import OllamaAdapter
from app.config import settings

router = APIRouter(tags=["providers"])


@router.get("/ollama/models")
async def ollama_models():
    """
    Ollama'da kurulu modellerin listesini döndür.

    Ollama açık, model yok  →  200  { models: [] }
    Ollama kapalı           →  503  hata mesajı
    """
    try:
        models = await OllamaAdapter.list_models(settings.OLLAMA_BASE_URL)
    except httpx.HTTPError:
        raise HTTPException(503, "Ollama'ya bağlanılamadı. Servis çalışıyor mu?")
    return {"provider": "ollama", "models": models}
