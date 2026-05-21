"""Create or update an operator login.

Usage:
    DATABASE_URL=postgres://... python create_user.py <email> <password>
"""
import asyncio
import os
import sys

import asyncpg
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def main(email: str, password: str) -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("Set DATABASE_URL")
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(
            """
            insert into kh_users (email, password_hash) values ($1, $2)
            on conflict (email) do update set password_hash = excluded.password_hash
            """,
            email.strip().lower(), pwd.hash(password),
        )
    finally:
        await conn.close()
    print(f"User {email} created/updated.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: python create_user.py <email> <password>")
    asyncio.run(main(sys.argv[1], sys.argv[2]))
