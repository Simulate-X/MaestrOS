"""Unit tests for budget service — period calculations and budget logic."""

import pytest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.budget import (
    current_period_start,
    compute_agent_spent,
    compute_company_spent,
    check_budget,
    over_budget_company_ids,
    EPOCH,
)


# ── current_period_start ──────────────────────────────────────────────────────

def test_period_start_daily():
    now = datetime(2026, 6, 1, 14, 30, 45, tzinfo=timezone.utc)
    assert current_period_start("daily", now) == datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)


def test_period_start_daily_midnight():
    """Gece yarısı tam kendisi döner."""
    now = datetime(2026, 6, 15, 0, 0, 0, tzinfo=timezone.utc)
    assert current_period_start("daily", now) == now


def test_period_start_monthly():
    now = datetime(2026, 6, 15, 14, 30, tzinfo=timezone.utc)
    assert current_period_start("monthly", now) == datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)


def test_period_start_monthly_first_day():
    now = datetime(2026, 6, 1, 8, 0, tzinfo=timezone.utc)
    assert current_period_start("monthly", now) == datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)


def test_period_start_all_time():
    assert current_period_start("all_time") == EPOCH


def test_period_start_all_time_ignores_now():
    now = datetime(2099, 12, 31, tzinfo=timezone.utc)
    assert current_period_start("all_time", now) == EPOCH


def test_period_windows_differ_between_days():
    """Daily: iki farklı gün iki farklı pencere döner."""
    d1 = current_period_start("daily", datetime(2026, 6, 1, 23, 59, tzinfo=timezone.utc))
    d2 = current_period_start("daily", datetime(2026, 6, 2, 0, 0, tzinfo=timezone.utc))
    assert d1 != d2
    assert d2 > d1


# ── compute_agent_spent ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_compute_agent_spent_no_limit_returns_zero():
    """budget_usd_limit=None → 0 (skip DB query)."""
    agent = MagicMock()
    agent.budget_usd_limit = None
    session = AsyncMock()
    result = await compute_agent_spent(session, agent)
    assert result == Decimal(0)
    session.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_compute_agent_spent_with_limit():
    agent = MagicMock()
    agent.id = 1
    agent.budget_usd_limit = Decimal("1.00")
    agent.budget_period = "monthly"

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=Decimal("0.42"))

    result = await compute_agent_spent(session, agent)
    assert result == Decimal("0.42")


@pytest.mark.asyncio
async def test_compute_agent_spent_none_from_db_returns_zero():
    """DB NULL (no runs yet) → Decimal(0)."""
    agent = MagicMock()
    agent.id = 1
    agent.budget_usd_limit = Decimal("1.00")
    agent.budget_period = "daily"

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)

    result = await compute_agent_spent(session, agent)
    assert result == Decimal(0)


# ── check_budget ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_budget_no_limits_ok():
    """Agent ve company limiti yok → ok=True."""
    agent = MagicMock()
    agent.budget_usd_limit = None
    agent.company_id = 1

    company = MagicMock()
    company.budget_usd_limit = None

    session = AsyncMock()
    session.get = AsyncMock(return_value=company)

    ok, scope, reason = await check_budget(session, agent)
    assert ok is True
    assert scope is None


@pytest.mark.asyncio
async def test_check_budget_agent_over():
    """Agent limiti aştı → scope='agent'."""
    agent = MagicMock()
    agent.id = 2
    agent.budget_usd_limit = Decimal("0.01")
    agent.budget_period = "monthly"
    agent.company_id = 1

    with patch("app.services.budget.compute_agent_spent", AsyncMock(return_value=Decimal("0.02"))):
        session = AsyncMock()
        ok, scope, reason = await check_budget(session, agent)

    assert ok is False
    assert scope == "agent"
    assert "agent budget exhausted" in reason


@pytest.mark.asyncio
async def test_check_budget_company_over_agent_ok():
    """Agent limiti yok ama company limiti aştı → scope='company'."""
    agent = MagicMock()
    agent.budget_usd_limit = None
    agent.company_id = 1

    company = MagicMock()
    company.budget_usd_limit = Decimal("1.00")
    company.budget_period = "daily"

    session = AsyncMock()
    session.get = AsyncMock(return_value=company)

    with patch("app.services.budget.compute_company_spent", AsyncMock(return_value=Decimal("1.50"))):
        ok, scope, reason = await check_budget(session, agent)

    assert ok is False
    assert scope == "company"
    assert "company budget exhausted" in reason


@pytest.mark.asyncio
async def test_check_budget_agent_checked_first():
    """Agent limit aşıldığında company kontrol bile yapılmamalı."""
    agent = MagicMock()
    agent.id = 3
    agent.budget_usd_limit = Decimal("0.001")
    agent.budget_period = "daily"
    agent.company_id = 1

    with patch("app.services.budget.compute_agent_spent", AsyncMock(return_value=Decimal("0.002"))):
        session = AsyncMock()
        ok, scope, _ = await check_budget(session, agent)

    assert ok is False
    assert scope == "agent"
    # session.get (company fetch) çağrılmamış olmalı
    session.get.assert_not_called()


# ── over_budget_company_ids ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_over_budget_company_ids_empty_when_no_limits():
    """Hiç limit yok → boş liste."""
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    session = AsyncMock()
    session.execute = AsyncMock(return_value=mock_result)

    result = await over_budget_company_ids(session)
    assert result == []


@pytest.mark.asyncio
async def test_over_budget_company_ids_returns_over():
    company = MagicMock()
    company.id = 1
    company.budget_usd_limit = Decimal("1.00")
    company.budget_period = "monthly"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [company]

    session = AsyncMock()
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.budget.compute_company_spent", AsyncMock(return_value=Decimal("1.50"))):
        result = await over_budget_company_ids(session)

    assert 1 in result


@pytest.mark.asyncio
async def test_over_budget_company_ids_excludes_under():
    company = MagicMock()
    company.id = 2
    company.budget_usd_limit = Decimal("5.00")
    company.budget_period = "monthly"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [company]

    session = AsyncMock()
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.budget.compute_company_spent", AsyncMock(return_value=Decimal("1.00"))):
        result = await over_budget_company_ids(session)

    assert result == []
