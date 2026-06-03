"""
Context injection: ticket'a atanmış ContextDocument'ları skill markdown'ına ekler.

Tasarım kararı: context bloğu skill markdown'ının SONUNA eklenir.
Sebep: model önce rol kimliğini ve kurallarını okumalı, ardından referans
materyali görmeli. Context'in üstte olması rol kimliğini gölgeler.

Geriye dönük uyumluluk: context_doc_ids boş → Faz 1 ile birebir aynı davranış.
"""

import logging
from sqlalchemy import select

from app.models import ContextDocument
from app.adapters.base import RunPacket

log = logging.getLogger("context")


async def build_run_packet(session, ticket, skill=None) -> RunPacket:
    """
    Parametreler:
      session       — açık SQLAlchemy async session (commit olmamış)
      ticket        — Ticket ORM nesnesi (context_doc_ids erişilebilir olmalı)
      skill         — Skill ORM nesnesi veya None (skill yoksa boş markdown)

    Döndürür:
      RunPacket — adapter'a verilmeye hazır paket
    """
    base_markdown: str = skill.markdown_body if skill else ""

    context_blocks: list[str] = []
    doc_ids: list[int] = list(ticket.context_doc_ids or [])

    if doc_ids:
        rows = (await session.execute(
            select(ContextDocument).where(ContextDocument.id.in_(doc_ids))
        )).scalars().all()

        # ticket.context_doc_ids listesinin sırası yetkilidir — stabil ve deterministik
        id_order = {doc_id: idx for idx, doc_id in enumerate(doc_ids)}
        rows_sorted = sorted(rows, key=lambda d: id_order.get(d.id, 9999))

        for doc in rows_sorted:
            context_blocks.append(
                f"## Context · {doc.name} ({doc.kind})\n\n{doc.body}"
            )

        if context_blocks:
            log.debug(
                "context_injection: ticket=%d doc_count=%d",
                ticket.id, len(context_blocks),
            )

    if context_blocks:
        enriched = (
            base_markdown
            + "\n\n---\n\n# Sana Sağlanan Bağlam\n\n"
            + "Aşağıdaki bilgi bu görev için referans materyaldir. "
            + "Bu bilgide olmayan alan adı / endpoint / parametre **uydurma** — "
            + "bunları Açık Sorular bölümüne yaz.\n\n"
            + "\n\n".join(context_blocks)
        )
    else:
        enriched = base_markdown  # Faz 1 ile birebir aynı

    return RunPacket(
        skill_markdown=enriched,
        ticket_title=ticket.title,
        ticket_body=ticket.body,
    )
