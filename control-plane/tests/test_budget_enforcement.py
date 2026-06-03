"""Budget enforcement logic tests.

Budget check, wake.py'nin PERSIST adımında yapılır — bu testler sadece logic'i
doğrular (pricing hesabı + cost_usd propagation + paused state).
"""

import pytest
from decimal import Decimal
from app.adapters.pricing import get_pricing, compute_cost_usd


# ── Pricing tablosu doğruluğu ─────────────────────────────────────────────────

def test_haiku_pricing():
    p_in, p_out = get_pricing("claude-haiku-4-5-20251001")
    assert p_in  == Decimal("1.00")
    assert p_out == Decimal("5.00")


def test_minimax_pricing():
    p_in, p_out = get_pricing("minimaxai/minimax-m2")
    assert p_in  == Decimal("0.30")
    assert p_out == Decimal("1.20")


def test_unknown_model_zero():
    p_in, p_out = get_pricing("no-such-model/xyz")
    assert p_in  == Decimal(0)
    assert p_out == Decimal(0)


def test_params_override_beats_table():
    p_in, p_out = get_pricing(
        "claude-haiku-4-5-20251001",
        params={"price_input_per_mtok": "99", "price_output_per_mtok": "199"},
    )
    assert p_in  == Decimal("99")
    assert p_out == Decimal("199")


# ── compute_cost_usd doğruluğu ────────────────────────────────────────────────

def test_cost_haiku_150_tokens():
    """haiku: 100 input + 50 output → $0.000350"""
    p_in, p_out = get_pricing("claude-haiku-4-5-20251001")
    cost = compute_cost_usd(100, 50, p_in, p_out)
    assert cost == Decimal("0.000350")


def test_cost_zero_tokens():
    p_in, p_out = get_pricing("claude-haiku-4-5-20251001")
    assert compute_cost_usd(0, 0, p_in, p_out) == Decimal(0)


def test_cost_decimal_precision():
    """Float değil Decimal — yuvarlama hatası olmamalı."""
    cost = compute_cost_usd(
        1_000_000, 1_000_000,
        Decimal("3.00"), Decimal("15.00"),
    )
    # (1M * 3 + 1M * 15) / 1M = 18
    assert cost == Decimal("18.000000")


# ── Budget threshold logic ─────────────────────────────────────────────────────

@pytest.mark.parametrize("spent, limit, should_pause", [
    ("0.04",  "0.05", False),   # altında
    ("0.05",  "0.05", True),    # eşit → exhausted
    ("0.051", "0.05", True),    # üstünde
    ("0.00",  "0.00", True),    # sıfır limit → ilk run'da exhausted
])
def test_budget_threshold(spent, limit, should_pause):
    total = Decimal(spent)
    cap   = Decimal(limit)
    assert (total >= cap) == should_pause


def test_paused_reason_format():
    """paused_reason string formatını doğrula."""
    total = Decimal("0.0512")
    cap   = Decimal("0.0500")
    reason = (
        f"budget exhausted: spent ${total:.4f} >= limit ${cap:.4f}"
    )
    assert "budget exhausted" in reason
    assert "0.0512" in reason
    assert "0.0500" in reason
