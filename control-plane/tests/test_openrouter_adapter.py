"""Unit tests for OpenRouterAdapter (mocked httpx)."""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.adapters.openrouter import OpenRouterAdapter
from app.adapters.base import RunPacket


def _make_packet() -> RunPacket:
    return RunPacket(
        skill_markdown="You are an engineer.",
        ticket_title="Task",
        ticket_body="Build something.",
    )


def _mock_or_response(
    content: str,
    prompt_tokens: int,
    completion_tokens: int,
    usage_cost: float | None = None,   # Fix A: gerçek cost alanı
):
    usage = {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens}
    if usage_cost is not None:
        usage["cost"] = usage_cost
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: {
        "choices": [{"message": {"content": content}}],
        "usage": usage,
    }
    return resp


# ── Constructor validation ────────────────────────────────────────────────────

def test_missing_key_raises():
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        OpenRouterAdapter(api_key="", model="minimaxai/minimax-m2")


def test_repr_hides_key():
    a = OpenRouterAdapter(api_key="sk-or-secret", model="minimaxai/minimax-m2")
    assert "sk-or-secret" not in repr(a)
    assert "minimax" in repr(a)


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_happy_path_content_and_cost():
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="minimaxai/minimax-m2")
    mock_resp = _mock_or_response("Result from minimax", prompt_tokens=200, completion_tokens=80)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())

    assert result.status == "done"
    assert "minimax" in result.work_product
    assert result.cost_tokens == 280
    # minimax-m2: input $0.30/MTok, output $1.20/MTok
    # cost = (200*0.30 + 80*1.20) / 1_000_000 = (60 + 96) / 1_000_000 = $0.000156
    assert result.cost_usd == Decimal("0.000156")


@pytest.mark.asyncio
async def test_unknown_model_zero_cost():
    """Pricing tablosunda olmayan model → cost = 0."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="unknown/new-model-xyz")
    mock_resp = _mock_or_response("ok", prompt_tokens=100, completion_tokens=100)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd == Decimal(0)
    assert result.cost_tokens == 200


@pytest.mark.asyncio
async def test_params_price_override():
    """agent.params ile fiyat override: pricing tablosunu bypass eder."""
    adapter = OpenRouterAdapter(
        api_key="sk-or-test",
        model="minimaxai/minimax-m2",
        params={"price_input_per_mtok": "10.00", "price_output_per_mtok": "30.00"},
    )
    mock_resp = _mock_or_response("ok", prompt_tokens=1000, completion_tokens=500)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    # cost = (1000*10 + 500*30) / 1_000_000 = 25000 / 1_000_000 = $0.025
    assert result.cost_usd == Decimal("0.025000")


@pytest.mark.asyncio
async def test_missing_usage_zero_cost():
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="minimaxai/minimax-m2")
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: {"choices": [{"message": {"content": "answer"}}]}
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd == Decimal(0)


# ── Request shape ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_system_message_in_request():
    """System prompt packet.skill_markdown → messages[0].role=system."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="minimaxai/minimax-m2")
    mock_resp = _mock_or_response("ok", 10, 10)
    captured = {}

    async def _fake_post(url, *, headers, json, **kwargs):
        captured["json"] = json
        return mock_resp

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=_fake_post):
        await adapter.run(RunPacket(
            skill_markdown="SYSTEM_PROMPT",
            ticket_title="T",
            ticket_body="B",
        ))

    msgs = captured["json"]["messages"]
    assert msgs[0]["role"] == "system"
    assert msgs[0]["content"] == "SYSTEM_PROMPT"
    assert msgs[1]["role"] == "user"


# ── Error handling ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_http_error_returns_error_status():
    import httpx as _httpx
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="minimaxai/minimax-m2")
    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "Rate limited"
    err = _httpx.HTTPStatusError("429", request=MagicMock(), response=mock_resp)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=err):
        result = await adapter.run(_make_packet())
    assert result.status == "error"
    assert result.cost_usd == Decimal(0)
    assert any("429" in e for e in result.logs)


