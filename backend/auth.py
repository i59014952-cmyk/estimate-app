"""Operator authentication — replaces Supabase Auth (GoTrue).

Email+password against the kh_users table (bcrypt hashes). Issues stateless
JWTs: a short-lived access token and a longer refresh token. The frontend
(lib/auth.js) stores them in localStorage and sends the access token as
`Authorization: Bearer <jwt>` on data calls.
"""
import os
import time
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel

# NOTE: `db` is imported lazily inside the handlers below. db.py imports this
# module at load time for require_user, so a top-level `import db` here would
# create a circular import.

ALGO = "HS256"
ACCESS_TTL_S = 3600          # 1 hour
REFRESH_TTL_S = 30 * 86400   # 30 days

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _secret() -> str:
    s = os.environ.get("KH_JWT_SECRET")
    if not s:
        raise HTTPException(503, "Auth not configured (set KH_JWT_SECRET)")
    return s


def _issue(email: str) -> dict:
    now = int(time.time())
    access = jwt.encode(
        {"sub": email, "type": "access", "iat": now, "exp": now + ACCESS_TTL_S},
        _secret(), algorithm=ALGO,
    )
    refresh = jwt.encode(
        {"sub": email, "type": "refresh", "iat": now, "exp": now + REFRESH_TTL_S},
        _secret(), algorithm=ALGO,
    )
    return {"access_token": access, "refresh_token": refresh, "expires_at": now + ACCESS_TTL_S}


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")


async def require_user(authorization: Optional[str] = Header(default=None)) -> str:
    """FastAPI dependency: returns the operator email or raises 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    payload = _decode(authorization.split(" ", 1)[1].strip())
    if payload.get("type") != "access":
        raise HTTPException(401, "Wrong token type")
    return payload["sub"]


def _admin_emails() -> set:
    """Admins are listed in the KH_ADMIN_EMAILS env var (comma-separated)."""
    raw = os.environ.get("KH_ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _is_admin(email: str) -> bool:
    return email.strip().lower() in _admin_emails()


async def require_admin(email: str = Depends(require_user)) -> str:
    """FastAPI dependency: like require_user but also enforces admin rights."""
    if not _is_admin(email):
        raise HTTPException(403, "Требуются права администратора")
    return email


router = APIRouter()


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


@router.post("/auth/login")
async def login(body: LoginIn):
    import db
    email = body.email.strip().lower()
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "select password_hash from kh_users where email = $1", email
        )
    if row is None or not pwd.verify(body.password, row["password_hash"]):
        raise HTTPException(401, "Неверный email или пароль")
    return _issue(email)


@router.post("/auth/refresh")
async def refresh(body: RefreshIn):
    payload = _decode(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Wrong token type")
    return _issue(payload["sub"])


@router.post("/auth/logout")
async def logout():
    # Stateless JWTs: the client discards them. Endpoint exists for symmetry.
    return {"ok": True}


# --- account info & admin user management ------------------------------------
class CreateUserIn(BaseModel):
    email: str
    password: str


class SetPasswordIn(BaseModel):
    password: str


def _valid_password(password: str) -> None:
    if len(password or "") < 6:
        raise HTTPException(400, "Пароль должен быть не короче 6 символов")


@router.get("/auth/me")
async def me(email: str = Depends(require_user)):
    return {"email": email, "is_admin": _is_admin(email)}


@router.get("/auth/users")
async def list_users(_admin: str = Depends(require_admin)):
    import db
    admins = _admin_emails()
    async with db.pool().acquire() as conn:
        rows = await conn.fetch(
            "select email, created_at from kh_users order by created_at"
        )
    return [
        {
            "email": r["email"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "is_admin": r["email"].strip().lower() in admins,
        }
        for r in rows
    ]


@router.post("/auth/users")
async def create_user(body: CreateUserIn, _admin: str = Depends(require_admin)):
    import db
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Введите корректный email")
    _valid_password(body.password)
    async with db.pool().acquire() as conn:
        exists = await conn.fetchrow("select 1 from kh_users where email = $1", email)
        if exists is not None:
            raise HTTPException(409, "Пользователь с таким email уже существует")
        await conn.execute(
            "insert into kh_users (email, password_hash) values ($1, $2)",
            email, pwd.hash(body.password),
        )
    return {"email": email, "is_admin": email in _admin_emails()}


@router.post("/auth/users/{email}/password")
async def set_password(email: str, body: SetPasswordIn, _admin: str = Depends(require_admin)):
    import db
    target = email.strip().lower()
    _valid_password(body.password)
    async with db.pool().acquire() as conn:
        result = await conn.execute(
            "update kh_users set password_hash = $2 where email = $1",
            target, pwd.hash(body.password),
        )
    if result.endswith(" 0"):
        raise HTTPException(404, "Пользователь не найден")
    return {"ok": True}


@router.delete("/auth/users/{email}")
async def delete_user(email: str, admin: str = Depends(require_admin)):
    import db
    target = email.strip().lower()
    if target == admin.strip().lower():
        raise HTTPException(400, "Нельзя удалить собственную учётную запись")
    async with db.pool().acquire() as conn:
        result = await conn.execute("delete from kh_users where email = $1", target)
    if result.endswith(" 0"):
        raise HTTPException(404, "Пользователь не найден")
    return {"ok": True}
