import asyncio
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright, Browser, BrowserContext

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
DEFAULT_CITY = os.environ.get("DEFAULT_CITY", "moscow")
CITY_COOKIES = {
    "moscow": "1",
    "spb": "2",
    "kazan": "26",
    "ekaterinburg": "4",
}
PAGE_TIMEOUT_MS = 45000
SELECTOR_TIMEOUT_MS = 25000
HYDRATION_WAIT_MS = 8000
CACHE_TTL_S = 3600
CACHE_MAX = 5000
BATCH_MAX = 100
PER_QUERY_DELAY_S = 0.3

CARD_SEL = '[data-test="product-card-catalog-slim"]'
TITLE_SEL = '[data-test="product-title"]'
PRICE_SEL = '[data-test="product-gold-price"], [data-test="product-retail-price"]'
LINK_SEL = '[data-test="product-link"], a[href*="/catalog/"]'
CODE_SEL = '[data-test="product-code"]'


class PriceItem(BaseModel):
    name: str
    sku: Optional[str] = None
    price: Optional[float] = None
    currency: str = "RUB"
    unit: Optional[str] = None
    in_stock: Optional[bool] = None
    city: str
    url: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    city: str
    strategy_used: str
    cached: bool
    results: list[PriceItem]
    trail: Optional[list[str]] = None


class BatchRequest(BaseModel):
    queries: list[str] = Field(..., min_length=1, max_length=BATCH_MAX)
    city: str = DEFAULT_CITY
    limit: int = Field(1, ge=1, le=5)


class BatchItemResult(BaseModel):
    query: str
    found: bool
    strategy_used: Optional[str] = None
    cached: bool = False
    item: Optional[PriceItem] = None
    error: Optional[str] = None


class BatchResponse(BaseModel):
    city: str
    count: int
    items: list[BatchItemResult]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.2.0"
    playwright_available: bool = True
    site: str = "petrovich.ru"


class CacheStats(BaseModel):
    size: int
    max_size: int
    ttl_seconds: int
    hits: int
    misses: int


state: dict = {"browser": None, "pw": None, "cache": {}, "hits": 0, "misses": 0}


def _parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    cleaned = re.sub(r"[^\d,\.]", "", text).replace(",", ".")
    cleaned = re.sub(r"(\.\d+)\.", r"\1", cleaned)
    try:
        return float(cleaned)
    except ValueError:
        return None


def _cache_key(city: str, query: str, limit: int) -> str:
    return f"{city}|{limit}|{query.lower().strip()}"


def _cache_get(key: str):
    entry = state["cache"].get(key)
    if not entry:
        state["misses"] += 1
        return None
    ts, value = entry
    if time.time() - ts > CACHE_TTL_S:
        state["cache"].pop(key, None)
        state["misses"] += 1
        return None
    state["hits"] += 1
    return value


def _cache_set(key: str, value):
    if len(state["cache"]) >= CACHE_MAX:
        # drop oldest
        oldest = min(state["cache"].items(), key=lambda kv: kv[1][0])[0]
        state["cache"].pop(oldest, None)
    state["cache"][key] = (time.time(), value)


@asynccontextmanager
async def lifespan(_: FastAPI):
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    state["pw"] = pw
    state["browser"] = browser
    try:
        yield
    finally:
        await browser.close()
        await pw.stop()


