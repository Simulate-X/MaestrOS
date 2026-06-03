"""
Verdict block parser (v2 — Faz 2.6).

Değişiklik: enum hardcode kaldırıldı.
Parser yalnızca yapısal doğrulama yapar:
  - fenced ```verdict``` block var mı?
  - İçi geçerli JSON object mı?
  - "decision" alanı string mi?

Semantik doğrulama (izinli set kontrolü) auto_chain'in sorumluluğunda:
  phase.default_verdict ve phase.branch_on_verdict per-phase set'i tanımlar.
Bu sayede yeni verdict değerleri (ship, hold, …) parser'a dokunmadan eklenir.

Kurallar:
  - Last occurrence wins.
  - Missing/malformed/non-string → "unparseable" (ASLA sessiz default).
"""

import re
import json

# Fenced code block with explicit `verdict` tag.
# DOTALL: JSON multi-line formatında yazılabilsin.
_VERDICT_BLOCK_RE = re.compile(r"```verdict\s*\n(.+?)\n```", re.DOTALL)


def parse_verdict(work_product: str) -> tuple[str, str | None]:
    """Extract verdict decision string from work_product.

    Returns (decision, error_reason).
      - decision: raw string value of the "decision" field, or "unparseable".
      - error_reason: human-readable explanation when decision == "unparseable".

    Semantic validation (is this decision valid for this phase?) is the caller's
    responsibility — auto_chain validates per-phase allowed set.
    """
    matches = _VERDICT_BLOCK_RE.findall(work_product)
    if not matches:
        return "unparseable", "no ```verdict block found"

    last = matches[-1].strip()
    try:
        payload = json.loads(last)
    except json.JSONDecodeError as e:
        return "unparseable", f"verdict block JSON parse error: {e.msg}"

    if not isinstance(payload, dict):
        return "unparseable", "verdict payload is not a JSON object"

    decision = payload.get("decision")
    if not isinstance(decision, str):
        return "unparseable", f"decision must be a string, got {type(decision).__name__}"

    return decision, None
