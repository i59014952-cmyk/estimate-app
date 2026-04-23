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


def _kolorit_parse(html: str, limit: int) -> list[PriceItem]:
    """Parse Kolorit Bitrix catalog/search HTML. Try several common selectors."""
    soup = BeautifulSoup(html, "lxml")
    items: list[PriceItem] = []
    card_selectors = [
        ".catalog-section-item",
        ".bx_catalog_item",
        ".product-item",
        ".js-product-card",
        "[data-product-id]",
        "[data-entity='items-row'] .item",
        "li.product",
    ]
    cards = []
    for sel in card_selectors:
        cards = soup.select(sel)
        if cards:
            break
    if not cards:
        # last resort: any <a> inside a div that contains a ruble sign
        for link in soup.select('a[href^="/catalog/"]'):
            parent = link.find_parent(["div", "li"])
            if parent and ("₽" in parent.get_text() or "руб" in parent.get_text().lower()):
                cards.append(parent)
                if len(cards) >= limit * 3:
                    break
    for card in cards[: limit * 2]:
        if len(items) >= limit:
            break
        link = card.find("a", href=lambda h: h and "/catalog/" in h)
        if not link:
            continue
        href = link.get("href") or ""
        name = (link.get("title") or link.get_text(" ", strip=True))[:300]
        if not name:
            continue
        # Try to find price text in card
        price_el = None
        for psel in [
            ".price",
            ".product-price",
            ".catalog-item-price",
            ".bx_price",
            "[itemprop='price']",
            "[data-entity='price']",
        ]:
            price_el = card.select_one(psel)
            if price_el:
                break
        price_text = price_el.get_text(" ", strip=True) if price_el else card.get_text(" ", strip=True)
        price = _parse_price(price_text)
        url_ = href if href.startswith("http") else f"https://kolorit.ru{href}"
        items.append(PriceItem(
            name=name,
            sku=None,
            price=price,
            unit=None,
            city="msk",
            url=url_,
        ))
    return items


@app.get("/kolorit/search", response_model=SearchResponse)
async def kolorit_search(
    query: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(5, ge=1, le=30),
):
    key = _cache_key("kolorit", query, limit)
    cached = _cache_get(key)
    if cached:
        return SearchResponse(query=query, city="kolorit", strategy_used="cache", cached=True, results=cached)
    url = f"https://kolorit.ru/search/?q={query.strip().replace(' ', '+')}"
    try:
        html = await _kolorit_fetch(url)
    except Exception as e:
        raise HTTPException(502, f"kolorit fetch failed: {e!s}"[:200])
    items = _kolorit_parse(html, limit)
    _cache_set(key, items)
    return SearchResponse(query=query, city="kolorit", strategy_used="http", cached=False, results=items)


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
