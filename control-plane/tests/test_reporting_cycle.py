"""Unit tests for reporting_to cycle validation."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.api.agents import validate_no_reporting_cycle


def _make_agent(agent_id: int, reporting_to: int | None) -> MagicMock:
    a = MagicMock()
    a.id = agent_id
    a.reporting_to = reporting_to
    return a


# ── None → always ok ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_reporting_to_accepted():
    """proposed_reporting_to=None → validation skip."""
    session = AsyncMock()
    await validate_no_reporting_cycle(session, agent_id=1, proposed_reporting_to=None)
    session.get.assert_not_called()


# ── Direct cycle ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_direct_self_cycle_rejected():
    """A.reporting_to = A → reject."""
    session = AsyncMock()
    with pytest.raises(ValueError, match="cycle"):
        await validate_no_reporting_cycle(session, agent_id=1, proposed_reporting_to=1)


# ── Indirect cycle ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_indirect_cycle_rejected():
    """A→B, propose B→A → reject (A already in chain)."""
    # B.reporting_to = A → A.reporting_to = None (existing)
    # Now we want to set A.reporting_to = B
    agent_b = _make_agent(2, reporting_to=None)  # B→nobody currently

    async def _get(model, pk):
        if pk == 2:
            return agent_b
        return None

    session = AsyncMock()
    session.get = AsyncMock(side_effect=_get)

    # agent_id=1 (A), propose reporting_to=2 (B)
    # seen={1}, walk B → B.reporting_to=None → ok so far? Wait:
    # B.reporting_to=None, so chain stops. No cycle here.
    # For a real indirect cycle: need B.reporting_to=A already set.
    agent_b_with_chain = _make_agent(2, reporting_to=1)  # B→A

    async def _get2(model, pk):
        if pk == 2:
            return agent_b_with_chain
        if pk == 1:
            return _make_agent(1, reporting_to=None)
        return None

    session2 = AsyncMock()
    session2.get = AsyncMock(side_effect=_get2)

    with pytest.raises(ValueError, match="cycle"):
        await validate_no_reporting_cycle(session2, agent_id=1, proposed_reporting_to=2)


@pytest.mark.asyncio
async def test_three_hop_cycle_rejected():
    """A→B→C→A → reject."""
    # Existing: B→C, C→A. Now set A.reporting_to=B
    agents = {
        2: _make_agent(2, reporting_to=3),   # B→C
        3: _make_agent(3, reporting_to=1),   # C→A
        1: _make_agent(1, reporting_to=None),
    }

    session = AsyncMock()
    session.get = AsyncMock(side_effect=lambda m, pk: agents.get(pk))

    with pytest.raises(ValueError, match="cycle"):
        await validate_no_reporting_cycle(session, agent_id=1, proposed_reporting_to=2)


# ── Valid chain ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_valid_linear_chain_accepted():
    """CEO(1) ← Manager(2) ← Junior(3): set Junior.reporting_to=Manager → ok."""
    agents = {
        2: _make_agent(2, reporting_to=1),   # Manager→CEO
        1: _make_agent(1, reporting_to=None),
    }

    session = AsyncMock()
    session.get = AsyncMock(side_effect=lambda m, pk: agents.get(pk))

    # Junior (id=3) → Manager (id=2): should be valid
    await validate_no_reporting_cycle(session, agent_id=3, proposed_reporting_to=2)


@pytest.mark.asyncio
async def test_new_agent_no_cycle():
    """Yeni agent (id=None): proposed chain geçerli → ok."""
    agents = {
        1: _make_agent(1, reporting_to=None),
    }
    session = AsyncMock()
    session.get = AsyncMock(side_effect=lambda m, pk: agents.get(pk))

    await validate_no_reporting_cycle(session, agent_id=None, proposed_reporting_to=1)


# ── Nonexistent parent ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_nonexistent_parent_rejected():
    session = AsyncMock()
    session.get = AsyncMock(return_value=None)

    with pytest.raises(ValueError, match="nonexistent agent"):
        await validate_no_reporting_cycle(session, agent_id=1, proposed_reporting_to=999)
