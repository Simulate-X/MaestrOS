"""
Unit tests for verdict_parser.parse_verdict (v2 — Faz 2.6).

Değişiklik: enum hardcode kaldırıldı → bilinmeyen verdict'ler artık "unparseable" değil,
ham string olarak döner. Semantik validasyon auto_chain'in sorumluluğunda.

Kurallar (spec'ten):
  - Structural validation: fenced block + JSON object + string decision field
  - Last occurrence wins
  - Missing/malformed/non-string → unparseable (ASLA sessiz default)
"""
import pytest
from app.services.verdict_parser import parse_verdict


def _wrap(decision_value: str, extra_text: str = "") -> str:
    """Helper: valid verdict block oluştur."""
    return f'{extra_text}\n```verdict\n{{"decision": "{decision_value}"}}\n```'


# ── Happy path ────────────────────────────────────────────────────────────────

def test_clean_approve():
    assert parse_verdict(_wrap("approve")) == ("approve", None)


def test_clean_rework():
    assert parse_verdict(_wrap("rework")) == ("rework", None)


def test_clean_escalate():
    assert parse_verdict(_wrap("escalate")) == ("escalate", None)


def test_clean_ship():
    """Faz 2.6: ship verdict yeni eklendi."""
    assert parse_verdict(_wrap("ship")) == ("ship", None)


def test_clean_hold():
    """Faz 2.6: hold verdict yeni eklendi."""
    assert parse_verdict(_wrap("hold")) == ("hold", None)


# ── Unknown decision → raw string (Faz 2.6 davranışı) ───────────────────────

def test_unknown_decision_returned_as_string():
    """v2.6'da enum kontrolü kaldırıldı; bilinmeyen verdict ham string döner.
    Semantik validasyon (izinli set) auto_chain'de yapılır."""
    decision, err = parse_verdict('```verdict\n{"decision":"needs_revision"}\n```')
    assert decision == "needs_revision"
    assert err is None


# ── Last occurrence wins ──────────────────────────────────────────────────────

def test_last_occurrence_wins():
    """Model önce format örneği gösteriyor, sonra gerçek verdict veriyor."""
    text = (
        'Format example: ```verdict\n{"decision":"approve"}\n```\n'
        "...actual verdict below...\n"
        '```verdict\n{"decision":"rework"}\n```'
    )
    assert parse_verdict(text) == ("rework", None)


def test_last_occurrence_wins_escalate():
    text = (
        '```verdict\n{"decision":"rework"}\n```\n'
        "After further review:\n"
        '```verdict\n{"decision":"escalate"}\n```'
    )
    assert parse_verdict(text) == ("escalate", None)


def test_last_occurrence_wins_hold():
    """Faz 2.6: hold son occurrence wins."""
    text = (
        '```verdict\n{"decision":"ship"}\n```\n'
        "On reflection:\n"
        '```verdict\n{"decision":"hold"}\n```'
    )
    assert parse_verdict(text) == ("hold", None)


# ── Unparseable — missing ─────────────────────────────────────────────────────

def test_missing_block_unparseable():
    decision, err = parse_verdict("Just some review text, no verdict block.")
    assert decision == "unparseable"
    assert err is not None
    assert "no" in err.lower()


def test_empty_string_unparseable():
    decision, err = parse_verdict("")
    assert decision == "unparseable"


# ── Unparseable — malformed JSON ──────────────────────────────────────────────

def test_malformed_json_unparseable():
    text = "```verdict\n{decision: approve}\n```"   # bare keys — not valid JSON
    decision, err = parse_verdict(text)
    assert decision == "unparseable"
    assert err is not None


def test_trailing_comma_unparseable():
    text = '```verdict\n{"decision": "approve",}\n```'  # trailing comma
    decision, err = parse_verdict(text)
    assert decision == "unparseable"


# ── Unparseable — non-string decision ────────────────────────────────────────

def test_null_decision_unparseable():
    text = '```verdict\n{"decision": null}\n```'
    decision, err = parse_verdict(text)
    assert decision == "unparseable"
    assert "string" in err


def test_missing_decision_key_unparseable():
    text = '```verdict\n{"verdict": "approve"}\n```'   # wrong key
    decision, err = parse_verdict(text)
    assert decision == "unparseable"
    assert "string" in err


# ── Unparseable — non-object payload ─────────────────────────────────────────

def test_non_object_unparseable():
    text = '```verdict\n"approve"\n```'   # bare string, not object
    decision, err = parse_verdict(text)
    assert decision == "unparseable"
    assert "not a JSON object" in err


def test_array_payload_unparseable():
    text = '```verdict\n["approve"]\n```'
    decision, err = parse_verdict(text)
    assert decision == "unparseable"


# ── Multi-line JSON ───────────────────────────────────────────────────────────

def test_multiline_json_parses():
    """DOTALL flag: model multi-line JSON yazabilmeli."""
    text = '```verdict\n{\n  "decision": "approve"\n}\n```'
    assert parse_verdict(text) == ("approve", None)


def test_multiline_json_ship():
    """Faz 2.6: ship multi-line."""
    text = '```verdict\n{\n  "decision": "ship"\n}\n```'
    assert parse_verdict(text) == ("ship", None)
