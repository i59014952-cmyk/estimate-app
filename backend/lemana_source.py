"""Lemana Pro price source.

Parsing relies on JSON-LD blocks embedded in product pages (SSR), so it works
without full SPA hydration. Live fetching uses undetected_chromedriver because
Lemana is behind Qrator (plain HTTP gets 403). The browser is heavy and the
import is deferred, so this module can be imported and unit-tested with only
selectolax installed.

Test mode: set LEMANA_MOCK=1 to serve parsed results from HTML fixtures in
LEMANA_MOCK_DIR (default backend/tests/fixtures) instead of launching a browser.
"""
from __future__ import annotations

import asyncio
import glob
import json
import os
import re
import shutil
import subprocess
import threading
import time
from typing import Optional

from selectolax.parser import HTMLParser

BASE_DOMAIN = os.environ.get("LEMANA_DOMAIN", "https://kazan.lemanapro.ru")
_FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "tests", "fixtures")


def _detect_chrome_major() -> Optional[int]:
    """Return the installed Chrome's major version, or None when undetectable.

    undetected_chromedriver otherwise downloads a driver for the latest release,
    which fails ("only supports Chrome version N") whenever the pinned Chrome in
    the image lags behind. Matching version_main to the actual binary keeps the
    driver in lockstep across Chrome auto-updates.
    """
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        path = shutil.which(name)
        if not path:
            continue
        try:
            out = subprocess.run(
                [path, "--version"], capture_output=True, text=True, timeout=10
            ).stdout
        except Exception:
            continue
        m = re.search(r"\b(\d+)\.\d+\.\d+", out)
        if m:
            return int(m.group(1))
    return None


# --------------------------------------------------------------------------- #
# Parsing (pure, no browser)
# --------------------------------------------------------------------------- #

def _load_json_ld(tree: HTMLParser) -> tuple[dict, dict]:
    """Return (product_ld, breadcrumbs_ld); empty dicts when absent. A single
    <script> may hold one object or a list, so flatten before matching @type."""
    product_ld: dict = {}
    breadcrumbs_ld: dict = {}
    for node in tree.css('script[type="application/ld+json"]'):
        raw = node.text() or ""
        try:
            data = json.loads(raw)
        except Exception:
            continue
        for d in (data if isinstance(data, list) else [data]):
            if not isinstance(d, dict):
                continue
            t = d.get("@type")
            if t == "Product" and not product_ld:
                product_ld = d
            elif t == "BreadcrumbList" and not breadcrumbs_ld:
                breadcrumbs_ld = d
    return product_ld, breadcrumbs_ld


def _category(product_ld: dict, breadcrumbs_ld: dict) -> str:
    """Prefer Product.category string ("A>B>C"), fall back to BreadcrumbList."""
    cat = product_ld.get("category")
    if isinstance(cat, str) and cat.strip():
        return " > ".join(p.strip() for p in cat.split(">") if p.strip())
    names = []
    for item in breadcrumbs_ld.get("itemListElement") or []:
        nm = ((item.get("item") or {}).get("name") or "").replace("⭐", "").strip()
        if nm:
            names.append(nm)
    return " > ".join(names)


def _characteristics(product_ld: dict, tree: HTMLParser) -> dict:
    """Prefer JSON-LD additionalProperty (always present, SSR); fall back to the
    DOM characteristics tab which only exists after hydration."""
    out: dict = {}
    for p in product_ld.get("additionalProperty") or []:
        if isinstance(p, dict):
            nm = (p.get("name") or "").strip()
            if nm:
                val = p.get("value")
                out[nm] = "" if val is None else str(val).strip()
    if out:
        return out
    for item in tree.css('[data-qa="characteristics-list-item"]'):
        children = [c for c in item.iter() if c.tag == "div"]
        if len(children) >= 2:
            key = (children[0].text() or "").strip()
            if key:
                out[key] = (children[1].text() or "").strip()
    return out


