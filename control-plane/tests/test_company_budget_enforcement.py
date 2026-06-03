"""Company budget enforcement tests.

İki seviye ayrımının özü:
  - Agent-level aşım → o agent.status='paused' (suçlu o)
  - Company-level aşım → agent pause OLMAZ (suçlu değil),
    scheduler pre-filter halleder
"""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.claim import claim_ticket


def _make_agent(agent_id=1, company_id=1, budget_usd_limit=None, budget_period="monthly"):
    a = MagicMock()
    a.id = agent_id
    a.company_id = company_id
    a.budget_usd_limit = budget_usd_limit
    a.budget_period = budget_period
    a.status = "active"
    a.paused_reason = None
    return a


# ── Company budget aşımı → agent pause EDİLMEZ ───────────────────────────────

@pytest.mark.asyncio
async def test_company_over_budget_returns_none_no_pause():
    """Company budget aşıldı: claim None döner, agent paused OLMAZ."""
    agent = _make_agent(budget_usd_limit=None)  # agent limit yok

    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=None),
        __aexit__=AsyncMock(return_value=False),
    ))
    session.get = AsyncMock(return_value=agent)
    session.add = MagicMock()  # SQLAlchemy add() is sync; suppress AsyncMock warning

    with patch(
        "app.services.claim.check_budget",
        AsyncMock(return_value=(False, "company", "company budget exhausted")),
    ):
        result = await claim_ticket(session, agent_id=1)

    assert result is None
    assert agent.status == "active"     # PAUSED olmamalı
    assert agent.paused_reason is None  # reason set edilmemeli


# ── Agent budget aşımı → agent paused OLUR ───────────────────────────────────

@pytest.mark.asyncio
async def test_agent_over_budget_gets_paused():
    """Agent kendi limitini aştı: claim None döner, agent.status='paused'."""
    agent = _make_agent(budget_usd_limit=Decimal("0.01"))

    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=None),
        __aexit__=AsyncMock(return_value=False),
    ))
    session.get = AsyncMock(return_value=agent)
    session.add = MagicMock()  # SQLAlchemy add() is sync; suppress AsyncMock warning

    with patch(
        "app.services.claim.check_budget",
        AsyncMock(return_value=(False, "agent", "agent budget exhausted: $0.02 >= $0.01")),
    ):
        result = await claim_ticket(session, agent_id=1)

    assert result is None
    assert agent.status == "paused"
    assert "budget exhausted" in agent.paused_reason


# ── Budget ok → normal claim ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_budget_ok_proceeds_to_claim():
    """Budget check geçti: ticket claim normal devam eder."""
    agent = _make_agent()

    # Mock execute → None (no queued tickets)
    mock_row = MagicMock()
    mock_row.scalar_one_or_none = MagicMock(return_value=None)

    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=None),
        __aexit__=AsyncMock(return_value=False),
    ))
    session.get = AsyncMock(return_value=agent)
    session.execute = AsyncMock(return_value=mock_row)

    with patch(
        "app.services.claim.check_budget",
        AsyncMock(return_value=(True, None, None)),
    ):
        result = await claim_ticket(session, agent_id=1)

    assert result is None  # no tickets, not paused
    assert agent.status == "active"


# ── Two-level independence ────────────────────────────────────────────────────

@pytest.mark.parametrize("scope,expect_paused", [
    ("agent", True),
    ("company", False),
])
@pytest.mark.asyncio
async def test_scope_determines_pause(scope, expect_paused):
    """scope ayrımı: agent → paused, company → not paused."""
    agent = _make_agent()

    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=None),
        __aexit__=AsyncMock(return_value=False),
    ))
    session.get = AsyncMock(return_value=agent)
    session.add = MagicMock()  # SQLAlchemy add() is sync; suppress AsyncMock warning

    with patch(
        "app.services.claim.check_budget",
        AsyncMock(return_value=(False, scope, f"{scope} budget exhausted")),
    ):
        await claim_ticket(session, agent_id=1)

    assert (agent.status == "paused") == expect_paused
