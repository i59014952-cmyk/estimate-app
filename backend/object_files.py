"""Хранилище файлов, прикреплённых к объектам (IFC-модели и т.п.).

Файлы лежат на диске бэкенда в OBJECT_FILES_DIR; метаданные — в Postgres
(таблица kh_object_files). На клиенте файлы только просматриваются (стримим
без Content-Disposition: attachment, чтобы не было «случайного» скачивания),
поэтому ссылка типа /object_files/{id} требует залогиненного оператора.

Эндпоинты:
  POST   /objects/{object_id}/files     — загрузить файл (multipart), writer
  GET    /objects/{object_id}/files     — список файлов объекта,           user
  GET    /object_files/{file_id}        — стрим контента (для вьюера),     user
  DELETE /object_files/{file_id}        — удалить файл,                    writer
"""
from __future__ import annotations

import os
import re
import uuid
import logging
from pathlib import Path

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse

import auth
from db import pool

logger = logging.getLogger(__name__)

router = APIRouter(tags=["object_files"])

# Каталог хранения. По умолчанию /app/data/object_files (см. docker-compose volume),
# для локальной разработки можно перекрыть через env OBJECT_FILES_DIR.
OBJECT_FILES_DIR = Path(os.getenv("OBJECT_FILES_DIR", "/app/data/object_files"))

# Каталог демо-файлов (IFC-модели как часть «каталога» — пользователь их только
# смотрит, не загружает). Файлы кладёт админ напрямую на VPS, имя задаёт slug.
DEMO_DIR = Path(os.getenv("OBJECT_FILES_DEMO_DIR", "/app/data/demo"))
_DEMO_SAFE_SLUG = re.compile(r"^[a-z0-9_-]+$")

# Защита от мусорных гигабайтных аплоадов. Можно поднять через env.
MAX_FILE_BYTES = int(os.getenv("OBJECT_FILE_MAX_BYTES", str(100 * 1024 * 1024)))   # 100 МБ
MAX_FILES_PER_OBJECT = int(os.getenv("OBJECT_FILE_MAX_PER_OBJECT", "10"))
CHUNK_BYTES = 1 << 20   # 1 МБ


def _file_path(file_id: str) -> Path:
    return OBJECT_FILES_DIR / f"{file_id}.bin"


async def ensure_schema() -> None:
    """Создать таблицу при старте, если её нет (на случай старой БД без
    схемы из db/schema.sql — таблица добавилась позже)."""
    OBJECT_FILES_DIR.mkdir(parents=True, exist_ok=True)
    async with pool().acquire() as conn:
        await conn.execute("""
            create table if not exists kh_object_files (
              id            text primary key,
              object_id     text not null references kh_objects(id) on delete cascade,
              filename      text not null,
              size_bytes    bigint not null,
              content_type  text,
              uploaded_at   timestamptz not null default now(),
              uploaded_by   text
            );
            create index if not exists kh_object_files_obj on kh_object_files (object_id);
        """)


