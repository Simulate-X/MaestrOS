"""Per-model USD pricing per million tokens (input, output).

Operatör fiyatlar değiştiğinde bu dosyayı update eder + redeploy.
Bilinmeyen modelde (0, 0) döner + warning log — agent.params ile override mümkün.
"""

import logging
from decimal import Decimal

log = logging.getLogger("pricing")

# (input_per_mtok, output_per_mtok) — USD / 1M tokens
PRICING: dict[str, tuple[Decimal, Decimal]] = {
    # ── Anthropic native ─────────────────────────────────────────────────────
    "claude-haiku-4-5-20251001": (Decimal("1.00"),  Decimal("5.00")),
    "claude-sonnet-4-6":         (Decimal("3.00"),  Decimal("15.00")),
    "claude-opus-4-7":           (Decimal("15.00"), Decimal("75.00")),
    # ── OpenRouter — "provider/model" formatı ────────────────────────────────
    "anthropic/claude-haiku-4.5":   (Decimal("1.00"),  Decimal("5.00")),
    "anthropic/claude-sonnet-4.6":  (Decimal("3.00"),  Decimal("15.00")),
    "openai/gpt-4o-mini":           (Decimal("0.15"),  Decimal("0.60")),
    "openai/gpt-4o":                (Decimal("2.50"),  Decimal("10.00")),
    "minimaxai/minimax-m2":         (Decimal("0.30"),  Decimal("1.20")),
    "meta-llama/llama-3.3-70b-instruct": (Decimal("0.59"), Decimal("0.79")),
    # ── Ollama local — explicit zero (ücretsiz) ──────────────────────────────
    # (model adları dinamik; bilinmeyen Ollama modelleri de zaten (0,0) döner)
}


def get_pricing(model: str, params: dict | None = None) -> tuple[Decimal, Decimal]:
    """Resolve pricing for a model.

    Priority:
    1. agent.params içinde price_input_per_mtok + price_output_per_mtok varsa onları kullan
    2. Yoksa PRICING tablosundan bak
    3. Hiçbiri yoksa (Decimal(0), Decimal(0)) + warning log
    """
    if params:
        p_in  = params.get("price_input_per_mtok")
        p_out = params.get("price_output_per_mtok")
        if p_in is not None and p_out is not None:
            return Decimal(str(p_in)), Decimal(str(p_out))

    if model in PRICING:
        return PRICING[model]

    log.warning(
        "pricing: model %r not in PRICING table and no params override — "
        "cost_usd will be 0. Add to pricing.py or set price params on agent.",
        model,
    )
    return Decimal(0), Decimal(0)


def compute_cost_usd(
    input_tokens: int,
    output_tokens: int,
    input_price_per_mtok: Decimal,
    output_price_per_mtok: Decimal,
) -> Decimal:
    """USD cost from token counts and per-MTok prices.
    Decimal throughout — float hatası birikimi olmaz.
    """
    return (
        Decimal(input_tokens)  * input_price_per_mtok
        + Decimal(output_tokens) * output_price_per_mtok
    ) / Decimal(1_000_000)
