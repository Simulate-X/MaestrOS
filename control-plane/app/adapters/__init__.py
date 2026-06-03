from app.adapters.base import ProviderAdapter, RunPacket, RunResult
from app.adapters.ollama import OllamaAdapter
from app.adapters.anthropic import AnthropicAdapter
from app.adapters.openrouter import OpenRouterAdapter


def build_adapter(agent) -> ProviderAdapter:
    """Agent'ın provider'ına göre uygun adapter'ı yarat."""

    if agent.provider == "ollama":
        from app.config import settings
        return OllamaAdapter(settings.OLLAMA_BASE_URL, agent.model)

    if agent.provider == "anthropic":
        from app.config import settings
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError(
                "agent.provider='anthropic' requires ANTHROPIC_API_KEY in .env"
            )
        return AnthropicAdapter(
            api_key=settings.ANTHROPIC_API_KEY.get_secret_value(),
            model=agent.model,
            params=agent.params or {},
        )

    if agent.provider == "openrouter":
        from app.config import settings
        if not settings.OPENROUTER_API_KEY:
            raise ValueError(
                "agent.provider='openrouter' requires OPENROUTER_API_KEY in .env"
            )
        return OpenRouterAdapter(
            api_key=settings.OPENROUTER_API_KEY.get_secret_value(),
            model=agent.model,
            params=agent.params or {},
        )

    raise NotImplementedError(
        f"unknown provider: {agent.provider!r}. "
        "Supported: 'ollama', 'anthropic', 'openrouter'"
    )
