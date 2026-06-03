"""Unit tests for AnthropicAdapter (mocked httpx)."""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.adapters.anthropic import AnthropicAdapter
from app.adapters.base import RunPacket


def _make_packet() -> RunPacket:
    return RunPacket(
        skill_markdown="You are a helpful assistant.",
        ticket_title="Test",
        ticket_body="Say hi.",
    )


def _mock_response(content_text: str, input_tokens: int, output_tokens: int):
    resp = MagicMock()
    resp.json = lambda: {
        "content": [{"type": "text", "text": content_text}],
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }
    resp.raise_for_status = lambda: None
    return resp


# ── Constructor validation ────────────────────────────────────────────────────

def test_missing_key_raises():
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        AnthropicAdapter(api_key="", model="claude-haiku-4-5-20251001")


def test_repr_hides_key():
    a = AnthropicAdapter(api_key="sk-ant-secret", model="claude-haiku-4-5-20251001")
    assert "sk-ant-secret" not in repr(a)
    assert "claude-haiku-4-5-20251001" in repr(a)


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_happy_path_content_and_cost():
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-haiku-4-5-20251001")
    mock_resp = _mock_response("Hello from Claude", input_tokens=100, output_tokens=50)

    with patch.object(adapter, "run", wraps=adapter.run):
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            result = await adapter.run(_make_packet())

    assert result.status == "done"
    assert "Claude" in result.work_product
    assert result.cost_tokens == 150
    # haiku-4-5: input $1/MTok, output $5/MTok
    # cost = (100*1 + 50*5) / 1_000_000 = 350 / 1_000_000 = $0.000350
    assert result.cost_usd == Decimal("0.000350")


@pytest.mark.asyncio
async def test_multi_content_blocks_joined():
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-haiku-4-5-20251001")
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: {
        "content": [
            {"type": "text", "text": "Part 1"},
            {"type": "text", "text": "Part 2"},
        ],
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
        result = await adapter.run(_make_packet())
    assert result.work_product == "Part 1\nPart 2"


@pytest.mark.asyncio
async def test_missing_usage_returns_zero_cost():
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-haiku-4-5-20251001")
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: {
        "content": [{"type": "text", "text": "answer"}],
        # usage field missing
    }
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd == Decimal(0)
    assert result.cost_tokens == 0


# ── Error handling ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_http_error_returns_error_status():
    import httpx as _httpx
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-haiku-4-5-20251001")

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"

    err = _httpx.HTTPStatusError("401", request=MagicMock(), response=mock_response)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=err):
        result = await adapter.run(_make_packet())

    assert result.status == "error"
    assert result.cost_usd == Decimal(0)
    assert any("401" in log_entry for log_entry in result.logs)


@pytest.mark.asyncio
async def test_http_error_logs_no_headers():
    """Header'lar asla loglanmamalı — sadece body excerpt."""
    import httpx as _httpx
    adapter = AnthropicAdapter(api_key="sk-ant-secret", model="claude-haiku-4-5-20251001")

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    # Headers'ta API key var — ama bu bilgi log'a giremez
    mock_response.headers = {"x-api-key": "sk-ant-secret"}

    err = _httpx.HTTPStatusError("500", request=MagicMock(), response=mock_response)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=err):
        result = await adapter.run(_make_packet())

    # API key hiçbir log entry'sinde görünmemeli
    for entry in result.logs:
        assert "sk-ant-secret" not in entry


@pytest.mark.asyncio
async def test_network_exception_returns_error():
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-haiku-4-5-20251001")
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=Exception("timeout")):
        result = await adapter.run(_make_packet())
    assert result.status == "error"
    assert result.cost_usd == Decimal(0)


# ── Fix C: zero-cost fail-safe ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_zero_cost_warning_unknown_model():
    """Fix C: pricing tablosunda olmayan model + token > 0 → WARNING in logs."""
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-nonexistent-9999")
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: {
        "content": [{"type": "text", "text": "answer"}],
        "usage": {"input_tokens": 100, "output_tokens": 50},
    }
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd == Decimal(0)
    assert any("WARNING" in e and "cost resolved to $0" in e for e in result.logs)


@pytest.mark.asyncio
async def test_no_warning_known_model():
    """Fix C: pricing tablosunda olan model → cost > 0, warning yok."""
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-haiku-4-5-20251001")
    resp = _mock_response("answer", 100, 50)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
        result = await adapter.run(_make_packet())
    assert result.cost_usd > Decimal(0)
    assert not any("WARNING" in e for e in result.logs)


@pytest.mark.asyncio
async def test_no_warning_zero_tokens():
    """Fix C: token = 0 → warning tetiklenmez."""
    adapter = AnthropicAdapter(api_key="sk-ant-test", model="claude-nonexistent-9999")
    resp = MagicMock()
    resp.raise_for_status = lambda: None
    resp.json = lambda: {
        "content": [{"type": "text", "text": "answer"}],
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
        result = await adapter.run(_make_packet())
    assert not any("WARNING" in e for e in result.logs)
