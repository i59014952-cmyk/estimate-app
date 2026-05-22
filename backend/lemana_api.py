"""FastAPI-роутер для Lemana Pro job-ов.

Подключается в main.py:
    from lemana_api import router as lemana_router
    app.include_router(lemana_router)

Зависит от LemanaWorker в app.state.lemana_worker, проинициализированного в lifespan().
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from lemana_worker import Job, RESULT_TTL_SEC

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lemana", tags=["lemana"])

JobStatusLiteral = Literal["queued", "running", "done", "failed", "cancelled"]


class LemanaProduct(BaseModel):
    name: str
    price: Optional[float] = None
    currency: str = "RUB"
    sku: Optional[str] = None
    url: str
    image: Optional[str] = None
    availability: Optional[str] = None
    description: Optional[str] = None
    breadcrumbs: list[str] = Field(default_factory=list)
    characteristics: dict[str, str] = Field(default_factory=dict)
    source: Literal["lemanapro"] = "lemanapro"


class LemanaQueryResult(BaseModel):
    query: str
    ok: bool
    error: Optional[str] = None
    products: list[LemanaProduct] = Field(default_factory=list)


class LemanaJobCreate(BaseModel):
    queries: list[str] = Field(..., min_length=1, max_length=50)
    city: str = "kazan"
    limit_per_query: int = Field(5, ge=1, le=20)


class LemanaJobCreated(BaseModel):
    job_id: str
    status: Literal["queued"]
    position_in_queue: int


class LemanaJobStatus(BaseModel):
    job_id: str
    status: JobStatusLiteral
    done_count: int
    total: int
    current_query: Optional[str] = None
    eta_seconds: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None


class LemanaJobResult(BaseModel):
    job_id: str
    status: Literal["done", "cancelled", "failed"]
    results: list[LemanaQueryResult]
    error: Optional[str] = None


# ----------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------

def _is_expired(job: Job) -> bool:
    if job.finished_at is None:
        return False
    if job.status not in ("done", "failed", "cancelled"):
        return False
    return job.finished_at + timedelta(seconds=RESULT_TTL_SEC) < datetime.utcnow()


def _estimate_eta(job: Job) -> Optional[int]:
    if job.status != "running" or job.started_at is None or job.done_count <= 0:
        return None
    elapsed = (datetime.utcnow() - job.started_at).total_seconds()
    avg = elapsed / job.done_count
    remaining = max(0, len(job.queries) - job.done_count)
    return int(avg * remaining)


def _job_to_status(job: Job) -> LemanaJobStatus:
    return LemanaJobStatus(
        job_id=job.id,
        status=job.status,  # type: ignore[arg-type]
        done_count=job.done_count,
        total=len(job.queries),
        current_query=job.current_query,
        eta_seconds=_estimate_eta(job),
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        error=job.error,
    )


# ----------------------------------------------------------------------
# endpoints
# ----------------------------------------------------------------------

@router.post("/jobs", response_model=LemanaJobCreated,
             status_code=status.HTTP_202_ACCEPTED)
async def create_job(req: LemanaJobCreate, request: Request) -> LemanaJobCreated:
    worker = request.app.state.lemana_worker
    queries = [q.strip() for q in req.queries if q and q.strip()]
    if not queries:
        raise HTTPException(400, "queries must contain non-empty strings")

    job = Job(
        id=str(uuid.uuid4()),
        queries=queries,
        city=req.city.lower(),
        limit_per_query=req.limit_per_query,
    )
    await worker.store.create(job)
    try:
        position = await worker.submit(job)
    except asyncio.QueueFull:
        # job уже в store; пометим failed чтобы он не висел "queued"
        await worker.store.update(
            job.id, status="failed",
            error="queue is full",
            finished_at=datetime.utcnow(),
        )
        raise HTTPException(503, "lemana queue is full, try later")
    return LemanaJobCreated(
        job_id=job.id, status="queued", position_in_queue=position,
    )


@router.get("/jobs/{job_id}", response_model=LemanaJobStatus)
async def get_status(job_id: str, request: Request) -> LemanaJobStatus:
    worker = request.app.state.lemana_worker
    job = await worker.store.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    if _is_expired(job):
        raise HTTPException(410, "job result expired")
    return _job_to_status(job)


@router.get("/jobs/{job_id}/result", response_model=LemanaJobResult)
async def get_result(job_id: str, request: Request) -> LemanaJobResult:
    worker = request.app.state.lemana_worker
    job = await worker.store.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    if _is_expired(job):
        raise HTTPException(410, "job result expired")
    if job.status not in ("done", "cancelled", "failed"):
        raise HTTPException(409, f"job not finished (status={job.status})")
    return LemanaJobResult(
        job_id=job.id,
        status=job.status,  # type: ignore[arg-type]
        results=[LemanaQueryResult(**r) for r in job.results],
        error=job.error,
    )


@router.delete("/jobs/{job_id}", status_code=204)
async def cancel_job(job_id: str, request: Request):
    """Best-effort отмена. Воркер проверяет флаг между queries."""
    worker = request.app.state.lemana_worker
    job = await worker.store.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    if job.status in ("done", "failed", "cancelled"):
        raise HTTPException(409, f"job already {job.status}")
    await worker.store.request_cancel(job_id)
