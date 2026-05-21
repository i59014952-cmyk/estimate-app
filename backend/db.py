"""PostgreSQL data layer — replaces Supabase PostgREST.

Exposes a tiny, whitelisted subset of the PostgREST query language used by the
frontend (lib/supabase.js): filters eq/neq/in, `select`, `order`, and upsert via
`on_conflict`. Every table and column is validated against the maps below before
it reaches SQL, and all values are passed as bound parameters, so the dynamic
query building cannot be used for injection.

Two route groups:
  * /db/{table}      — operator CRUD, requires a valid JWT (see auth.require_user)
  * /public/...      — vendor (by slug) and client (by token) pages, no login
"""
import json
import os
from decimal import Decimal
from datetime import date, datetime, time
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

import auth

# --- column maps (single source of truth for validation + casts) -------------
# kind -> SQL cast used when binding values.
CASTS = {
    "text": "text",
    "numeric": "numeric",
    "bigint": "bigint",
    "boolean": "boolean",
    "timestamptz": "timestamptz",
    "jsonb": "jsonb",
}

TABLES: dict[str, dict[str, str]] = {
    "kh_objects": {
        "id": "text", "name": "text", "address": "text", "area": "numeric",
        "stage": "text", "date": "text", "budget": "numeric", "client": "text",
        "note": "text", "status": "text", "files": "jsonb", "updated_at": "timestamptz",
    },
    "kh_user_catalog": {
        "name": "text", "unit": "text", "unit_price": "numeric", "updated_at": "timestamptz",
    },
    "kh_events": {
        "id": "bigint", "date": "text", "time": "text", "title": "text",
    },
    "kh_hidden": {
        "key": "text",
    },
    "kh_contractors": {
        "id": "text", "name": "text", "email": "text", "phone": "text", "type": "text",
        "org": "text", "website": "text", "slug": "text", "file_name": "text",
        "file_size": "bigint", "file_time": "text", "updated_at": "timestamptz",
    },
    "kh_vendor_prices": {
        "id": "bigint", "vendor_slug": "text", "vendor_name": "text", "name": "text",
        "unit": "text", "qty": "numeric", "unit_price": "numeric", "source_file": "text",
        "created_at": "timestamptz", "updated_at": "timestamptz",
    },
    "kh_client_estimates": {
        "token": "text", "rows": "jsonb", "created_at": "timestamptz", "updated_at": "timestamptz",
    },
    "kh_stores": {
        "id": "text", "url": "text", "name": "text", "host": "text", "favicon": "text",
        "method": "text", "currency": "text", "found": "boolean", "confidence": "numeric",
        "note": "text", "samples": "jsonb", "active": "boolean", "search_url": "text",
        "added_at": "timestamptz", "last_check": "timestamptz",
    },
}

RESERVED_QS = {"select", "order", "on_conflict"}

_pool: Optional[asyncpg.Pool] = None


# --- lifecycle ---------------------------------------------------------------
async def _init_conn(conn: asyncpg.Connection) -> None:
    # Return/accept jsonb columns as native Python objects, not strings.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def connect() -> None:
    """Open the pool if DATABASE_URL is set. No-op otherwise (price-only deploys)."""
    global _pool
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return
    _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10, init=_init_conn)


async def close() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise HTTPException(503, "Database not configured (set DATABASE_URL)")
    return _pool


# --- value coercion / serialization -----------------------------------------
def _coerce(kind: str, value: Any) -> Any:
    if value is None:
        return None
    if kind != "text" and kind != "jsonb" and value == "":
        return None
    if kind == "jsonb":
        return value  # codec encodes Python obj -> jsonb
    if kind == "bigint":
        return int(value)
    if kind == "boolean":
        if isinstance(value, str):
            return value.strip().lower() in ("true", "t", "1", "yes")
        return bool(value)
    # numeric / timestamptz / text bind as text and let Postgres cast.
    return str(value)


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _rows(records) -> list[dict]:
    return [_jsonable(dict(r)) for r in records]


def _check_table(table: str) -> dict[str, str]:
    cols = TABLES.get(table)
    if cols is None:
        raise HTTPException(404, f"Unknown table {table!r}")
    return cols


def _check_col(cols: dict[str, str], name: str) -> str:
    kind = cols.get(name)
    if kind is None:
        raise HTTPException(400, f"Unknown column {name!r}")
    return kind


class _Binder:
    """Accumulates bound parameters and emits $n::cast placeholders."""

    def __init__(self) -> None:
        self.params: list[Any] = []

    def bind(self, kind: str, value: Any) -> str:
        self.params.append(_coerce(kind, value))
        return f"${len(self.params)}::{CASTS[kind]}"

    def bind_array(self, kind: str, values: list) -> str:
        self.params.append([_coerce(kind, v) for v in values])
        return f"${len(self.params)}::{CASTS[kind]}[]"