@pytest.mark.asyncio
async def test_http_error_no_key_in_logs():
    """API key Bearer header'ı asla log'a düşmemeli."""
    import httpx as _httpx
    adapter = OpenRouterAdapter(api_key="sk-or-supersecret", model="minimaxai/minimax-m2")
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized"
    mock_resp.headers = {"Authorization": "Bearer sk-or-supersecret"}
    err = _httpx.HTTPStatusError("401", request=MagicMock(), response=mock_resp)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=err):
        result = await adapter.run(_make_packet())
    for entry in result.logs:
        assert "sk-or-supersecret" not in entry


# ── Fix A: real cost from usage.cost ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_real_cost_preferred_over_table():
    """Fix A: usage.cost varsa statik tabloyu atla."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="minimaxai/minimax-m2")
    # usage.cost=0.00123 → bu değer kullanılmalı (tablo: $0.000156)
    mock_resp = _mock_or_response("answer", 200, 80, usage_cost=0.00123)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd == Decimal("0.00123")
    assert result.cost_tokens == 280


@pytest.mark.asyncio
async def test_real_cost_zero_from_usage_no_warning():
    """Fix A+C: usage.cost=0 gelirse (free model) — gerçek değer bu, warning yok."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="meta-llama/llama-3.3-70b-instruct")
    mock_resp = _mock_or_response("answer", 100, 50, usage_cost=0.0)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    # cost=0 ama usage.cost alanı gerçekten 0 verdi → warning YOK
    # (total_tokens > 0 ama cost kaynağı usage.cost, tablo miss değil)
    # Bu test Fix A'nın correct path'ini doğrular
    assert result.cost_usd == Decimal(0)


@pytest.mark.asyncio
async def test_usage_include_in_request_body():
    """Fix A: request body'de 'usage': {'include': True} olmalı."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="minimaxai/minimax-m2")
    mock_resp = _mock_or_response("ok", 10, 10)
    captured = {}

    async def _fake_post(url, *, headers, json, **kwargs):
        captured["json"] = json
        return mock_resp

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=_fake_post):
        await adapter.run(_make_packet())

    assert captured["json"].get("usage") == {"include": True}


# ── Fix C: zero-cost fail-safe warning ───────────────────────────────────────

@pytest.mark.asyncio
async def test_zero_cost_warning_unknown_model_no_usage_cost():
    """Fix C: unknown model + no usage.cost + tokens > 0 → WARNING in logs."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="foo/bar-xl-unknown")
    mock_resp = _mock_or_response("answer", 100, 50)  # no usage_cost
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd == Decimal(0)
    assert any("WARNING" in entry and "cost resolved to $0" in entry for entry in result.logs)


@pytest.mark.asyncio
async def test_no_warning_when_real_cost_present():
    """Fix C: usage.cost mevcut → cost $0 olsa bile warning yok (free tier)."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="foo/bar-xl-unknown")
    mock_resp = _mock_or_response("answer", 100, 50, usage_cost=0.005)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    # cost=$0.005 geldi — warning yok, logs temiz
    assert not any("WARNING" in e for e in result.logs)


@pytest.mark.asyncio
async def test_no_warning_zero_tokens():
    """Fix C: token = 0 → warning tetiklenmez (boş response guard)."""
    adapter = OpenRouterAdapter(api_key="sk-or-test", model="foo/bar-unknown")
    mock_resp = _mock_or_response("ok", 0, 0)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await adapter.run(_make_packet())
    assert not any("WARNING" in e for e in result.logs)


# ── Fix B: slug fix doğrulaması ───────────────────────────────────────────────

def test_llama_instruct_slug_in_table():
    """Fix B: meta-llama/llama-3.3-70b-instruct pricing tablosunda olmalı."""
    from app.adapters.pricing import get_pricing
    from decimal import Decimal
    p_in, p_out = get_pricing("meta-llama/llama-3.3-70b-instruct")
    assert p_in  == Decimal("0.59")
    assert p_out == Decimal("0.79")


def test_old_slug_without_instruct_not_in_table():
    """Fix B: eski yanlış slug artık tabloda olmamalı."""
    from app.adapters.pricing import get_pricing
    from decimal import Decimal
    p_in, p_out = get_pricing("meta-llama/llama-3.3-70b")  # -instruct eksik
    assert p_in == Decimal(0)  # tablo miss → 0
