"""
Aşama 2 acceptance testleri — CEO JSON parse & guardrail logic.

Senaryolar:
  1. swap_model happy path       — lokal ollama model, geçmeli
  2. cloud provider guard        — openrouter/anthropic → escalate_human'a düşmeli
  3. bozuk JSON (geveze CEO)     — unparseable → escalate_human, çökmemeli

Doğrudan ceo.py'nin private helper'larını test eder;
adapter/DB bağlantısı yok — saf birim testi.
"""

import pytest
from app.services.ceo import _parse_ceo_json, _validate_and_build_decision


# ── Minimal worker stub ───────────────────────────────────────────────────────

class _WorkerStub:
    id = 2
    provider = "ollama"
    model = "qwen2.5-coder:7b"


_WORKER = _WorkerStub()
_STRONGER_MODELS = ["qwen2.5-coder:14b", "qwen2.5-coder:32b"]


# ── Test 1: swap_model happy path ─────────────────────────────────────────────

def test_valid_local_swap_decision():
    """CEO lokal ollama model seçiyor → swap_model kararı geçmeli."""
    raw = """```json
    {
      "action": "swap_model",
      "target_agent_id": 2,
      "new_provider": "ollama",
      "new_model": "qwen2.5-coder:14b",
      "reason": "Mevcut 7b modeli syntax hatalarını çözemiyor, kapasite artırımı gerekli."
    }
    ```"""

    parsed = _parse_ceo_json(raw)
    assert parsed is not None, "JSON parse başarısız olmamalıydı"

    decision = _validate_and_build_decision(parsed, _WORKER, _STRONGER_MODELS)

    assert decision.action == "swap_model"
    assert decision.new_model == "qwen2.5-coder:14b"
    assert decision.new_provider == "ollama"
    assert decision.target_agent_id == 2


# ── Test 2: cloud provider guard ─────────────────────────────────────────────

def test_cloud_provider_downgraded_to_escalate():
    """CEO cloud (openrouter) seçiyor → güvenlik duvarı escalate_human'a düşürmeli."""
    raw = """
    {
      "action": "swap_model",
      "target_agent_id": 2,
      "new_provider": "openrouter",
      "new_model": "anthropic/claude-3-opus",
      "reason": "Bu kod çok zor, en zeki modeli getirin!"
    }
    """

    parsed = _parse_ceo_json(raw)
    assert parsed is not None

    decision = _validate_and_build_decision(parsed, _WORKER, _STRONGER_MODELS)

    assert decision.action == "escalate_human"
    assert decision.new_model is None
    assert "openrouter" in decision.reason


# ── Test 3: bozuk JSON (geveze CEO) ──────────────────────────────────────────

def test_unparseable_json_returns_none():
    """CEO JSON'u yarım bırakıyor → _parse_ceo_json None döndürmeli, çökmemeli."""
    raw = """
    Tabii ki patron, hemen modeli değiştiriyorum. İşte json dosyan:
    { "action": "swap_model", "target_agent_id": 2
    """

    parsed = _parse_ceo_json(raw)
    assert parsed is None


# ── Test 4: model roster dışı model → escalate ───────────────────────────────

def test_model_not_in_roster_downgraded():
    """CEO roster'da olmayan bir model seçiyor → escalate_human'a düşmeli."""
    raw = """{
      "action": "swap_model",
      "target_agent_id": 2,
      "new_provider": "ollama",
      "new_model": "llama3:70b",
      "reason": "Daha güçlü model lazım."
    }"""

    parsed = _parse_ceo_json(raw)
    assert parsed is not None

    decision = _validate_and_build_decision(parsed, _WORKER, _STRONGER_MODELS)

    assert decision.action == "escalate_human"
    assert "llama3:70b" in decision.reason


# ── Test 5: escalate_human direkt seçim ──────────────────────────────────────

def test_ceo_escalate_human_passthrough():
    """CEO doğrudan escalate_human seçiyor → olduğu gibi geçmeli."""
    raw = """{
      "action": "escalate_human",
      "target_agent_id": null,
      "new_provider": null,
      "new_model": null,
      "reason": "Spec belirsiz, insan müdahalesi gerekli."
    }"""

    parsed = _parse_ceo_json(raw)
    decision = _validate_and_build_decision(parsed, _WORKER, _STRONGER_MODELS)

    assert decision.action == "escalate_human"
    assert "belirsiz" in decision.reason
