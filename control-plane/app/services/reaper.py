from sqlalchemy import text


async def reap_orphans(session, lease_seconds: int) -> int:
    """Lease suresi dolmus 'running' ticket'lari kuyruga geri at.
    Tek kisa transaction; reaper hizli olmak zorunda.
    make_interval parametre kabul eder — string concat'ten guvenli.
    """
    async with session.begin():
        result = await session.execute(
            text("""
                UPDATE tickets
                   SET status='queued', owner_agent_id=NULL, locked_at=NULL
                 WHERE status='running'
                   AND locked_at < now() - make_interval(secs => :lease)
                RETURNING id
            """),
            {"lease": lease_seconds},
        )
        ids = result.scalars().all()
    return len(ids)
