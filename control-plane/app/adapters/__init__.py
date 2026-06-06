from app.adapters.base import ProviderAdapter, RunPacket, RunResult, ADAPTER_REGISTRY

# Side-effect imports — @register_provider dekoratörlerini tetikler.
# Bu satırlar "kullanılmıyor" gibi görünse de silinirse registry boşalır
# ve build_adapter/providers.py her çağrıda NotImplementedError fırlatır.
# Linter uyarısı için: # noqa: F401
from app.adapters.ollama import OllamaAdapter        # noqa: F401
from app.adapters.anthropic import AnthropicAdapter  # noqa: F401
from app.adapters.openrouter import OpenRouterAdapter  # noqa: F401
from app.adapters.claude_code import ClaudeCodeAdapter  # noqa: F401  # registers adapter


def build_adapter(agent) -> ProviderAdapter:
    adapter_cls = ADAPTER_REGISTRY.get(agent.provider)
    if not adapter_cls:
        raise NotImplementedError(
            f"unknown provider: {agent.provider!r}. "
            f"Supported: {list(ADAPTER_REGISTRY.keys())}"
        )
    return adapter_cls.from_agent(agent)
