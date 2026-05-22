"""Домашний агент-парсер Lemana Pro (pull-модель).

Запускается на домашнем РФ-ПК с реальным резидентным IP — там, где Lemana
открывается без блокировки Qrator. Сервер (api.sme-ta.ru) сам ходить на Lemana
не может (его дата-центровый IP получает 403 QRATOR), поэтому он только держит
очередь задач, а парсинг выполняет этот агент:

    1. длинный poll  -> POST {SERVER_URL}/lemana/agent/poll
    2. парсинг локально через lemana_session.LemanaSession (реальный браузер)
    3. отдать результат -> POST {SERVER_URL}/lemana/agent/jobs/{job_id}/result

Запуск:
    pip install -r agent-requirements.txt
    export SERVER_URL="https://api.sme-ta.ru"
    export LEMANA_AGENT_TOKEN="<тот же секрет, что на сервере>"
    python lemana_agent.py

Важно: на этой машине VPN должен идти мимо lemanapro.ru (split tunneling),
иначе Qrator снова даст 403. Проверка: curl https://kazan.lemanapro.ru/ -> 200.
"""
from __future__ import annotations

import logging
import os
import sys
import time
from typing import Optional

import requests
from selenium.common.exceptions import WebDriverException

from lemana_session import LemanaSession, ProductDict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("lemana-agent")

SERVER_URL = os.environ.get("SERVER_URL", "").rstrip("/")
AGENT_TOKEN = os.environ.get("LEMANA_AGENT_TOKEN", "")
POLL_WAIT = int(os.environ.get("LEMANA_AGENT_POLL_WAIT", "25"))
HEADLESS = os.environ.get("LEMANA_HEADLESS", "1") != "0"
HTTP_TIMEOUT = int(os.environ.get("LEMANA_AGENT_HTTP_TIMEOUT", "120"))
QUERY_ATTEMPTS = 2


class AgentSession:
    """Держит одну Chrome-сессию, пересоздавая её при смене города/краше."""

    def __init__(self) -> None:
        self._session: Optional[LemanaSession] = None
        self._city: Optional[str] = None

    def ensure(self, city: str) -> LemanaSession:
        if self._session is not None and self._city == city:
            return self._session
        self.close()
        sess = LemanaSession(city=city, headless=HEADLESS)
        sess.__enter__()
        self._session = sess
        self._city = city
        return sess

    def restart(self) -> None:
        if self._session is not None:
            try:
                self._session.restart()
            except Exception as e:
                logger.warning("restart failed, recreating: %s", e)
                self.close()

    def close(self) -> None:
        if self._session is not None:
            try:
                self._session.close()
            except Exception:
                logger.exception("close session")
            self._session = None
            self._city = None


def _sanitize_products(products: list[ProductDict]) -> list[dict]:
    """Гарантируем обязательные поля name/url (их требует серверная модель)."""
    out: list[dict] = []
    for p in products:
        name = p.get("name") or ""
        url = p.get("url") or ""
        if not name or not url:
            continue
        item = dict(p)
        item["name"] = name
        item["url"] = url
        out.append(item)
    return out


def _run_query(sess_holder: AgentSession, city: str, query: str, limit: int) -> dict:
    for attempt in range(1, QUERY_ATTEMPTS + 1):
        try:
            sess = sess_holder.ensure(city)
            products = sess.search(query, limit=limit)
            return {"query": query, "ok": True,
                    "products": _sanitize_products(products)}
        except WebDriverException as e:
            logger.warning("query '%s' WebDriverException (attempt %d): %s",
                           query, attempt, e)
            sess_holder.restart()
            if attempt == QUERY_ATTEMPTS:
                return {"query": query, "ok": False,
                        "error": f"webdriver: {e}"[:200], "products": []}
        except Exception as e:
            logger.exception("query '%s' failed", query)
            return {"query": query, "ok": False,
                    "error": str(e)[:200], "products": []}
    return {"query": query, "ok": False, "error": "unknown", "products": []}


def _process_job(http: requests.Session, sess_holder: AgentSession, job: dict) -> None:
    job_id = job["job_id"]
    city = (job.get("city") or "kazan").lower()
    limit = int(job.get("limit_per_query") or 5)
    queries = job.get("queries") or []
    logger.info("job %s: %d queries (city=%s)", job_id, len(queries), city)

    results: list[dict] = []
    error: Optional[str] = None
    try:
        for q in queries:
            results.append(_run_query(sess_holder, city, q, limit))
    except Exception as e:  # catastrophic (e.g. driver wholly dead)
        logger.exception("job %s crashed", job_id)
        error = str(e)[:300]
        sess_holder.restart()

    _submit_result(http, job_id, results, error)


def _submit_result(http: requests.Session, job_id: str,
                   results: list[dict], error: Optional[str]) -> None:
    url = f"{SERVER_URL}/lemana/agent/jobs/{job_id}/result"
    try:
        r = http.post(url, json={"results": results, "error": error},
                      headers={"X-Agent-Token": AGENT_TOKEN}, timeout=HTTP_TIMEOUT)
        if r.status_code == 204:
            ok_n = sum(1 for x in results if x.get("ok"))
            logger.info("job %s: submitted (%d/%d queries ok)", job_id, ok_n, len(results))
        else:
            logger.error("submit job %s -> HTTP %d: %s", job_id, r.status_code, r.text[:200])
    except requests.RequestException as e:
        logger.error("submit job %s failed: %s", job_id, e)


def _poll(http: requests.Session) -> Optional[dict]:
    url = f"{SERVER_URL}/lemana/agent/poll"
    r = http.post(url, json={"wait_seconds": POLL_WAIT},
                  headers={"X-Agent-Token": AGENT_TOKEN}, timeout=POLL_WAIT + 15)
    if r.status_code == 401:
        raise RuntimeError("invalid agent token (401) — check LEMANA_AGENT_TOKEN")
    if r.status_code == 503:
        raise RuntimeError("server agent mode not configured (503) — set "
                           "LEMANA_AGENT_MODE=1 and LEMANA_AGENT_TOKEN on the server")
    r.raise_for_status()
    return r.json()  # job dict, or None on poll timeout


def main() -> int:
    if not SERVER_URL:
        logger.error("SERVER_URL is not set")
        return 2
    if not AGENT_TOKEN:
        logger.error("LEMANA_AGENT_TOKEN is not set")
        return 2

    logger.info("agent starting -> %s (poll_wait=%ds, headless=%s)",
                SERVER_URL, POLL_WAIT, HEADLESS)
    http = requests.Session()
    sess_holder = AgentSession()
    backoff = 2
    try:
        while True:
            try:
                job = _poll(http)
                backoff = 2
            except RuntimeError as e:  # auth/config — fatal-ish, wait longer
                logger.error("%s", e)
                time.sleep(30)
                continue
            except requests.RequestException as e:
                logger.warning("poll failed (%s) — retry in %ds", e, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
                continue

            if job is None:
                continue  # no work; poll again
            _process_job(http, sess_holder, job)
    except KeyboardInterrupt:
        logger.info("interrupted, shutting down")
        return 0
    finally:
        sess_holder.close()


if __name__ == "__main__":
    sys.exit(main())
