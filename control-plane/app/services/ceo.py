"""
CEO Autonomous Decision Service (v1)

ceo_adjudicate_blocked_ticket:
  - Blocked / max_reworks ticket için CEO'nun karar vermesini sağlar.
  - CEO kendi adapter'ı (anthropic) üzerinden çağrılır.
  - Çıktı: CeoDecision dataclass (structured, JSON-parsed).
  - Execution bu fonksiyonun görevi DEĞİL — orchestrator (handle_max_reworks_block) yürütür.

Design: structured-decision (NOT tool-calling loops).
  CEO tek bir JSON objesi döndürür; orchestrator kod yürütür.
  QA Lead verdict pattern'ıyla birebir uyumlu.
"""

import json
import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select

from app.models import Agent, Run, Ticket, Phase
from app.adapters import build_adapter
from app.adapters.base import RunPacket

log = logging.getLogger("services.ceo")

# ── Veri yapıları ──────────────────────────────────────────────────────────────

@dataclass
class CeoDecision:
    action: str                    # "swap_model" | "escalate_human" | "replan"
    target_agent_id: int | None
    new_provider: str | None
    new_model: str | None
    reason: str
    raw_json: dict = field(default_factory=dict)   # debug için ham parse çıktısı


# ── CEO Prompt ──────────────────────────────────────────────────────────────────

_CEO_SYSTEM_PROMPT = """\
You are the CEO of an autonomous AI software company called MaestrOS.
Your role is to manage AI worker agents — you are their orchestrator and manager.

A ticket has been blocked because a worker agent exceeded its maximum rework limit.
Your job is to diagnose the failure and decide the best recovery action.

## Decision Framework

Classify the failure into ONE category:
- **capability_gap**: The worker model is simply not capable enough for this task.
  The output is structurally wrong, fundamentally incomplete, or shows repeated
  misunderstanding despite clear instructions.
- **spec_ambiguity**: The specification or instructions are unclear. Even a stronger
  model would likely fail without clarification.
- **genuinely_hard**: The task is intrinsically difficult. A stronger model might help,
  but the issue is not obvious capability gap.

## Actions

Based on your classification, choose ONE action:
- `swap_model`: Replace the worker with a stronger LOCAL model from the provided roster.
  Only choose this for `capability_gap`. NEVER choose a cloud/paid model — those require
  human approval.
- `escalate_human`: Escalate to the human board. Use for `spec_ambiguity`,
  `genuinely_hard`, or when no suitable stronger local model is available.
- `replan`: The ticket spec needs to be rewritten. Use when the failure is clearly
  due to a bad specification that needs replanning.

## Output format

Respond with ONLY this JSON object — no prose, no markdown fences, no explanation:
{
  "action": "swap_model | escalate_human | replan",
  "target_agent_id": <int or null>,
  "new_provider": "<provider or null>",
  "new_model": "<model name or null>",
  "reason": "<one short sentence explaining why>"
}

If action is not swap_model, set target_agent_id, new_provider, new_model to null.
"""


def _build_ceo_user_prompt(
    ticket: Ticket,
    worker: Agent,
    qa_feedbacks: list[str],
    attempts: list[str],
    available_stronger_models: list[str],
    rework_count: int,
) -> str:
    feedbacks_text = "\n\n".join(
        f"### Feedback #{i+1}\n{fb}" for i, fb in enumerate(qa_feedbacks)
    ) or "(no QA feedback available)"

    attempts_text = "\n\n".join(
        f"### Attempt #{i+1}\n{att[:1500]}{'...[truncated]' if len(att) > 1500 else ''}"
        for i, att in enumerate(attempts)
    ) or "(no attempts recorded)"

    models_text = (
        "\n".join(f"  - {m}" for m in available_stronger_models)
        if available_stronger_models
        else "  (none available — no stronger local model found)"
    )

    return f"""## Blocked Ticket

**Title:** {ticket.title}
**Rework iterations exhausted:** {rework_count}
**Worker Agent:** {worker.title} (id={worker.id}, provider={worker.provider}, model={worker.model})

## Original Spec / Input
{ticket.body[:2000]}{'...[truncated]' if len(ticket.body) > 2000 else ''}

## Worker's Build Attempts
{attempts_text}

## QA Review Feedback (reasons for rework)
{feedbacks_text}

## Available Stronger Local Models for this worker's role
{models_text}

---
Now make your decision. Remember: only `swap_model` to local models from the list above.
If the list is empty or no local model would help, choose `escalate_human`.
"""


# ── CEO Agent lookup ────────────────────────────────────────────────────────────

async def _find_ceo_agent(session, company_id: int) -> Agent | None:
    """
    Şirkette role='ceo' olan aktif ajan.
    CEO birden fazlaysa ilkini alır (v1: tek CEO varsayımı).
    """
    return (await session.execute(
        select(Agent).where(
            Agent.company_id == company_id,
            Agent.role == "ceo",
            Agent.status == "active",
        ).limit(1)
    )).scalar_one_or_none()


# ── Available stronger models ───────────────────────────────────────────────────

