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

import db

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


router = APIRouter()


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


@router.post("/auth/login")
async def login(body: LoginIn):
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
