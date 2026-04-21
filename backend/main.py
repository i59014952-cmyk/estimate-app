import asyncio
import os
import re
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright, Browser, BrowserContext

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
SEARCH_URL = "https://petrovich.ru/catalog/search/?search={q}"
MAX_ITEMS = 50
PAGE_TIMEOUT_MS = 30000
SELECTOR_TIMEOUT_MS = 12000
PER_QUERY_DELAY_S = 0.4

CARD_SELECTOR = ",".join([
    '[data-test="product-snippet"]',
    '[data-test="product-card"]',
    'article.product-card',
    '.pt-product-snippet',
    '.product-snippet',
])
TITLE_SELECTOR = ",".join([
    '[data-test="product-title"]',
    '[itemprop="name"]',
    '.product-card__title',
    '.pt-product-title',
])
PRICE_SELECTOR = ",".join([
    '[data-test="product-gold-price"]',
    '[data-test="product-price"]',
    '[itemprop="price"]',
    '.pt-price__value',
    '.product-card__price',
])
LINK_SELECTOR = ",".join([
    'a.product-snippet__name',
    'a.product-card__link',
    '[data-test="product-card"] a',
    'article.product-card a',
])


class Req(BaseModel):
    names: list[str] = Field(..., max_length=MAX_ITEMS)
    city: Optional[str] = None


class Item(BaseModel):
    query: str
    found: bool
    title: Optional[str] = None
    price: Optional[float] = None
    url: Optional[str] = None
    error: Optional[str] = None


state: dict = {"browser": None, "pw": None}


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


app = FastAPI(title="Petrovich price proxy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    digits = re.sub(r"[^\d,\.]", "", text).replace(",", ".")
    digits = re.sub(r"(\.\d+)\.", r"\1", digits)
    try:
        return float(digits)
    except ValueError:
        return None


async def search_one(context: BrowserContext, query: str) -> Item:
    page = await context.new_page()
    try:
        url = SEARCH_URL.format(q=query.strip().replace(" ", "+"))
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        except Exception as e:
            return Item(query=query, found=False, error=f"goto: {e!s}"[:200])
        try:
            await page.wait_for_selector(CARD_SELECTOR, timeout=SELECTOR_TIMEOUT_MS)
        except Exception:
            return Item(query=query, found=False, error="no product cards on page")

        card = page.locator(CARD_SELECTOR).first
        title = ""
        try:
            title = (await card.locator(TITLE_SELECTOR).first.inner_text(timeout=3000)).strip()
        except Exception:
            pass
        price_text = ""
        try:
            price_text = (await card.locator(PRICE_SELECTOR).first.inner_text(timeout=3000)).strip()
        except Exception:
            pass
        link = ""
        try:
            href = await card.locator(LINK_SELECTOR).first.get_attribute("href", timeout=3000)
            if href:
                link = href if href.startswith("http") else f"https://petrovich.ru{href}"
        except Exception:
            pass

        if not title and not price_text:
            return Item(query=query, found=False, error="card found but empty")
        return Item(
            query=query,
            found=True,
            title=title or None,
            price=parse_price(price_text),
            url=link or None,
        )
    finally:
        await page.close()


@app.post("/prices", response_model=list[Item])
async def prices(req: Req):
    browser: Browser = state["browser"]
    if browser is None:
        raise HTTPException(503, "browser not initialised")
    context = await browser.new_context(
        user_agent=USER_AGENT,
        locale="ru-RU",
        viewport={"width": 1366, "height": 900},
    )
    try:
        results: list[Item] = []
        for name in req.names[:MAX_ITEMS]:
            if not name or not name.strip():
                continue
            item = await search_one(context, name.strip())
            results.append(item)
            await asyncio.sleep(PER_QUERY_DELAY_S)
        return results
    finally:
        await context.close()


@app.get("/health")
def health():
    return {"ok": True, "browser": state["browser"] is not None}


@app.get("/debug")
async def debug(q: str = "цемент"):
    browser: Browser = state["browser"]
    if browser is None:
        raise HTTPException(503, "browser not initialised")
    context = await browser.new_context(
        user_agent=USER_AGENT,
        locale="ru-RU",
        viewport={"width": 1366, "height": 900},
    )
    page = await context.new_page()
    try:
        url = SEARCH_URL.format(q=q.strip().replace(" ", "+"))
        await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
        await page.wait_for_timeout(2000)
        final_url = page.url
        html = await page.content()
        # sample all data-test values and class names for guidance
        data_tests = await page.evaluate(
            "() => Array.from(new Set(Array.from(document.querySelectorAll('[data-test]')).map(e=>e.getAttribute('data-test'))))"
        )
        classes = await page.evaluate(
            "() => { const c = new Map(); document.querySelectorAll('*').forEach(e => e.classList.forEach(cl => c.set(cl,(c.get(cl)||0)+1))); return Array.from(c.entries()).sort((a,b)=>b[1]-a[1]).slice(0,40); }"
        )
        selector_counts = {}
        for sel in [
            '[data-test="product-snippet"]',
            '[data-test="product-card"]',
            '[data-test*="product"]',
            'article',
            '.product-card',
            '.pt-product-snippet',
            '.product-snippet',
            '[class*="product"]',
            '[class*="snippet"]',
            '[class*="catalog-item"]',
        ]:
            selector_counts[sel] = await page.locator(sel).count()
        try:
            await page.wait_for_selector('[class*="product"], [class*="Product"], [class*="snippet"], [class*="catalog"]', timeout=8000)
        except Exception:
            pass
        html = await page.content()
        body_text = await page.evaluate("() => document.body.innerText.slice(0, 4000)")
        json_scripts = await page.evaluate("""
            () => Array.from(document.querySelectorAll('script')).filter(s =>
                s.type && (s.type.includes('json') || s.type.includes('ld'))
            ).map(s => ({type: s.type, id: s.id, len: (s.textContent||'').length, preview: (s.textContent||'').slice(0, 200)}))
        """)
        # search HTML for hints
        hints = {}
        for term in ['goods', 'product', 'search_result', 'searchResults', 'catalog-item', 'price_with_discount', 'price_list', '__NUXT__', '__NEXT_DATA__', 'apollo', 'PRELOADED_STATE', 'item-card', 'ym:', 'nothingFound']:
            idx = html.find(term)
            hints[term] = idx
        html_slices = {}
        for term in ['product', 'Product', 'goods', 'snippet', '__LOADABLE_REQUIRED_CHUNKS___ext', 'data-product', 'article', 'ld+json', 'pet4Data']:
            idx = html.find(term)
            if idx != -1:
                html_slices[term] = html[max(0, idx-200):idx+600]
        # also count a few generic selectors after SPA settled
        await page.wait_for_timeout(5000)
        late_counts = {}
        for sel in ['[data-test]', 'a[href*="/catalog/"]', '[class*="Card"]', '[class*="Item"]', '[class*="SearchResult"]', '[class*="Good"]', 'img']:
            late_counts[sel] = await page.locator(sel).count()
        return {
            "final_url": final_url,
            "html_len": len(html),
            "body_text": body_text,
            "data_tests": data_tests[:50],
            "top_classes": classes[:40],
            "selector_counts": selector_counts,
            "late_counts": late_counts,
            "json_scripts": json_scripts,
            "html_hints": hints,
            "html_slices": html_slices,
        }
    finally:
        await context.close()
