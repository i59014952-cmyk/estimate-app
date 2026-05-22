"""Async-воркер для job-ов Lemana Pro.

Один процесс FastAPI = одна очередь = один long-running task, запускаемый из
lifespan(). Семафор гарантирует, что uc.Chrome крутится не более чем в
LEMANA_MAX_CONCURRENCY экземплярах. Состояние job-ов — in-memory dict, теряется
при рестарте процесса (документированное ограничение текущей архитектуры).
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

from selenium.common.exceptions import WebDriverException

from lemana_session import LemanaSession, ProductDict

logger = logging.getLogger(__name__)

MAX_CONCURRENCY = int(os.getenv("LEMANA_MAX_CONCURRENCY", "1"))
MAX_QUEUE = int(os.getenv("LEMANA_MAX_QUEUE", "10"))
JOB_TIMEOUT_SEC = int(os.getenv("LEMANA_JOB_TIMEOUT", "600"))
QUERY_TIMEOUT_SEC = int(os.getenv("LEMANA_QUERY_TIMEOUT", "90"))
RESULT_TTL_SEC = int(os.getenv("LEMANA_RESULT_TTL", "3600"))
GC_INTERVAL_SEC = 300


@dataclass
class Job:
    id: str
    queries: list[str]
    city: str
    limit_per_query: int
    status: str = "queued"           # queued|running|done|failed|cancelled
    done_count: int = 0
    current_query: Optional[str] = None
    results: list[dict] = field(default_factory=list)
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    cancel_requested: bool = False


class JobStore:
    """Async-friendly доступ к словарю job-ов + чистка по TTL."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()

    async def create(self, job: Job) -> None:
        async with self._lock:
            self._jobs[job.id] = job

    async def get(self, job_id: str) -> Optional[Job]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def update(self, job_id: str, **fields: Any) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for k, v in fields.items():
                setattr(job, k, v)

    async def request_cancel(self, job_id: str) -> bool:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job.status in ("done", "failed", "cancelled"):
                return False
            job.cancel_requested = True
            return True

    async def gc_expired(self) -> int:
        """Удалить done/failed/cancelled job-ы старше RESULT_TTL_SEC."""
        cutoff = datetime.utcnow() - timedelta(seconds=RESULT_TTL_SEC)
        async with self._lock:
            to_drop = [
                jid for jid, j in self._jobs.items()
                if j.status in ("done", "failed", "cancelled")
                and j.finished_at is not None
                and j.finished_at < cutoff
            ]
            for jid in to_drop:
                self._jobs.pop(jid, None)
            return len(to_drop)