async def _get_available_stronger_models(worker: Agent) -> list[str]:
    """
    Worker'ın provider'ında bulunan, mevcut modelden 'daha güçlü' modelleri döndür.

    v1 heuristic: model ismi sıralama — büyük parametre sayısı içeren isimler
    (14b, 32b, 70b vs.) daha güçlü kabul edilir.
    Yalnızca ollama gibi local provider'lar için çalışır.
    """
    from app.adapters.base import ADAPTER_REGISTRY
    import app.adapters  # noqa: F401

    adapter_cls = ADAPTER_REGISTRY.get(worker.provider.lower())
    if adapter_cls is None:
        return []

    list_fn = getattr(adapter_cls, "list_models", None)
    if list_fn is None:
        return []

    try:
        all_models: list[str] = await list_fn()
    except Exception as exc:
        log.warning("_get_available_stronger_models: list_models failed: %s", exc)
        return []

    current = worker.model
    if current not in all_models:
        # Mevcut model listede yok — tüm listeyi döndür (migration durumu)
        return [m for m in all_models if m != current]

    current_size = _extract_param_size(current)
    stronger = [
        m for m in all_models
        if m != current and _extract_param_size(m) > current_size
    ]

    # Parametre boyutuna göre sırala (küçükten büyüğe — en az-yeterli seçim)
    stronger.sort(key=_extract_param_size)
    return stronger


def _extract_param_size(model_name: str) -> float:
    """
    Model adından parametre büyüklüğü çıkar (örn: '7b' → 7.0, '14b' → 14.0).
    Bulunamazsa 0.0 döndür.
    """
    # "7b", "14b", "70b", "0.5b", "1.5b" gibi formatlar
    m = re.search(r"(\d+(?:\.\d+)?)\s*b", model_name.lower())
    if m:
        return float(m.group(1))
    return 0.0


# ── JSON parser (QA verdict pattern ile aynı prensipler) ───────────────────────

def _parse_ceo_json(raw: str) -> dict | None:
    """
    CEO çıktısından JSON object parse et.
    Strip markdown fences, son JSON objesi wins.
    """
    # Markdown fence temizle
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()

    # Son {...} bloğunu bul (güvenlik: model bazen prose yazabilir)
    matches = re.findall(r"\{[^{}]*\}", cleaned, re.DOTALL)
    if not matches:
        return None

    last = matches[-1].strip()
    try:
        return json.loads(last)
    except json.JSONDecodeError:
        return None


def _validate_and_build_decision(
    parsed: dict,
    worker: Agent,
    available_stronger_models: list[str],
) -> CeoDecision:
    """
    JSON'dan CeoDecision oluştur; geçersiz swap kararlarını escalate_human'a düşür.
    """
    action = parsed.get("action", "escalate_human")
    target_agent_id = parsed.get("target_agent_id")
    new_provider = parsed.get("new_provider")
    new_model = parsed.get("new_model")
    reason = parsed.get("reason", "(no reason provided)")

    if not isinstance(reason, str):
        reason = str(reason)

    # swap_model validasyonu
    if action == "swap_model":
        # target agent mevcut mu?
        if target_agent_id != worker.id:
            log.warning(
                "CEO decision: target_agent_id=%s != worker.id=%s, correcting",
                target_agent_id, worker.id,
            )
            target_agent_id = worker.id

        # Model local roster'da mı?
        if new_model not in available_stronger_models:
            log.warning(
                "CEO decision: new_model=%r not in stronger_models=%s → downgrade to escalate_human",
                new_model, available_stronger_models,
            )
            return CeoDecision(
                action="escalate_human",
                target_agent_id=None,
                new_provider=None,
                new_model=None,
                reason=(
                    f"CEO requested model {new_model!r} but it's not in the "
                    f"available local roster. Original reason: {reason}"
                ),
                raw_json=parsed,
            )

        # Provider kontrolü (sadece ollama v1)
        if new_provider and new_provider.lower() not in {"ollama"}:
            log.warning(
                "CEO decision: new_provider=%r is cloud → downgrade to escalate_human",
                new_provider,
            )
            return CeoDecision(
                action="escalate_human",
                target_agent_id=None,
                new_provider=None,
                new_model=None,
                reason=(
                    f"CEO requested cloud provider {new_provider!r} which requires "
                    f"human approval. Original reason: {reason}"
                ),
                raw_json=parsed,
            )

    return CeoDecision(
        action=action,
        target_agent_id=target_agent_id,
        new_provider=new_provider,
        new_model=new_model,
        reason=reason,
        raw_json=parsed,
    )


# ── Ana fonksiyon ────────────────────────────────────────────────────────────────

