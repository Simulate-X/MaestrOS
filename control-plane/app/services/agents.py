"""
Agent yönetim servisleri.

swap_worker_model: Bir worker'ın provider/model'ini değiştirir.
  - Model gerçekten var mı? → adapter.list_models() ile kontrol
  - CEO initiated? → sadece yerel (ollama) modeller
  - Human initiated? → kayıtlı her provider
  - Audit log'a yazar
"""

import logging
from dataclasses import dataclass

from app.models import Agent
from app.services.audit import emit_audit

log = logging.getLogger("services.agents")

# CEO'nun autonomous olarak hedefleyebileceği provider'lar (v1: sadece ollama)
_CEO_ALLOWED_PROVIDERS: frozenset[str] = frozenset({"ollama"})


@dataclass
class SwapResult:
    agent: Agent
    old_provider: str
    old_model: str


class NeedsHumanApproval(Exception):
    """CEO'nun autonomous sınırını aşan swap girişimi."""


async def swap_worker_model(
    session,
    *,
    agent_id: int,
    new_provider: str,
    new_model: str,
    initiated_by: str = "ceo",   # "ceo" | "human"
    reason: str | None = None,
) -> SwapResult:
    """
    Worker agent'ın model/provider'ını değiştir.

    Kurallar:
      1. Agent yoksa → ValueError (404 benzeri)
      2. Model gerçekten mevcut mu? → provider adapter list_models() ile doğrula
         (hallucinated model adları reddedilir)
      3. initiated_by="ceo" ve new_provider NOT IN _CEO_ALLOWED_PROVIDERS
         → NeedsHumanApproval hatası
      4. Güncelle + audit yaz

    Caller'ın aktif bir begin() bloğu içinde çağırması gerekir (atomik garanti).
    """
    agent = await session.get(Agent, agent_id)
    if agent is None:
        raise ValueError(f"agent {agent_id} not found")

    # ── 1) AUTONOMOUS BOUNDARY CHECK ─────────────────────────────────────────
    if initiated_by == "ceo" and new_provider.lower() not in _CEO_ALLOWED_PROVIDERS:
        raise NeedsHumanApproval(
            f"CEO cannot autonomously swap to provider={new_provider!r}. "
            f"Allowed: {sorted(_CEO_ALLOWED_PROVIDERS)}. Escalate to human."
        )

    # ── 2) MODEL EXISTENCE VALIDATION ────────────────────────────────────────
    await _validate_model_exists(new_provider, new_model)

    # ── 3) APPLY SWAP ────────────────────────────────────────────────────────
    old_provider = agent.provider
    old_model = agent.model

    agent.provider = new_provider
    agent.model = new_model

    # ── 4) AUDIT ─────────────────────────────────────────────────────────────
    detail = (
        f"initiated_by={initiated_by} | "
        f"{old_provider}/{old_model} → {new_provider}/{new_model}"
    )
    if reason:
        detail += f" | reason: {reason}"

    await emit_audit(
        session,
        actor_kind="agent" if initiated_by == "ceo" else "operator",
        actor_label="ceo" if initiated_by == "ceo" else "operator",
        action="model_swapped",
        target_kind="agent",
        target_id=agent.id,
        target_label=agent.title,
        detail=detail,
        company_id=agent.company_id,
    )

    log.info(
        "swap_worker_model: agent=%d %s/%s → %s/%s (by=%s)",
        agent_id, old_provider, old_model, new_provider, new_model, initiated_by,
    )
    return SwapResult(agent=agent, old_provider=old_provider, old_model=old_model)


async def _validate_model_exists(provider: str, model: str) -> None:
    """
    Provider adapter'ının list_models() metodunu çağırarak modelin
    gerçekten var olduğunu doğrular.

    Bilinmeyen provider için NotImplementedError — caller yakalar.
    Model listede yoksa → ValueError.
    """
    from app.adapters.base import ADAPTER_REGISTRY  # lazy import — döngüsel kaçınma

    # ADAPTER_REGISTRY'yi populate etmek için adapters __init__'i tetikle
    import app.adapters  # noqa: F401 — side-effect import

    adapter_cls = ADAPTER_REGISTRY.get(provider.lower())
    if adapter_cls is None:
        raise ValueError(
            f"provider {provider!r} not registered. "
            f"Known: {list(ADAPTER_REGISTRY.keys())}"
        )

    list_models_fn = getattr(adapter_cls, "list_models", None)
    if list_models_fn is None:
        # Provider list_models desteklemiyor — validasyon atla (güvenli taraf)
        log.warning(
            "_validate_model_exists: provider=%s has no list_models(), skipping validation",
            provider,
        )
        return

    try:
        available = await list_models_fn()
    except Exception as exc:
        # Provider ulaşılamıyor — reject et, session bütünlüğü bozulmasın
        raise ValueError(
            f"Could not reach provider {provider!r} to validate model list: {exc}"
        ) from exc

    if model not in available:
        raise ValueError(
            f"Model {model!r} not found in provider {provider!r}. "
            f"Available: {available}"
        )
