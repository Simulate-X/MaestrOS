from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal

# ---------------------------------------------------------------------------
# Merkezi kayıt defteri — her adapter kendini buraya yazar.
# Döngüsel import riski yok: bu dosya hiçbir adapter'ı import etmez.
# ---------------------------------------------------------------------------
ADAPTER_REGISTRY: dict[str, type] = {}


def register_provider(name: str):
    """Sınıfı ADAPTER_REGISTRY'ye kaydeden dekoratör.

    Kullanım:
        @register_provider("ollama")
        class OllamaAdapter(ProviderAdapter): ...

    Python dosyayı yüklediği anda dekoratör çalışır → sınıf deftere girer.
    """
    def decorator(cls):
        ADAPTER_REGISTRY[name.lower()] = cls
        return cls
    return decorator


@dataclass
class RunPacket:
    skill_markdown: str
    ticket_title: str
    ticket_body: str
    goal_ancestry: list[str] = field(default_factory=list)
    session_state: dict = field(default_factory=dict)


@dataclass
class RunResult:
    status: str  # done | needs_approval | blocked | error
    work_product: str
    logs: list[str] = field(default_factory=list)
    cost_tokens: int = 0
    cost_usd: Decimal = field(default_factory=lambda: Decimal(0))
    session_state: dict = field(default_factory=dict)


class ProviderAdapter(ABC):
    @abstractmethod
    async def run(self, packet: RunPacket) -> RunResult: ...
