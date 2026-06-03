import asyncio
import logging
import signal

from sqlalchemy import select

from app.config import settings
from app.db import SessionMaker, engine
from app.models import Agent
from app.services.wake import run_wake
from app.services.reaper import reap_orphans
from app.services import budget

log = logging.getLogger("scheduler")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

shutdown = asyncio.Event()
sem: asyncio.Semaphore  # main() icinde init edilir


async def wake_one_bounded(agent_id: int) -> None:
    """Semaphore ile sinirlandirilmis wake. Her task kendi session'ini
    run_wake icinde acar — scheduler ortak session tutmaz."""
    async with sem:
        try:
            res = await run_wake(agent_id)
            if res.get("status") not in (None, "no_work"):
                log.info("wake agent=%s -> %s", agent_id, res)
        except Exception as e:
            log.exception("wake error agent=%s: %r", agent_id, e)


async def tick() -> None:
    # 1) Orphan recovery
    async with SessionMaker() as s:
        n = await reap_orphans(s, settings.LEASE_TIMEOUT_SECONDS)
        if n:
            log.info("reaper reclaimed %d orphan(s)", n)

    # 2) Faz 4.2: over-budget şirketleri tick başına bir kez hesapla
    async with SessionMaker() as s:
        blocked_companies = await budget.over_budget_company_ids(s)

    # 3) Active agent'lar — over-budget şirketlerin agent'ları hariç
    async with SessionMaker() as s:
        q = select(Agent.id).where(Agent.status == "active")
        if blocked_companies:
            q = q.where(Agent.company_id.notin_(blocked_companies))
        agent_ids = (await s.execute(q)).scalars().all()

    if not agent_ids:
        return

    # 4) Fan-out — her agent icin bounded task
    await asyncio.gather(
        *(wake_one_bounded(aid) for aid in agent_ids),
        return_exceptions=False,
    )


async def main() -> None:
    global sem
    sem = asyncio.Semaphore(settings.SCHEDULER_MAX_CONCURRENT)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown.set)

    log.info(
        "scheduler started — tick=%ss concurrency=%d lease=%ss",
        settings.SCHEDULER_TICK_INTERVAL,
        settings.SCHEDULER_MAX_CONCURRENT,
        settings.LEASE_TIMEOUT_SECONDS,
    )

    try:
        while not shutdown.is_set():
            await tick()
            # Uyku sirasinda shutdown gelirse erken cik — busy-spin yok
            try:
                await asyncio.wait_for(
                    shutdown.wait(),
                    timeout=settings.SCHEDULER_TICK_INTERVAL,
                )
            except asyncio.TimeoutError:
                continue
    finally:
        # Graceful drain: tum permit'leri acquire ederek in-flight'larin
        # bitmesini bekle. Yeni tick baslamadigi icin bu deterministik.
        log.info("draining in-flight wakes...")
        for _ in range(settings.SCHEDULER_MAX_CONCURRENT):
            await sem.acquire()
        await engine.dispose()
        log.info("stopped cleanly")


if __name__ == "__main__":
    asyncio.run(main())