def _to_float(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    cleaned = re.sub(r"[^\d,.]", "", str(v)).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_product(html: str) -> dict:
    """Extract a product from a Lemana product page. JSON-LD is the source of
    truth; characteristics fall back to DOM. Returns {} when no Product block."""
    tree = HTMLParser(html)
    product_ld, breadcrumbs_ld = _load_json_ld(tree)
    if not product_ld:
        return {}

    offers = product_ld.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    rating = product_ld.get("aggregateRating") or {}

    images = product_ld.get("image") or []
    if isinstance(images, str):
        images = [images]

    availability = offers.get("availability") or ""
    if isinstance(availability, str) and "/" in availability:
        availability = availability.rsplit("/", 1)[-1]  # ".../InStock" -> "InStock"

    return {
        "url": offers.get("url") or "",
        "sku": str(product_ld.get("sku") or ""),
        "name": product_ld.get("name") or "",
        "category": _category(product_ld, breadcrumbs_ld),
        "price": _to_float(offers.get("price")),
        "currency": offers.get("priceCurrency") or "RUB",
        "availability": availability,
        "in_stock": (availability == "InStock") if availability else None,
        "rating": rating.get("ratingValue"),
        "review_count": rating.get("reviewCount"),
        "image": images[0] if images else "",
        "description": product_ld.get("description") or "",
        "characteristics": _characteristics(product_ld, tree),
    }


def parse_search(html: str) -> list[str]:
    """Absolute product URLs from a search results page, de-duplicated."""
    tree = HTMLParser(html)
    urls: list[str] = []
    seen: set[str] = set()
    for card in tree.css('[data-qa="product"]'):
        for a in card.css('a[href*="/product/"]'):
            href = (a.attributes.get("href") or "").split("#", 1)[0]
            if not href:
                continue
            if href.startswith("/"):
                href = BASE_DOMAIN + href
            if href in seen:
                continue
            seen.add(href)
            urls.append(href)
            break  # one card -> one link
    return urls


# --------------------------------------------------------------------------- #
# UI helpers (live mode only; selenium imported lazily so the module stays
# importable for parsing/mock tests without selenium installed).
# --------------------------------------------------------------------------- #

def dismiss_overlays(driver, wait_seconds: int = 10) -> None:
    """Close region ("Всё верно") and cookie ("Хорошо") banners. The cookie
    banner appears after the region one, so loop and re-check until idle."""
    from selenium.webdriver.common.by import By
    overlays = [
        ("css", '[data-qa="apply-region-button"]', "регион (data-qa)"),
        ("xpath", "//button[.//span[normalize-space()='Всё верно']]", "регион (текст)"),
        ("xpath", "//button[.//span[normalize-space()='Хорошо']]", "куки"),
    ]
    end_time = time.time() + wait_seconds
    clicked_ever = False
    idle_after_click = 0
    while time.time() < end_time:
        clicked_now = False
        for kind, sel, _name in overlays:
            by = By.CSS_SELECTOR if kind == "css" else By.XPATH
            for el in driver.find_elements(by, sel):
                try:
                    if not el.is_displayed():
                        continue
                    try:
                        driver.execute_script("arguments[0].click();", el)
                    except Exception:
                        el.click()
                    clicked_now = True
                    clicked_ever = True
                    time.sleep(0.5)
                    break
                except Exception:
                    continue
        if clicked_now:
            idle_after_click = 0
        elif clicked_ever:
            idle_after_click += 1
            if idle_after_click >= 3:
                break
            time.sleep(0.25)
        else:
            time.sleep(0.25)


def perform_search(driver, query: str) -> None:
    """Find the search trigger (input or button) and submit the query."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    WebDriverWait(driver, 20).until(
        EC.presence_of_element_located((
            By.XPATH,
            "//*[contains(@placeholder, 'Поиск') or contains(@aria-label, 'Поиск')"
            " or contains(normalize-space(.), 'Поиск')]",
        )))
    candidate_xpaths = [
        "//input[contains(@placeholder, 'Поиск')]",
        "//input[contains(@aria-label, 'Поиск') or contains(@aria-label, 'Искать')]",
        "//header//button[.//span[contains(normalize-space(.), 'Поиск')]]",
        "//*[@role='button'][.//span[contains(normalize-space(.), 'Поиск')]]",
        "//span[contains(normalize-space(.), 'Поиск')]/ancestor::button[1]",
        "//span[contains(normalize-space(.), 'Поиск')]/ancestor::*[@role='button'][1]",
        "//header//span[contains(normalize-space(.), 'Поиск')]",
    ]
    trigger = None
    for xp in candidate_xpaths:
        for el in driver.find_elements(By.XPATH, xp):
            try:
                if el.is_displayed():
                    trigger = el
                    break
            except Exception:
                continue
        if trigger is not None:
            break
    if trigger is None:
        raise RuntimeError("Lemana: search trigger not found")

    if trigger.tag_name.lower() == "input":
        try:
            trigger.click()
        except Exception:
            driver.execute_script("arguments[0].click();", trigger)
        trigger.send_keys(query)
        trigger.send_keys(Keys.RETURN)
        return

    try:
        trigger.click()
    except Exception:
        driver.execute_script("arguments[0].click();", trigger)
    WebDriverWait(driver, 10).until(
        lambda d: d.switch_to.active_element.tag_name.lower() == "input")
    box = driver.switch_to.active_element
    box.send_keys(query)
    box.send_keys(Keys.RETURN)


# --------------------------------------------------------------------------- #
# Session: reusable warm browser, serialized behind a lock. Optional mock mode.
# --------------------------------------------------------------------------- #

class LemanaSession:
    def __init__(self) -> None:
        self._driver = None
        self._warm = False
        self._lock = threading.Lock()  # Selenium driver is single-threaded
        self.mock = os.environ.get("LEMANA_MOCK") == "1"
        self.mock_dir = os.environ.get("LEMANA_MOCK_DIR", _FIXTURE_DIR)
        self.search_timeout = int(os.environ.get("LEMANA_SEARCH_TIMEOUT", "15"))

    # -- mock -------------------------------------------------------------- #
    def _mock_search(self, query: str, limit: int) -> list[dict]:
        rows: list[dict] = []
        for path in sorted(glob.glob(os.path.join(self.mock_dir, "product_*.html")))[:limit]:
            with open(path, encoding="utf-8") as f:
                row = parse_product(f.read())
                if row:
                    rows.append(row)
        return rows

    # -- live browser ------------------------------------------------------ #
    def _ensure_driver(self):
        if self._driver is not None:
            return
        import undetected_chromedriver as uc  # deferred: needs Chrome
        uc.Chrome.__del__ = lambda self: None  # silence double-quit on shutdown
        opts = uc.ChromeOptions()
        opts.page_load_strategy = "eager"
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        # Headless can trip Qrator; allow a headed run (LEMANA_HEADLESS=0) which
        # matches the proven local setup. Server keeps the default headless.
        if os.environ.get("LEMANA_HEADLESS", "1") != "0":
            opts.add_argument("--headless=new")
        kwargs: dict = {"options": opts}
        # Match the driver to the installed browser. LEMANA_CHROME_MAIN overrides;
        # otherwise probe the binary so the driver tracks Chrome across updates
        # (avoids "only supports Chrome version N" mismatches).
        vm = os.environ.get("LEMANA_CHROME_MAIN")
        version_main = int(vm) if vm else _detect_chrome_major()
        if version_main:
            kwargs["version_main"] = version_main
        self._driver = uc.Chrome(**kwargs)
        self._driver.set_window_size(1280, 900)
        self._driver.set_page_load_timeout(45)

    def _warmup(self):
        self._ensure_driver()
        if self._warm:
            return
        self._driver.get(BASE_DOMAIN + "/?fromRegion=506")
        dismiss_overlays(self._driver)
        self._warm = True

    def _search_blocking(self, query: str, limit: int) -> list[dict]:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        with self._lock:
            try:
                self._warmup()
                d = self._driver
                start = d.current_url
                perform_search(d, query)
                WebDriverWait(d, self.search_timeout).until(lambda x: x.current_url != start)
                try:
                    WebDriverWait(d, 10).until(
                        lambda x: x.find_elements(By.CSS_SELECTOR, '[data-qa="product"]'))
                except Exception:
                    pass
                urls = parse_search(d.page_source)[:limit]
                rows: list[dict] = []
                for url in urls:
                    d.get(url)
                    try:
                        WebDriverWait(d, 8).until(
                            lambda x: x.find_elements(
                                By.CSS_SELECTOR, 'script[type="application/ld+json"]'))
                    except Exception:
                        pass
                    row = parse_product(d.page_source)
                    if row:
                        rows.append(row)
                return rows
            except Exception:
                self._reset()  # driver may be wedged; rebuild next call
                raise

    def _reset(self):
        try:
            if self._driver:
                self._driver.quit()
        except Exception:
            pass
        self._driver = None
        self._warm = False

    # -- public ------------------------------------------------------------ #
    async def search(self, query: str, limit: int) -> list[dict]:
        if self.mock:
            return self._mock_search(query, limit)
        return await asyncio.to_thread(self._search_blocking, query, limit)

    def close(self):
        self._reset()
