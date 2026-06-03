from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal


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
