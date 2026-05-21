"""asyncpg connection pool для aisales API."""
from __future__ import annotations
import asyncpg
import os
import logging

log = logging.getLogger("aisales.db")
_pool: "asyncpg.Pool | None" = None


def _connect_kwargs() -> dict:
    """Parse POSTGRES_URL handling passwords that contain '/' or '@'."""
    url = os.getenv("POSTGRES_URL", "postgresql://aisales:CHANGEME@aisales-postgres:5432/aisales")
    url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql://", "", 1)
    # Split on LAST '@' to handle passwords with '@'
    at = url.rindex("@")
    creds, hostpart = url[:at], url[at+1:]
    # Credentials: user:password (password may contain ':')
    colon = creds.index(":")
    user, password = creds[:colon], creds[colon+1:]
    # Host part: host:port/dbname
    slash = hostpart.rindex("/")
    database = hostpart[slash+1:]
    hostport = hostpart[:slash]
    if ":" in hostport:
        host, port_s = hostport.rsplit(":", 1)
        port = int(port_s)
    else:
        host, port = hostport, 5432
    return dict(host=host, port=port, user=user, password=password, database=database)


async def get_pool() -> "asyncpg.Pool":
    global _pool
    if _pool is None:
        kw = _connect_kwargs()
        _pool = await asyncpg.create_pool(**kw, min_size=2, max_size=10)
        log.info("asyncpg pool ready → %s:%s/%s", kw['host'], kw['port'], kw['database'])
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        log.info("asyncpg pool closed")
