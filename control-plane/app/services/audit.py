"""
Audit service — append-only event emission.

emit_audit() joins the *caller's* transaction — it never opens its own session
or begin block.  This guarantees atomicity: the audited action and its log entry
commit or roll back together.  A half-written audit is structurally impossible.
"""
from app.models import AuditEvent


async def emit_audit(
    session,
    *,
    actor_kind: str,            # "operator" | "agent" | "system"
    actor_label: str,           # "operator" | "scheduler" | "budget" | agent.title
    action: str,                # free string — approved, rejected, hired, ...
    target_kind: str,           # "ticket" | "agent" | "company"
    target_id: int,
    target_label: str,          # DENORMALIZED snapshot of name/title at event time
    actor_id: int | None = None,
    detail: str | None = None,
    company_id: int | None = None,
) -> None:
    """
    Append an immutable audit event to the current transaction.
    The caller is responsible for being inside an active begin() block.
    """
    session.add(AuditEvent(
        actor_kind=actor_kind,
        actor_id=actor_id,
        actor_label=actor_label,
        action=action,
        target_kind=target_kind,
        target_id=target_id,
        target_label=target_label,
        detail=detail,
        company_id=company_id,
    ))