app = FastAPI(title="Petrovich price parser", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _new_context(city: str) -> BrowserContext:
    ctx = await state["browser"].new_context(
        user_agent=USER_AGENT,
        locale="ru-RU",
        viewport={"width": 1366, "height": 900},
    )
    city_id = CITY_COOKIES.get(city, CITY_COOKIES[DEFAULT_CITY])
    await ctx.add_cookies([
        {"name": "CityID", "value": city_id, "domain": ".petrovich.ru", "path": "/"},
        {"name": "city", "value": city_id, "domain": ".petrovich.ru", "path": "/"},
    ])
    return ctx


async def _extract_cards(page, limit: int, city: str) -> list[PriceItem]:
    cards = page.locator(CARD_SEL)
    count = await cards.count()
    out: list[PriceItem] = []
    for i in range(min(count, limit)):
        card = cards.nth(i)
        title = ""
        try:
            title = (await card.locator(TITLE_SEL).first.inner_text(timeout=2000)).strip()
        except Exception:
            pass
        price_text = ""
        try:
            price_text = (await card.locator(PRICE_SEL).first.inner_text(timeout=2000)).strip()
        except Exception:
            pass
        href = None
        try:
            href = await card.locator(LINK_SEL).first.get_attribute("href", timeout=2000)
        except Exception:
            pass
        sku = None
        try:
            code_text = await card.locator(CODE_SEL).first.inner_text(timeout=1000)
            m = re.search(r"\d{4,}", code_text or "")
            if m:
                sku = m.group(0)
        except Exception:
            pass
        url = None
        if href:
            url = href if href.startswith("http") else f"https://petrovich.ru{href}"
        if not title:
            continue
        out.append(PriceItem(
            name=title,
            sku=sku,
            price=_parse_price(price_text),
            unit=None,
            city=city,
            url=url,
        ))
    return out


async def _search_via_url(ctx: BrowserContext, query: str, limit: int, city: str, trail: list[str]) -> tuple[list[PriceItem], str]:
    t0 = time.time()
    page = await ctx.new_page()
    try:
        url = f"https://petrovich.ru/catalog/search/?search={query.strip().replace(' ', '+')}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        except Exception as e:
            trail.append(f"url_catalog: goto failed: {e!s}"[:140])
            return [], "url_failed"
        await page.wait_for_timeout(HYDRATION_WAIT_MS)
        try:
            await page.wait_for_selector(CARD_SEL, timeout=SELECTOR_TIMEOUT_MS)
        except Exception:
            cnt = await page.locator(CARD_SEL).count()
            dt_count = await page.evaluate("() => document.querySelectorAll('[data-test]').length")
            trail.append(f"url_catalog: no_cards ({int(time.time()-t0)}s, cards={cnt}, data-tests={dt_count})")
            return [], "url_no_cards"
        items = await _extract_cards(page, limit, city)
        trail.append(f"url_catalog: got {len(items)} items in {int(time.time()-t0)}s")
        return items, "url_catalog"
    finally:
        await page.close()


async def _search_via_form(ctx: BrowserContext, query: str, limit: int, city: str, trail: list[str]) -> tuple[list[PriceItem], str]:
    t0 = time.time()
    page = await ctx.new_page()
    try:
        try:
            await page.goto("https://petrovich.ru/", wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        except Exception as e:
            trail.append(f"form_submit: goto failed: {e!s}"[:140])
            return [], "form_goto_failed"
        await page.wait_for_timeout(HYDRATION_WAIT_MS)
        input_candidates = [
            'input.header-search-input',
            '[data-test="main-search-form"] input[type="text"]',
            'form[name="search"] input[type="text"]',
            'input[name="q"][type="text"]',
            'input[name="q"]',
        ]
        input_sel = None
        for cand in input_candidates:
            try:
                await page.wait_for_selector(cand, timeout=5000, state="attached")
                input_sel = cand
                break
            except Exception:
                continue
        if not input_sel:
            inputs_dump = await page.evaluate("""
                () => Array.from(document.querySelectorAll('input')).slice(0,40).map(i => ({
                    type: i.type, name: i.name, placeholder: (i.placeholder||'').slice(0,40),
                    cls: (i.className||'').slice(0,60), dt: i.getAttribute('data-test')||''
                }))
            """)
            trail.append(f"form_submit: no_input ({int(time.time()-t0)}s, inputs={len(inputs_dump)})")
            trail.append(f"form_submit: inputs_dump={inputs_dump[:5]}")
            return [], "form_no_input"
        trail.append(f"form_submit: matched '{input_sel}' ({int(time.time()-t0)}s)")
        inp = page.locator(input_sel).first
        try:
            await inp.click(timeout=5000)
            await inp.fill(query, timeout=5000)
            await inp.press("Enter", timeout=5000)
        except Exception as e:
            trail.append(f"form_submit: type failed: {e!s}"[:140])
            return [], "form_type_failed"
        try:
            await page.wait_for_selector(CARD_SEL, timeout=SELECTOR_TIMEOUT_MS)
        except Exception:
            url_now = page.url
            trail.append(f"form_submit: no_cards after submit ({int(time.time()-t0)}s, url={url_now[:120]})")
            return [], "form_no_cards"
        items = await _extract_cards(page, limit, city)
        trail.append(f"form_submit: got {len(items)} items in {int(time.time()-t0)}s")
        return items, "form_submit"
    finally:
        await page.close()


async def _search_impl(query: str, city: str, limit: int) -> tuple[list[PriceItem], str, list[str]]:
    trail: list[str] = []
    ctx = await _new_context(city)
    try:
        items, strat = await _search_via_url(ctx, query, limit, city, trail)
        if items:
            return items, strat, trail
        items, strat = await _search_via_form(ctx, query, limit, city, trail)
        return items, strat, trail
    finally:
        await ctx.close()


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(playwright_available=state["browser"] is not None)


@app.get("/search", response_model=SearchResponse)
async def search(
    query: str = Query(..., min_length=2, max_length=200, description="Строка поиска"),
    city: Optional[str] = Query(None, description="Город (slug)"),
    limit: int = Query(5, ge=1, le=30),
):
    if state["browser"] is None:
        raise HTTPException(503, "browser not initialised")
    city = (city or DEFAULT_CITY).lower()
    key = _cache_key(city, query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city=city, strategy_used="cache", cached=True, results=cached)
    try:
        items, strategy, trail = await _search_impl(query, city, limit)
    except Exception as e:
        raise HTTPException(502, f"scrape failed: {e!s}"[:200])
    _cache_set(key, items)
    return SearchResponse(query=query, city=city, strategy_used=strategy, cached=False, results=items, trail=trail)


@app.post("/batch", response_model=BatchResponse)
async def batch(req: BatchRequest):
    if state["browser"] is None:
        raise HTTPException(503, "browser not initialised")
    city = (req.city or DEFAULT_CITY).lower()
    results: list[BatchItemResult] = []
    for q in req.queries:
        q = (q or "").strip()
        if not q:
            results.append(BatchItemResult(query=q, found=False, error="empty"))
            continue
        key = _cache_key(city, q, req.limit)
        cached = _cache_get(key)
        if cached is not None:
            item = cached[0] if cached else None
            results.append(BatchItemResult(query=q, found=bool(item), item=item, cached=True, strategy_used="cache"))
            continue
        try:
            items, strategy, _ = await _search_impl(q, city, req.limit)
            _cache_set(key, items)
            item = items[0] if items else None
            results.append(BatchItemResult(query=q, found=bool(item), item=item, strategy_used=strategy))
        except Exception as e:
            results.append(BatchItemResult(query=q, found=False, error=str(e)[:200]))
        await asyncio.sleep(PER_QUERY_DELAY_S)
    return BatchResponse(city=city, count=len(results), items=results)


@app.get("/cache/stats", response_model=CacheStats)
def cache_stats():
    return CacheStats(
        size=len(state["cache"]),
        max_size=CACHE_MAX,
        ttl_seconds=CACHE_TTL_S,
        hits=state["hits"],
        misses=state["misses"],
    )


@app.delete("/cache")
def cache_clear():
    before = len(state["cache"])
    state["cache"].clear()
    return {"cleared": before}


import httpx
from bs4 import BeautifulSoup


KOLORIT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


async def _kolorit_fetch(url: str) -> str:
    async with httpx.AsyncClient(
        headers={
            "User-Agent": KOLORIT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
        follow_redirects=True,
        timeout=25.0,
    ) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.text


def _kolorit_extract_price(card) -> Optional[float]:
    """Try structured price selectors, then fall back to any text ending with ₽."""
    for sel in (
        ".price-item__sum.price-discount",
        ".price-item__sum.price-regular",
        ".price-item__sum",
        ".catalog-item__price",
    ):
        el = card.select_one(sel)
        if not el:
            continue
        value = _parse_price(el.get_text(" ", strip=True))
        if value is not None and value > 0:
            return value
    # Last-resort: scan card text for "NNN ₽"
    text = card.get_text(" ", strip=True)
    m = re.search(r"(\d[\d\s]{0,8})\s*₽", text)
    if m:
        value = _parse_price(m.group(1))
        if value is not None and value > 0:
            return value
    return None


def _kolorit_parse(html: str, limit: int) -> list[PriceItem]:
    """Parse a Kolorit catalog/search page. Real product cards are div.catalog-item
    that expose a product name via a.link-head and a recognisable price."""
    soup = BeautifulSoup(html, "lxml")
    items: list[PriceItem] = []
    for card in soup.select("div.catalog-item"):
        if len(items) >= limit:
            break
        price = _kolorit_extract_price(card)
        if price is None:
            continue
        name_el = card.select_one("a.link-head") or card.select_one(".catalog-item__head a")
        if not name_el:
            continue
        name = name_el.get_text(" ", strip=True)
        if not name:
            continue
        href = (name_el.get("href") or "").strip()
        url_ = href if href.startswith("http") else f"https://kolorit.ru{href}"
        sku = None
        sku_el = card.select_one(".catalog-item__top")
        if sku_el:
            m = re.search(r"\d{6,}", sku_el.get_text())
            if m:
                sku = m.group(0)
        items.append(PriceItem(
            name=name,
            sku=sku,
            price=price,
            unit=None,
            city="kazan",
            url=url_,
        ))
    return items


async def _kolorit_search_merged(query: str, limit: int) -> tuple[list[PriceItem], list[str]]:
    """Try multiple Kolorit search URLs, merge unique results by URL."""
    q = query.strip().replace(" ", "+")
    urls_to_try = [
        f"https://kolorit.ru/catalog/?q={q}",
        f"https://kolorit.ru/search/?q={q}",
    ]
    merged: list[PriceItem] = []
    seen: set[str] = set()
    tried: list[str] = []
    for url in urls_to_try:
        try:
            html = await _kolorit_fetch(url)
        except Exception:
            tried.append(f"{url} -> fetch error")
            continue
        chunk = _kolorit_parse(html, limit)
        tried.append(f"{url} -> {len(chunk)} items")
        for item in chunk:
            key = item.url or item.name
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                return merged, tried
    return merged[:limit], tried


@app.get("/kolorit/search", response_model=SearchResponse)
async def kolorit_search(
    query: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(5, ge=1, le=30),
):
    key = _cache_key("kolorit", query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city="kolorit", strategy_used="cache", cached=True, results=cached)
    try:
        items, tried = await _kolorit_search_merged(query, limit)
    except Exception as e:
        raise HTTPException(502, f"kolorit fetch failed: {e!s}"[:200])
    _cache_set(key, items)
    return SearchResponse(query=query, city="kolorit", strategy_used="http", cached=False, results=items, trail=tried)


@app.get("/prices/search", response_model=SearchResponse)
async def prices_search(
    query: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(6, ge=1, le=30),
):
    """Combined search: Kolorit + Krepmast + Voltkin + moi-instrumenty in parallel, merged by URL."""
    key = _cache_key("combined", query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city="combined", strategy_used="cache", cached=True, results=cached)

    per_source = max(3, (limit + 3) // 4)

    async def k():
        try:
            items, tr = await _kolorit_search_merged(query, per_source)
            return items, [f"kolorit: {t}" for t in tr]
        except Exception as e:
            return [], [f"kolorit: error: {e!s}"[:140]]

    async def m():
        try:
            items, tr = await _krepmast_search_merged(query, per_source)
            return items, [f"krepmast: {t}" for t in tr]
        except Exception as e:
            return [], [f"krepmast: error: {e!s}"[:140]]

    async def v():
        try:
            items, tr = await _voltkin_search_merged(query, per_source)
            return items, [f"voltkin: {t}" for t in tr]
        except Exception as e:
            return [], [f"voltkin: error: {e!s}"[:140]]

    async def mi():
        try:
            items, tr = await _moi_search_merged(query, per_source)
            return items, [f"moi: {t}" for t in tr]
        except Exception as e:
            return [], [f"moi: error: {e!s}"[:140]]

    (k_items, k_trail), (m_items, m_trail), (v_items, v_trail), (mi_items, mi_trail) = await asyncio.gather(k(), m(), v(), mi())

    for it in k_items: it.city = "kolorit"
    for it in m_items: it.city = "krepmast"
    for it in v_items: it.city = "voltkin"
    for it in mi_items: it.city = "moi"

    merged: list[PriceItem] = []
    seen: set[str] = set()
    # Round-robin between sources so results look diverse
    source_lists = [k_items, m_items, v_items, mi_items]
    idx = 0
    empty_streak = 0
    while len(merged) < limit and empty_streak < len(source_lists):
        lst = source_lists[idx]
        if lst:
            it = lst.pop(0)
            key_ = it.url or it.name
            if key_ not in seen:
                seen.add(key_)
                merged.append(it)
            empty_streak = 0
        else:
            empty_streak += 1
        idx = (idx + 1) % len(source_lists)

    _cache_set(key, merged)
    return SearchResponse(
        query=query, city="combined", strategy_used="http", cached=False,
        results=merged, trail=k_trail + m_trail + v_trail + mi_trail,
    )


def _krepmast_parse(html: str, limit: int) -> list[PriceItem]:
    """Krepmast uses .catalog-item with data-name/data-price/data-id attributes."""
    soup = BeautifulSoup(html, "lxml")
    items: list[PriceItem] = []
    for card in soup.select(".catalog-item"):
        if len(items) >= limit:
            break
        name = (card.get("data-name") or "").strip()
        price_raw = (card.get("data-price") or "").strip()
        sku = (card.get("data-id") or "").strip() or None
        if not name:
            name_el = card.select_one("[itemprop='name']")
            if name_el:
                name = name_el.get_text(" ", strip=True)
        if not name:
            continue
        price = _parse_price(price_raw)
        if price is None:
            meta = card.select_one("meta[itemprop='price']")
            if meta:
                price = _parse_price(meta.get("content", ""))
        if price is None or price <= 0:
            continue
        link_el = card.select_one(".blk_name a[href]") or card.select_one("a[href*='/catalog/']")
        url_ = None
        if link_el:
            href = link_el.get("href") or ""
            url_ = href if href.startswith("http") else f"https://krepmast.ru{href}"
        in_stock = None
        stock_raw = card.get("data-stock")
        if stock_raw:
            try:
                in_stock = int(stock_raw) > 0
            except ValueError:
                pass
        items.append(PriceItem(
            name=name,
            sku=sku,
            price=price,
            unit=None,
            in_stock=in_stock,
            city="kazan",
            url=url_,
        ))
    return items


async def _krepmast_search_merged(query: str, limit: int) -> tuple[list[PriceItem], list[str]]:
    q = query.strip().replace(" ", "+")
    urls_to_try = [
        f"https://krepmast.ru/search/?find={q}",
    ]
    merged: list[PriceItem] = []
    seen: set[str] = set()
    tried: list[str] = []
    for url in urls_to_try:
        try:
            html = await _kolorit_fetch(url)
        except Exception as e:
            tried.append(f"{url} -> fetch error: {e!s}"[:140])
            continue
        chunk = _krepmast_parse(html, limit)
        tried.append(f"{url} -> {len(chunk)} items")
        for item in chunk:
            key = item.url or item.name
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                return merged, tried
    return merged[:limit], tried


def _voltkin_parse(html: str, limit: int) -> list[PriceItem]:
    """Voltkin.ru runs on OpenCart: .product-thumb card, div.name > a, p.price."""
    soup = BeautifulSoup(html, "lxml")
    items: list[PriceItem] = []
    for card in soup.select(".product-thumb"):
        if len(items) >= limit:
            break
        name_el = card.select_one("div.name a") or card.select_one(".caption a")
        if not name_el:
            continue
        name = name_el.get_text(" ", strip=True)
        if not name:
            continue
        href = (name_el.get("href") or "").strip()
        url_ = href if href.startswith("http") else f"https://voltkin.ru{href.lstrip('/')}" if not href.startswith("/") else f"https://voltkin.ru{href}"
        price = None
        price_el = card.select_one("p.price, .price")
        if price_el:
            price = _parse_price(price_el.get_text(" ", strip=True))
        if price is None or price <= 0:
            continue
        sku = None
        for dotted in card.select(".dotted"):
            label = dotted.select_one(".filter-name-cat")
            val = dotted.select_one(".filter-value")
            if label and val and "артикул" in label.get_text(strip=True).lower():
                sku = val.get_text(strip=True)
                break
        items.append(PriceItem(
            name=name,
            sku=sku,
            price=price,
            unit=None,
            city="kazan",
            url=url_,
        ))
    return items


async def _voltkin_search_merged(query: str, limit: int) -> tuple[list[PriceItem], list[str]]:
    q = query.strip().replace(" ", "+")
    urls_to_try = [
        f"https://voltkin.ru/index.php?route=product/search&search={q}",
        f"https://voltkin.ru/search?search={q}",
    ]
    merged: list[PriceItem] = []
    seen: set[str] = set()
    tried: list[str] = []
    for url in urls_to_try:
        try:
            html = await _kolorit_fetch(url)
        except Exception as e:
            tried.append(f"{url} -> error: {e!s}"[:140])
            continue
        chunk = _voltkin_parse(html, limit)
        tried.append(f"{url} -> {len(chunk)} items")
        for item in chunk:
            key = item.url or item.name
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                return merged, tried
    return merged[:limit], tried


def _moi_parse(html: str, limit: int) -> list[PriceItem]:
    """moi-instrumenty.ru runs on InSales: .products__item card,
    .products__item-info-name for the title, .products__pr-price-new .price for the price."""
    soup = BeautifulSoup(html, "lxml")
    items: list[PriceItem] = []
    for card in soup.select(".products__item"):
        if len(items) >= limit:
            break
        name_el = card.select_one(".products__item-info-name")
        if not name_el:
            continue
        name = name_el.get_text(" ", strip=True)
        if not name:
            continue
        price_el = card.select_one(".products__pr-price-new .price")
        if not price_el:
            continue
        price = _parse_price(price_el.get_text(" ", strip=True))
        if price is None or price <= 0:
            continue
        link_el = card.select_one("a[href]")
        url_ = None
        if link_el:
            href = (link_el.get("href") or "").strip()
            if href:
                url_ = href if href.startswith("http") else f"https://moi-instrumenty.ru{href}"
        sku = None
        sku_el = card.select_one("input[name='product_id']")
        if sku_el and sku_el.get("value"):
            sku = sku_el.get("value").strip() or None
        in_stock = bool(card.select_one(".products__available-in-stock"))
        items.append(PriceItem(
            name=name,
            sku=sku,
            price=price,
            unit=None,
            in_stock=in_stock,
            city="moi",
            url=url_,
        ))
    return items


async def _moi_search_merged(query: str, limit: int) -> tuple[list[PriceItem], list[str]]:
    q = query.strip().replace(" ", "+")
    urls_to_try = [
        f"https://moi-instrumenty.ru/search/?q={q}",
    ]
    merged: list[PriceItem] = []
    seen: set[str] = set()
    tried: list[str] = []
    for url in urls_to_try:
        try:
            html = await _kolorit_fetch(url)
        except Exception as e:
            tried.append(f"{url} -> fetch error: {e!s}"[:140])
            continue
        chunk = _moi_parse(html, limit)
        tried.append(f"{url} -> {len(chunk)} items")
        for item in chunk:
            key = item.url or item.name
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                return merged, tried
    return merged[:limit], tried


@app.get("/moi/search", response_model=SearchResponse)
async def moi_search(
    query: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(5, ge=1, le=30),
):
    key = _cache_key("moi", query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city="moi", strategy_used="cache", cached=True, results=cached)
    try:
        items, tried = await _moi_search_merged(query, limit)
    except Exception as e:
        raise HTTPException(502, f"moi fetch failed: {e!s}"[:200])
    _cache_set(key, items)
    return SearchResponse(query=query, city="moi", strategy_used="http", cached=False, results=items, trail=tried)


@app.get("/voltkin/search", response_model=SearchResponse)
async def voltkin_search(
    query: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(5, ge=1, le=30),
):
    key = _cache_key("voltkin", query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city="voltkin", strategy_used="cache", cached=True, results=cached)
    try:
        items, tried = await _voltkin_search_merged(query, limit)
    except Exception as e:
        raise HTTPException(502, f"voltkin fetch failed: {e!s}"[:200])
    _cache_set(key, items)
    return SearchResponse(query=query, city="voltkin", strategy_used="http", cached=False, results=items, trail=tried)


@app.get("/krepmast/search", response_model=SearchResponse)
async def krepmast_search(
    query: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(5, ge=1, le=30),
):
    key = _cache_key("krepmast", query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city="krepmast", strategy_used="cache", cached=True, results=cached)
    try:
        items, tried = await _krepmast_search_merged(query, limit)
    except Exception as e:
        raise HTTPException(502, f"krepmast fetch failed: {e!s}"[:200])
    _cache_set(key, items)
    return SearchResponse(query=query, city="krepmast", strategy_used="http", cached=False, results=items, trail=tried)


@app.get("/voltkin/debug")
async def voltkin_debug(query: str = "розетка", path: str = "/rozetki-i-vykljuchateli"):
    url = f"https://voltkin.ru{path}"
    if "?" in path:
        url = url + query.strip().replace(" ", "+")
    try:
        html = await _kolorit_fetch(url)
    except Exception as e:
        return {"error": str(e)[:200], "url": url}
    soup = BeautifulSoup(html, "lxml")
    body_text = soup.get_text("\n", strip=True)[:2500]
    candidates = [
        ".product-thumb", ".product-layout", ".product-card", ".product-item",
        ".catalog-item", "[data-product-id]", ".product",
        "[itemtype*='Product']", ".item", "article",
        "a[href*='/product']", "a[href*='/rozetk']",
    ]
    counts = {sel: len(soup.select(sel)) for sel in candidates}
    cls_freq: dict[str, int] = {}
    for el in soup.select("[class]"):
        for cl in el.get("class") or []:
            cls_freq[cl] = cls_freq.get(cl, 0) + 1
    top_classes = sorted(cls_freq.items(), key=lambda kv: -kv[1])[:40]
    forms = []
    for f in soup.find_all("form"):
        forms.append({
            "action": f.get("action"),
            "method": f.get("method"),
            "inputs": [{"name": i.get("name"), "type": i.get("type"), "placeholder": i.get("placeholder")} for i in f.find_all("input")],
        })
    first_card = None
    for sel in ("[itemtype*='Product']", ".product-thumb", ".product-layout"):
        el = soup.select_one(sel)
        if el:
            first_card = str(el)[:3000]
            break
    return {
        "url": url,
        "html_len": len(html),
        "title": soup.title.string.strip() if soup.title and soup.title.string else None,
        "body_snippet": body_text,
        "selector_counts": counts,
        "top_classes": top_classes,
        "forms": forms,
        "first_card_html": first_card,
    }


@app.get("/krepmast/home-form")
async def krepmast_home_form():
    try:
        html = await _kolorit_fetch("https://krepmast.ru/")
    except Exception as e:
        return {"error": str(e)[:200]}
    soup = BeautifulSoup(html, "lxml")
    forms = []
    for f in soup.find_all("form"):
        action = f.get("action")
        method = f.get("method")
        inputs = []
        for i in f.find_all("input"):
            inputs.append({"name": i.get("name"), "type": i.get("type"), "placeholder": i.get("placeholder"), "id": i.get("id")})
        forms.append({"action": action, "method": method, "inputs": inputs, "html": str(f)[:500]})
    search_links = [a.get("href") for a in soup.find_all("a") if a.get("href") and "search" in (a.get("href") or "").lower()]
    return {"forms": forms, "search_links": list(set(search_links))[:10]}


@app.get("/krepmast/debug")
async def krepmast_debug(query: str = "саморезы", path: str = "/catalog/krepezh/samorezy/"):
    url = f"https://krepmast.ru{path}"
    if "?" in path:
        url = url.rstrip("&") + query.strip().replace(" ", "+")
    try:
        html = await _kolorit_fetch(url)
    except Exception as e:
        return {"error": str(e)[:200], "url": url}
    soup = BeautifulSoup(html, "lxml")
    body_text = soup.get_text("\n", strip=True)[:3000]
    candidates = [
        ".catalog-item", ".product-card", ".product-item", ".item-card",
        ".b-card", "[itemtype*='Product']", "[data-product-id]",
        ".catalog__item", ".products-list__item", ".card-product",
        "article", "li.product", ".grid__item", "div[class*='product']",
        "div[class*='Product']", "a[href*='/catalog/']",
    ]
    counts = {sel: len(soup.select(sel)) for sel in candidates}
    cls_freq: dict[str, int] = {}
    for el in soup.select("[class]"):
        for cl in el.get("class") or []:
            cls_freq[cl] = cls_freq.get(cl, 0) + 1
    top_classes = sorted(cls_freq.items(), key=lambda kv: -kv[1])[:40]
    # Find an element containing "₽" and walk up to a card-like wrapper
    sample_cards = []
    for el in soup.find_all(string=lambda s: s and "₽" in s):
        walker = el.parent
        for _ in range(8):
            if walker is None:
                break
            classes = walker.get("class") or []
            if walker.name in ("article", "li") or any(
                c for c in classes if any(x in c.lower() for x in ("card", "item", "product"))
            ):
                break
            walker = walker.parent
        sample_cards.append({
            "tag": walker.name if walker else None,
            "class": walker.get("class") if walker else None,
            "html": str(walker)[:2000] if walker else None,
        })
        if len(sample_cards) >= 3:
            break
    # Also dump first product card directly
    first_card_html = None
    first_card = soup.select_one(".catalog-item") or soup.select_one("[itemtype*='Product']")
    if first_card:
        first_card_html = str(first_card)[:3000]
    return {
        "url": url,
        "html_len": len(html),
        "title": soup.title.string.strip() if soup.title and soup.title.string else None,
        "body_snippet": body_text,
        "selector_counts": counts,
        "top_classes": top_classes,
        "sample_cards": sample_cards,
        "first_card_html": first_card_html,
    }


@app.get("/kolorit/debug")
async def kolorit_debug(query: str = "краска", path: str = "/search/?q="):
    url = f"https://kolorit.ru{path}{query.strip().replace(' ', '+')}"
    html = await _kolorit_fetch(url)
    soup = BeautifulSoup(html, "lxml")
    body_text = soup.get_text("\n", strip=True)[:3000]
    # count candidate selectors
    candidates = [
        ".catalog-section-item", ".bx_catalog_item", ".product-item",
        ".js-product-card", "[data-product-id]", "[itemprop='itemListElement']",
        "[data-entity='items-row']", "li.product", ".item",
        ".bx_catalog_item_container", "[itemprop='offers']",
        "a[href*='/catalog/']",
    ]
    counts = {sel: len(soup.select(sel)) for sel in candidates}
    # look at top classes
    cls_freq: dict[str, int] = {}
    for el in soup.select("[class]"):
        for cl in el.get("class") or []:
            cls_freq[cl] = cls_freq.get(cl, 0) + 1
    top_classes = sorted(cls_freq.items(), key=lambda kv: -kv[1])[:40]
    # find search form
    form = soup.select_one("form[action*='search'], form[name='search']")
    form_html = str(form)[:500] if form else None
    # Try to find product card by price element and walk up to a likely wrapper
    sample_cards = []
    for price_el in soup.select(".catalog-item__price, .price-item__sum")[:3]:
        walker = price_el
        for _ in range(6):
            walker = walker.parent
            if walker is None:
                break
            if walker.name in ("article", "li") or any(
                c in (walker.get("class") or [])
                for c in ("catalog-item", "catalog-item__wrap", "product", "product-item")
            ):
                break
        sample_cards.append({
            "tag": walker.name if walker else None,
            "class": walker.get("class") if walker else None,
            "html": (str(walker)[:2000] if walker else None),
        })
    return {
        "url": url,
        "html_len": len(html),
        "title": soup.title.string.strip() if soup.title and soup.title.string else None,
        "body_snippet": body_text,
        "selector_counts": counts,
        "top_classes": top_classes,
        "form_html": form_html,
        "sample_cards": sample_cards,
    }


@app.get("/debug/home")
async def debug_home():
    if state["browser"] is None:
        raise HTTPException(503, "browser not initialised")
    ctx = await _new_context(DEFAULT_CITY)
    page = await ctx.new_page()
    try:
        await page.goto("https://petrovich.ru/", wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        await page.wait_for_timeout(HYDRATION_WAIT_MS)
        inputs = await page.evaluate("""
            () => Array.from(document.querySelectorAll('input')).slice(0, 30).map(i => ({
                type: i.type,
                name: i.name || null,
                id: i.id || null,
                placeholder: i.placeholder || null,
                dataTest: i.getAttribute('data-test') || null,
                className: (i.className || '').slice(0, 80)
            }))
        """)
        forms = await page.evaluate("""
            () => Array.from(document.querySelectorAll('form')).slice(0, 10).map(f => ({
                action: f.action || null,
                method: f.method || null,
                dataTest: f.getAttribute('data-test') || null,
                html: f.outerHTML.slice(0, 800)
            }))
        """)
        main_search_html = await page.evaluate("""
            () => {
                const el = document.querySelector('[data-test="main-search-form"]');
                return el ? el.outerHTML.slice(0, 2000) : null;
            }
        """)
        meta = await page.evaluate("""
            () => ({
                url: location.href,
                title: document.title,
                htmlLen: document.documentElement.outerHTML.length,
                bodyText: document.body ? document.body.innerText.slice(0, 1500) : null,
                dataTests: Array.from(new Set(
                    Array.from(document.querySelectorAll('[data-test]'))
                        .map(e => e.getAttribute('data-test'))
                )).slice(0, 40),
            })
        """)
        return {"meta": meta, "inputs": inputs, "forms": forms, "main_search_html": main_search_html}
    finally:
        await ctx.close()