class LemanaWorker:
    """Один воркер на процесс. Запускается из FastAPI lifespan()."""

    def __init__(self, store: JobStore) -> None:
        self.store = store
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=MAX_QUEUE)
        self.sem = asyncio.Semaphore(MAX_CONCURRENCY)
        self._session: Optional[LemanaSession] = None
        self._session_city: Optional[str] = None
        self._task: Optional[asyncio.Task] = None
        self._gc_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run_forever(), name="lemana-worker")
        self._gc_task = asyncio.create_task(self._gc_loop(), name="lemana-gc")
        logger.info("LemanaWorker started (concurrency=%d, queue=%d)",
                    MAX_CONCURRENCY, MAX_QUEUE)

    async def stop(self) -> None:
        for t in (self._task, self._gc_task):
            if t is not None:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
        await asyncio.to_thread(self._close_session_sync)
        logger.info("LemanaWorker stopped")

    # ------------------------------------------------------------------
    # submission
    # ------------------------------------------------------------------

    async def submit(self, job: Job) -> int:
        """Положить job в очередь. Возвращает позицию (0 = сразу обработка).
        Бросает asyncio.QueueFull → 503 в API."""
        position = self.queue.qsize()
        self.queue.put_nowait(job.id)
        return position

    def queue_depth(self) -> int:
        return self.queue.qsize()

    # ------------------------------------------------------------------
    # main loop
    # ------------------------------------------------------------------

    async def _run_forever(self) -> None:
        while True:
            job_id = await self.queue.get()
            async with self.sem:
                try:
                    await asyncio.wait_for(
                        self._process_job(job_id), timeout=JOB_TIMEOUT_SEC
                    )
                except asyncio.TimeoutError:
                    logger.warning("job %s timed out", job_id)
                    await self.store.update(
                        job_id, status="failed", error="job timeout",
                        finished_at=datetime.utcnow(),
                    )
                    await asyncio.to_thread(self._restart_session_sync)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.exception("job %s crashed", job_id)
                    await self.store.update(
                        job_id, status="failed", error=str(e)[:300],
                        finished_at=datetime.utcnow(),
                    )
                    await asyncio.to_thread(self._restart_session_sync)

    async def _gc_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(GC_INTERVAL_SEC)
                dropped = await self.store.gc_expired()
                if dropped:
                    logger.info("gc: dropped %d expired jobs", dropped)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("gc loop error")

    async def _process_job(self, job_id: str) -> None:
        job = await self.store.get(job_id)
        if job is None:
            return
        if job.cancel_requested:
            await self.store.update(
                job_id, status="cancelled", finished_at=datetime.utcnow(),
            )
            return
        await self.store.update(
            job_id, status="running", started_at=datetime.utcnow(),
        )

        try:
            await asyncio.to_thread(self._ensure_session_sync, job.city)
        except Exception as e:
            raise RuntimeError(f"session start failed: {e}") from e

        results: list[dict] = []
        for q in job.queries:
            current = await self.store.get(job_id)
            if current is None or current.cancel_requested:
                await self.store.update(
                    job_id, status="cancelled", results=results,
                    current_query=None, finished_at=datetime.utcnow(),
                )
                return
            await self.store.update(job_id, current_query=q)
            result = await self._run_query_with_retry(q, job.limit_per_query)
            results.append(result)
            await self.store.update(
                job_id, done_count=len(results), results=results,
            )

        await self.store.update(
            job_id, status="done", current_query=None,
            results=results, finished_at=datetime.utcnow(),
        )

    async def _run_query_with_retry(self, query: str, limit: int) -> dict:
        """Одна query: per-query таймаут + одна попытка restart при WebDriverException."""
        for attempt in (1, 2):
            try:
                products = await asyncio.wait_for(
                    asyncio.to_thread(self._do_search_sync, query, limit),
                    timeout=QUERY_TIMEOUT_SEC,
                )
                return {"query": query, "ok": True, "products": products}
            except asyncio.TimeoutError:
                logger.warning("query '%s' timed out (attempt %d)", query, attempt)
                await asyncio.to_thread(self._restart_session_sync)
                if attempt == 2:
                    return {"query": query, "ok": False, "error": "timeout",
                            "products": []}
            except WebDriverException as e:
                logger.warning("query '%s' WebDriverException (attempt %d): %s",
                               query, attempt, e)
                await asyncio.to_thread(self._restart_session_sync)
                if attempt == 2:
                    return {"query": query, "ok": False,
                            "error": f"webdriver: {e}"[:200], "products": []}
            except Exception as e:
                logger.exception("query '%s' failed", query)
                return {"query": query, "ok": False, "error": str(e)[:200],
                        "products": []}
        return {"query": query, "ok": False, "error": "unknown", "products": []}

    # ------------------------------------------------------------------
    # sync helpers (called via asyncio.to_thread)
    # ------------------------------------------------------------------

    def _ensure_session_sync(self, city: str) -> None:
        """Поднять сессию, если её нет, или пересоздать при смене города."""
        if self._session is not None and self._session_city == city:
            return
        self._close_session_sync()
        headless = os.getenv("LEMANA_HEADLESS", "1") != "0"
        sess = LemanaSession(city=city, headless=headless)
        sess.__enter__()
        self._session = sess
        self._session_city = city

    def _restart_session_sync(self) -> None:
        try:
            if self._session is not None:
                self._session.restart()
        except Exception as e:
            logger.warning("session restart failed, recreating: %s", e)
            self._close_session_sync()

    def _close_session_sync(self) -> None:
        if self._session is not None:
            try:
                self._session.close()
            except Exception:
                logger.exception("close session")
            self._session = None
            self._session_city = None

    def _do_search_sync(self, query: str, limit: int) -> list[ProductDict]:
        assert self._session is not None, "session not initialised"
        return self._session.search(query, limit=limit)

    # ------------------------------------------------------------------
    # inline path for /prices/search (best-effort, hard timeout)
    # ------------------------------------------------------------------

    async def search_inline(self, query: str, city: str, limit: int,
                            timeout: float = 25.0) -> list[ProductDict]:
        """Synchronous-style search for /prices/search.
        Shares self.sem with queue jobs to avoid concurrent uc access.
        On timeout or dead session (InvalidSessionId/NoSuchWindow/etc.)
        — restarts so the next /prices/search call recovers."""
        async with self.sem:
            try:
                await asyncio.to_thread(self._ensure_session_sync, city)
                return await asyncio.wait_for(
                    asyncio.to_thread(self._do_search_sync, query, limit),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                await asyncio.to_thread(self._restart_session_sync)
                raise
            except WebDriverException:
                await asyncio.to_thread(self._restart_session_sync)
                raise
