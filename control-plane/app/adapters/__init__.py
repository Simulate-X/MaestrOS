from app.adapters.base import ProviderAdapter, RunPacket, RunResult, ADAPTER_REGISTRY
from app.adapters.ollama import OllamaAdapter
from app.adapters.anthropic import AnthropicAdapter
from app.adapters.openrouter import OpenRouterAdapter


def build_adapter(agent) -> ProviderAdapter:
    """Agent'ın provider'ına göre uygun adapter'ı yarat.

    Kurulum mantığı (hangi setting'i okuyacağı) her adapter'ın
    kendi from_agent() classmethod'unda — burası sadece dispatch eder.
    """
    adapter_cls = ADAPTER_REGISTRY.get(agent.provider)
    if not adapter_cls:
        raise NotImplementedError(
            f"unknown provider: {agent.provider!r}. "
            f"Supported: {list(ADAPTER_REGISTRY.keys())}"
        )
    return adapter_cls.from_agent(agent)