def _build_where(cols: dict[str, str], query, binder: _Binder) -> str:
    clauses: list[str] = []
    for key, raw in query.multi_items():
        if key in RESERVED_QS:
            continue
        kind = _check_col(cols, key)
        op, _, rest = raw.partition(".")
        if op == "eq":
            clauses.append(f'"{key}" = {binder.bind(kind, rest)}')
        elif op == "neq":
            clauses.append(f'"{key}" <> {binder.bind(kind, rest)}')
        elif op == "in":
            inner = rest[1:-1] if rest.startswith("(") and rest.endswith(")") else rest
            values = [v for v in inner.split(",") if v != ""] if inner else []
            if not values:
                clauses.append("false")
            else:
                clauses.append(f'"{key}" = ANY({binder.bind_array(kind, values)})')
        else:
            raise HTTPException(400, f"Unsupported filter operator {op!r}")
    return (" where " + " and ".join(clauses)) if clauses else ""


def _build_select_list(cols: dict[str, str], query) -> str:
    sel = query.get("select")
    if not sel or sel == "*":
        return "*"
    names = [s.strip() for s in sel.split(",") if s.strip()]
    for n in names:
        _check_col(cols, n)
    return ", ".join(f'"{n}"' for n in names)


def _build_order(cols: dict[str, str], query) -> str:
    order = query.get("order")
    if not order:
        return ""
    parts = []
    for token in order.split(","):
        token = token.strip()
        if not token:
            continue
        col, _, direction = token.partition(".")
        _check_col(cols, col)
        direction = (direction or "asc").lower()
        if direction not in ("asc", "desc"):
            raise HTTPException(400, f"Bad order direction {direction!r}")
        parts.append(f'"{col}" {direction}')
    return (" order by " + ", ".join(parts)) if parts else ""


# --- operator data API (JWT required) ----------------------------------------
router = APIRouter()


@router.get("/db/{table}")
async def db_select(table: str, request: Request, _user: str = Depends(auth.require_user)):
    cols = _check_table(table)
    binder = _Binder()
    sel = _build_select_list(cols, request.query_params)
    where = _build_where(cols, request.query_params, binder)
    order = _build_order(cols, request.query_params)
    sql = f'select {sel} from "{table}"{where}{order}'
    async with pool().acquire() as conn:
        return _rows(await conn.fetch(sql, *binder.params))


@router.post("/db/{table}")
async def db_upsert(table: str, request: Request, _user: str = Depends(auth.require_user)):
    cols = _check_table(table)
    body = await request.json()
    rows = body if isinstance(body, list) else [body]
    conflict_raw = request.query_params.get("on_conflict")
    conflict = [c.strip() for c in conflict_raw.split(",")] if conflict_raw else []
    for c in conflict:
        _check_col(cols, c)

    # Lock rows in a deterministic order across concurrent requests. Two imports
    # touching the same keys in different orders is the classic cause of
    # "deadlock detected" (40P01); sorting by the conflict key makes every
    # transaction take row locks in the same sequence.
    if conflict and len(rows) > 1:
        def _key(r):
            return tuple(str(r.get(c, "")) for c in conflict)
        rows = sorted(rows, key=_key)

    out: list[dict] = []
    async with pool().acquire() as conn:
        async with conn.transaction():
            for row in rows:
                names = [k for k in row.keys()]
                for n in names:
                    _check_col(cols, n)
                binder = _Binder()
                placeholders = [binder.bind(cols[n], row[n]) for n in names]
                col_sql = ", ".join(f'"{n}"' for n in names)
                val_sql = ", ".join(placeholders)
                sql = f'insert into "{table}" ({col_sql}) values ({val_sql})'
                if conflict:
                    updates = [n for n in names if n not in conflict]
                    if updates:
                        set_sql = ", ".join(f'"{n}" = excluded."{n}"' for n in updates)
                        sql += f' on conflict ({", ".join(chr(34)+c+chr(34) for c in conflict)}) do update set {set_sql}'
                    else:
                        sql += f' on conflict ({", ".join(chr(34)+c+chr(34) for c in conflict)}) do nothing'
                sql += " returning *"
                rec = await conn.fetchrow(sql, *binder.params)
                if rec is not None:
                    out.append(_jsonable(dict(rec)))
    return out


@router.patch("/db/{table}")
async def db_patch(table: str, request: Request, _user: str = Depends(auth.require_user)):
    cols = _check_table(table)
    body = await request.json()
    if not isinstance(body, dict) or not body:
        raise HTTPException(400, "PATCH body must be a non-empty object")
    binder = _Binder()
    set_parts = []
    for k, v in body.items():
        kind = _check_col(cols, k)
        set_parts.append(f'"{k}" = {binder.bind(kind, v)}')
    where = _build_where(cols, request.query_params, binder)
    sql = f'update "{table}" set {", ".join(set_parts)}{where} returning *'
    async with pool().acquire() as conn:
        return _rows(await conn.fetch(sql, *binder.params))