async def ceo_adjudicate_blocked_ticket(
    session,
    *,
    ticket_id: int,
) -> CeoDecision:
    """
    Blocked / max_reworks ticket için CEO'nun kararını al.

    Context toplama → CEO prompt inşa → CEO adapter'ı çağır → JSON parse → CeoDecision.
    Bu fonksiyon yalnızca KARAR döndürür; execution yapmaz.
    Caller (handle_max_reworks_block) kararı uygular.

    Session: aktif bir begin() bloğu dışında çağrılabilir (sadece okuma yapıyor);
    audit emission YOKTUR — orchestrator izer.
    """
    # ── 1) CONTEXT TOPLAMA ───────────────────────────────────────────────────
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        raise ValueError(f"ticket {ticket_id} not found")

    worker: Agent | None = None
    if ticket.assignee_agent_id:
        worker = await session.get(Agent, ticket.assignee_agent_id)
    if worker is None:
        # Fallback: owner
        if ticket.owner_agent_id:
            worker = await session.get(Agent, ticket.owner_agent_id)
    if worker is None:
        raise ValueError(
            f"ticket {ticket_id} has no worker agent assigned — cannot adjudicate"
        )

    # Bu ticket + parent zincirinden build attempt'leri ve QA feedback'leri topla
    attempts, qa_feedbacks = await _collect_run_history(session, ticket)

    # Worker'ın provider'ında daha güçlü local modeller
    available_stronger_models = await _get_available_stronger_models(worker)

    rework_count = (ticket.phase_visit_count or {}).get("review", 0)

    # ── 2) CEO AGENT BULMAK ─────────────────────────────────────────────────
    ceo_agent = await _find_ceo_agent(session, ticket.company_id)
    if ceo_agent is None:
        raise ValueError(
            f"No active CEO agent found for company {ticket.company_id}. "
            f"Create an agent with role='ceo' to enable autonomous management."
        )

    # ── 3) PROMPT INŞA ──────────────────────────────────────────────────────
    user_prompt = _build_ceo_user_prompt(
        ticket=ticket,
        worker=worker,
        qa_feedbacks=qa_feedbacks,
        attempts=attempts,
        available_stronger_models=available_stronger_models,
        rework_count=rework_count,
    )

    packet = RunPacket(
        skill_markdown=_CEO_SYSTEM_PROMPT,
        ticket_title=f"[CEO Adjudication] {ticket.title}",
        ticket_body=user_prompt,
    )

    # ── 4) CEO ADAPTER ÇAĞRISI ───────────────────────────────────────────────
    log.info(
        "ceo_adjudicate: ticket=%d worker=%d (%s/%s) stronger_models=%s",
        ticket_id, worker.id, worker.provider, worker.model, available_stronger_models,
    )

    adapter = build_adapter(ceo_agent)
    result = await adapter.run(packet)

    if result.status != "done" or not result.work_product:
        log.error(
            "ceo_adjudicate: adapter error | ticket=%d | status=%s | logs=%s",
            ticket_id, result.status, result.logs,
        )
        return CeoDecision(
            action="escalate_human",
            target_agent_id=None,
            new_provider=None,
            new_model=None,
            reason=f"CEO adapter call failed (status={result.status}): {'; '.join(result.logs[:3])}",
        )

    # ── 5) JSON PARSE + VALIDATE ─────────────────────────────────────────────
    parsed = _parse_ceo_json(result.work_product)
    if parsed is None:
        log.error(
            "ceo_adjudicate: unparseable JSON | ticket=%d | raw=%.500s",
            ticket_id, result.work_product,
        )
        return CeoDecision(
            action="escalate_human",
            target_agent_id=None,
            new_provider=None,
            new_model=None,
            reason="CEO returned unparseable output — escalating to human as safe default",
        )

    decision = _validate_and_build_decision(parsed, worker, available_stronger_models)

    log.info(
        "ceo_adjudicate: ticket=%d → action=%s reason=%r",
        ticket_id, decision.action, decision.reason,
    )
    return decision


async def _collect_run_history(
    session,
    ticket: Ticket,
) -> tuple[list[str], list[str]]:
    """
    Ticket + parent zincirinden build attempt'leri ve QA feedback'lerini topla.
    Build attempt = build phase run'ları
    QA feedback = review phase run'larının work_product'ı (rework sebebi)

    Max 10 run — context window'u patlatma.
    """
    runs = (await session.execute(
        select(Run)
        .where(Run.ticket_id == ticket.id)
        .order_by(Run.started_at.desc())
        .limit(10)
    )).scalars().all()

    # Parent ticket zinciri — rework body'leri içeriyor
    parent_runs: list[Run] = []
    current_ticket = ticket
    depth = 0
    while current_ticket.parent_ticket_id and depth < 10:
        parent = await session.get(Ticket, current_ticket.parent_ticket_id)
        if parent is None:
            break
        parent_ticket_runs = (await session.execute(
            select(Run)
            .where(Run.ticket_id == parent.id)
            .order_by(Run.started_at.desc())
            .limit(5)
        )).scalars().all()
        parent_runs.extend(parent_ticket_runs)
        current_ticket = parent
        depth += 1

    all_runs = list(runs) + parent_runs

    # Phase bilgisi olmadan heuristic ayırt etme:
    # Review agent'ı verdict block içeriyorsa QA feedback
    # Yoksa build attempt
    attempts: list[str] = []
    qa_feedbacks: list[str] = []

    for run in all_runs:
        if not run.work_product:
            continue
        if "```verdict" in run.work_product:
            qa_feedbacks.append(run.work_product)
        else:
            attempts.append(run.work_product)

    return attempts, qa_feedbacks