@router.post("/objects/{object_id}/files")
async def upload_file(
    object_id: str,
    upload: UploadFile = File(...),
    email: str = Depends(auth.require_writer),
):
    # лимит количества файлов на объект — защита от случайной массовой загрузки
    async with pool().acquire() as conn:
        cnt = await conn.fetchval(
            "select count(*) from kh_object_files where object_id = $1", object_id,
        )
        if cnt is not None and int(cnt) >= MAX_FILES_PER_OBJECT:
            raise HTTPException(409, f"К объекту уже прикреплено {cnt} файлов (лимит {MAX_FILES_PER_OBJECT})")

    file_id = uuid.uuid4().hex
    path = _file_path(file_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    # Стримим на диск чанками — UploadFile уже сам стримит в SpooledTemporaryFile,
    # перекачиваем оттуда без полного захвата в RAM.
    try:
        with open(path, "wb") as out:
            while True:
                chunk = await upload.read(CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_FILE_BYTES:
                    out.close()
                    path.unlink(missing_ok=True)
                    raise HTTPException(413, f"Файл превышает лимит {MAX_FILE_BYTES // (1024 * 1024)} МБ")
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        path.unlink(missing_ok=True)
        logger.exception("upload write failed")
        raise HTTPException(500, f"Не удалось сохранить файл: {e}")

    try:
        async with pool().acquire() as conn:
            row = await conn.fetchrow(
                """
                insert into kh_object_files (id, object_id, filename, size_bytes, content_type, uploaded_by)
                values ($1, $2, $3, $4, $5, $6)
                returning id, object_id, filename, size_bytes, content_type, uploaded_at, uploaded_by
                """,
                file_id, object_id, upload.filename or file_id, total,
                upload.content_type or "application/octet-stream", email,
            )
    except asyncpg.ForeignKeyViolationError:
        path.unlink(missing_ok=True)
        raise HTTPException(404, f"Объект {object_id!r} не найден")
    except Exception as e:
        path.unlink(missing_ok=True)
        logger.exception("upload db insert failed")
        raise HTTPException(500, f"Не удалось записать метаданные: {e}")

    return dict(row) | {"uploaded_at": row["uploaded_at"].isoformat()}


@router.get("/objects/{object_id}/files")
async def list_files(object_id: str, _email: str = Depends(auth.require_user)):
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """
            select id, object_id, filename, size_bytes, content_type, uploaded_at, uploaded_by
            from kh_object_files
            where object_id = $1
            order by uploaded_at desc
            """,
            object_id,
        )
    return [dict(r) | {"uploaded_at": r["uploaded_at"].isoformat()} for r in rows]


@router.get("/object_files/{file_id}")
async def stream_file(file_id: str, _email: str = Depends(auth.require_user)):
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "select filename, size_bytes, content_type from kh_object_files where id = $1",
            file_id,
        )
    if row is None:
        raise HTTPException(404, "Файл не найден")
    path = _file_path(file_id)
    if not path.exists():
        # метаданные есть, файла нет — рассинхрон, аккуратно сообщаем
        raise HTTPException(410, "Файл удалён с диска")

    def _iter():
        with open(path, "rb") as f:
            while True:
                chunk = f.read(CHUNK_BYTES)
                if not chunk:
                    break
                yield chunk

    # ВАЖНО: НЕ ставим Content-Disposition: attachment — нам нужен inline-стрим
    # для вьюера, а не «Сохранить как». Браузер не будет показывать «Скачать».
    headers = {
        "Content-Length": str(row["size_bytes"]),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }
    return StreamingResponse(
        _iter(),
        media_type=row["content_type"] or "application/octet-stream",
        headers=headers,
    )


@router.delete("/object_files/{file_id}", status_code=204)
async def delete_file(file_id: str, _email: str = Depends(auth.require_writer)):
    async with pool().acquire() as conn:
        existed = await conn.fetchval(
            "delete from kh_object_files where id = $1 returning 1", file_id,
        )
    if not existed:
        raise HTTPException(404, "Файл не найден")
    _file_path(file_id).unlink(missing_ok=True)
    return None


@router.get("/demo/ifc/{slug}")
async def stream_demo_ifc(slug: str, _email: str = Depends(auth.require_user)):
    """Демо-IFC файлы (часть каталога). Админ кладёт их в DEMO_DIR/{slug}.ifc,
    пользователи только смотрят (стрим без Content-Disposition). Slug проверяем
    жёстко, чтобы не было path-traversal."""
    if not _DEMO_SAFE_SLUG.match(slug):
        raise HTTPException(400, "invalid slug")
    path = DEMO_DIR / f"{slug}.ifc"
    if not path.exists():
        raise HTTPException(404, "demo file not found — положи файл в /app/data/demo/")
    size = path.stat().st_size

    def _iter():
        with open(path, "rb") as f:
            while True:
                chunk = f.read(CHUNK_BYTES)
                if not chunk:
                    break
                yield chunk

    headers = {
        "Content-Length": str(size),
        "X-Content-Type-Options": "nosniff",
        # демо общий → можно кэшировать в браузере; auth-only по private
        "Cache-Control": "private, max-age=600",
    }
    return StreamingResponse(_iter(), media_type="application/octet-stream", headers=headers)


@router.get("/demo/ifc/{slug}/info")
async def demo_ifc_info(slug: str, _email: str = Depends(auth.require_user)):
    """Метаданные о демо-файле (для UI: чтобы знать, есть он или нет, размер)."""
    if not _DEMO_SAFE_SLUG.match(slug):
        raise HTTPException(400, "invalid slug")
    path = DEMO_DIR / f"{slug}.ifc"
    if not path.exists():
        return {"slug": slug, "exists": False, "filename": None, "size_bytes": 0}
    st = path.stat()
    return {"slug": slug, "exists": True, "filename": f"{slug}.ifc", "size_bytes": st.st_size}