@router.delete("/db/{table}")
async def db_delete(table: str, request: Request, _user: str = Depends(auth.require_user)):
    cols = _check_table(table)
    binder = _Binder()
    where = _build_where(cols, request.query_params, binder)
    sql = f'delete from "{table}"{where} returning *'
    async with pool().acquire() as conn:
        return _rows(await conn.fetch(sql, *binder.params))


# --- public client estimate (by secret token) --------------------------------
@router.post("/public/client/get")
async def client_get(request: Request):
    body = await request.json()
    token = (body or {}).get("token") or ""
    async with pool().acquire() as conn:
        rec = await conn.fetchrow(
            "select rows from kh_client_estimates where token = $1", token
        )
    if rec is None:
        return None  # link not found
    return _jsonable(rec["rows"] if rec["rows"] is not None else [])


@router.post("/public/client/save")
async def client_save(request: Request):
    body = await request.json()
    token = (body or {}).get("token") or ""
    rows = (body or {}).get("rows")
    async with pool().acquire() as conn:
        await conn.execute(
            "update kh_client_estimates set rows = $2, updated_at = now() where token = $1",
            token, rows,
        )
    return {"ok": True}


# --- public vendor page (by secret slug) -------------------------------------
@router.post("/public/vendor/get")
async def vendor_get(request: Request):
    body = await request.json()
    slug = (body or {}).get("slug") or ""
    async with pool().acquire() as conn:
        rec = await conn.fetchrow(
            "select name, email, org from kh_contractors where slug = $1 limit 1", slug
        )
    return _jsonable(dict(rec)) if rec is not None else None


@router.get("/public/vendor/prices")
async def vendor_prices_list(slug: str, request: Request):
    async with pool().acquire() as conn:
        recs = await conn.fetch(
            "select * from kh_vendor_prices where vendor_slug = $1 order by updated_at desc",
            slug,
        )
    return _rows(recs)


@router.post("/public/vendor/prices")
async def vendor_prices_upsert(request: Request):
    body = await request.json()
    slug = (body or {}).get("slug") or ""
    items = (body or {}).get("items") or []
    if not slug:
        raise HTTPException(400, "slug required")
    saved = 0
    async with pool().acquire() as conn:
        async with conn.transaction():
            for it in items:
                await conn.execute(
                    """
                    insert into kh_vendor_prices
                        (vendor_slug, vendor_name, name, unit, qty, unit_price, source_file, updated_at)
                    values ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, now())
                    on conflict (vendor_slug, name, unit) do update set
                        vendor_name = excluded.vendor_name,
                        qty         = excluded.qty,
                        unit_price  = excluded.unit_price,
                        source_file = excluded.source_file,
                        updated_at  = now()
                    """,
                    slug,
                    it.get("vendor_name"),
                    it.get("name") or "",
                    it.get("unit") or "",
                    None if it.get("qty") in (None, "") else str(it.get("qty")),
                    None if it.get("unit_price") in (None, "") else str(it.get("unit_price")),
                    it.get("source_file"),
                )
                saved += 1
    return {"saved": saved}


@router.patch("/public/vendor/prices/{price_id}")
async def vendor_prices_update(price_id: int, request: Request):
    body = await request.json()
    slug = (body or {}).get("slug") or ""
    allowed = {"name": "text", "unit": "text", "qty": "numeric", "unit_price": "numeric"}
    binder = _Binder()
    set_parts = []
    for k, v in (body or {}).items():
        if k == "slug":
            continue
        kind = allowed.get(k)
        if kind is None:
            continue
        set_parts.append(f'"{k}" = {binder.bind(kind, v)}')
    set_parts.append("updated_at = now()")
    id_ph = binder.bind("bigint", price_id)
    slug_ph = binder.bind("text", slug)
    sql = (
        f"update kh_vendor_prices set {', '.join(set_parts)} "
        f"where id = {id_ph} and vendor_slug = {slug_ph} returning *"
    )
    async with pool().acquire() as conn:
        return _rows(await conn.fetch(sql, *binder.params))


@router.post("/public/vendor/prices/delete")
async def vendor_prices_delete(request: Request):
    body = await request.json()
    slug = (body or {}).get("slug") or ""
    ids = [int(i) for i in ((body or {}).get("ids") or [])]
    if not ids:
        return {"deleted": 0}
    async with pool().acquire() as conn:
        result = await conn.execute(
            "delete from kh_vendor_prices where vendor_slug = $1 and id = ANY($2::bigint[])",
            slug, ids,
        )
    # result like "DELETE n"
    return {"deleted": int(result.split()[-1]) if result else 0}
