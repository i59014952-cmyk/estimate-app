"""Долгоживущая обёртка над undetected_chromedriver для Lemana Pro.

Не thread-safe: один LemanaSession = один Chrome = используется последовательно
одним воркером. Параллельный доступ ломает driver (один CDP-канал).

Использовать как context manager:
    with LemanaSession(city="kazan") as s:
        for q in queries:
            products = s.search(q, limit=5)
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Optional, TypedDict
from urllib.parse import urlparse

import undetected_chromedriver as uc
from selectolax.parser import HTMLParser
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

uc.Chrome.__del__ = lambda self: None  # WinError 6 из двойного quit в __del__ библиотеки

logger = logging.getLogger(__name__)


def _detect_chrome_major() -> Optional[int]:
    """Мажорная версия установленного Chrome, чтобы uc скачал совместимый драйвер.

    Без этого uc берёт драйвер под последний Chrome, и при более старом
    google-chrome-stable в образе сессия падает с "only supports Chrome NNN".
    Возвращает None, если определить не удалось — тогда решает сам uc.
    """
    candidates = [
        "google-chrome-stable", "google-chrome", "chromium-browser", "chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for name in candidates:
        path = name if "/" in name else shutil.which(name)
        if not path:
            continue
        try:
            out = subprocess.run(
                [path, "--version"], capture_output=True, text=True, timeout=10,
            )
        except Exception:
            continue
        m = re.search(r"(\d+)\.\d+\.\d+", f"{out.stdout}\n{out.stderr}")
        if m:
            return int(m.group(1))
    return None


CITY_TO_REGION = {
    "moscow": 506,
    "spb": 1448,
    "kazan": 34,
}


class ProductDict(TypedDict, total=False):
    name: str
    price: Optional[float]
    currency: str
    sku: Optional[str]
    url: str
    image: Optional[str]
    breadcrumbs: list[str]
    characteristics: dict[str, str]
    availability: Optional[str]
    description: Optional[str]


class LemanaSession:
    """Одна Chrome-сессия для серии поисков."""

    DEFAULT_TIMEOUT = 15
    OVERLAY_WAIT = 10
    PAGE_TIMEOUT = 45
    BASE_URL_TPL = "https://{city}.lemanapro.ru/?fromRegion={region}"

    def __init__(self, city: str = "kazan", headless: bool = True,
                 chrome_version: Optional[int] = None,
                 proxy: Optional[str] = None):
        self.city = city
        self.headless = headless
        self.chrome_version = chrome_version
        # Прокси для обхода Qrator (серверный IP блокируется). Формат:
        # "http://host:port", "socks5://host:port" или с авторизацией
        # "http://user:pass@host:port". Лучше брать прокси с whitelist по IP
        # (без логина/пароля) — тогда расширение для авторизации не нужно.
        self.proxy = proxy or None
        self._proxy_ext_dir: Optional[str] = None
        self._driver: Optional[uc.Chrome] = None

    def __enter__(self) -> "LemanaSession":
        self._start_driver()
        self._open_home_and_dismiss_overlays()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def _start_driver(self) -> None:
        opts = uc.ChromeOptions()
        opts.page_load_strategy = "eager"
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--window-size=1280,900")
        # Экономия памяти (сервер 4 ГБ): один renderer, лимит JS-кучи, без кэша
        # на диск и фоновых процессов — чтобы Chrome не раздувался и не вызывал OOM.
        opts.add_argument("--renderer-process-limit=1")
        opts.add_argument("--js-flags=--max-old-space-size=256")
        opts.add_argument("--disk-cache-size=1")
        opts.add_argument("--disable-application-cache")
        opts.add_argument("--disable-background-networking")
        # На macOS режим --headless=new у uc 3.5.5 + свежего Chrome падает
        # ("target window already closed"). Поэтому локально (darwin) не уходим
        # в настоящий headless, а уводим окно за пределы экрана — пользователь
        # его не видит. На сервере (Linux, без дисплея) нужен реальный headless.
        _is_mac = sys.platform == "darwin"
        if self.headless and not _is_mac:
            opts.add_argument("--headless=new")
        if self.headless and _is_mac:
            opts.add_argument("--window-position=-32000,-32000")
        if self.proxy:
            self._apply_proxy(opts)
        kwargs: dict = {"options": opts}
        if _is_mac:
            kwargs["use_subprocess"] = True   # фикс 'target window already closed' на macOS
        # uc по умолчанию качает драйвер под ПОСЛЕДНИЙ Chrome, а в образе может
        # стоять более старый google-chrome-stable → "only supports Chrome NNN".
        # Привязываем драйвер к фактически установленной версии: явное значение
        # из env имеет приоритет, иначе определяем автоматически.
        version_main = self.chrome_version
        if version_main is None:
            version_main = _detect_chrome_major()
        if version_main is not None:
            kwargs["version_main"] = version_main
            logger.info("uc.Chrome version_main=%s", version_main)
        self._driver = uc.Chrome(**kwargs)
        if self.headless and _is_mac:
            try:
                self._driver.set_window_position(-32000, -32000)
            except Exception:
                pass
        self._driver.set_window_size(1280, 900)
        self._driver.set_page_load_timeout(self.PAGE_TIMEOUT)
        logger.info("uc.Chrome started (headless=%s, city=%s, proxy=%s)",
                    self.headless, self.city, bool(self.proxy))

    def _apply_proxy(self, opts: "uc.ChromeOptions") -> None:
        """Направить Chrome через прокси (env LEMANA_PROXY).

        Без логина/пароля (whitelist по IP) — просто --proxy-server.
        С логином/паролем — генерируем временное MV2-расширение, которое
        отвечает на запрос авторизации прокси (Chrome не принимает user:pass
        прямо во флаге). Рекомендуется прокси с whitelist по IP.
        """
        p = urlparse(self.proxy if "://" in self.proxy else f"http://{self.proxy}")
        scheme = (p.scheme or "http").lower()
        host, port = p.hostname, p.port
        if not host or not port:
            logger.warning("LEMANA_PROXY некорректен, пропускаю: %r", self.proxy)
            return
        opts.add_argument(f"--proxy-server={scheme}://{host}:{port}")
        if p.username and p.password:
            self._proxy_ext_dir = self._build_proxy_auth_extension(
                scheme, host, port, p.username, p.password,
            )
            if self._proxy_ext_dir:
                opts.add_argument(f"--load-extension={self._proxy_ext_dir}")
        logger.info("proxy applied: %s://%s:%s (auth=%s)",
                    scheme, host, port, bool(p.username))

    @staticmethod
    def _build_proxy_auth_extension(scheme: str, host: str, port: int,
                                    user: str, password: str) -> Optional[str]:
        try:
            d = tempfile.mkdtemp(prefix="lemana_proxy_ext_")
            manifest = {
                "name": "lemana-proxy-auth",
                "version": "1.0.0",
                "manifest_version": 2,
                "permissions": ["proxy", "webRequest", "webRequestBlocking",
                                 "<all_urls>"],
                "background": {"scripts": ["bg.js"]},
            }
            bg = (
                "chrome.webRequest.onAuthRequired.addListener(\n"
                "  function(details){return {authCredentials:{username:%r,password:%r}};},\n"
                "  {urls:['<all_urls>']}, ['blocking']\n"
                ");\n" % (user, password)
            )
            with open(os.path.join(d, "manifest.json"), "w") as f:
                json.dump(manifest, f)
            with open(os.path.join(d, "bg.js"), "w") as f:
                f.write(bg)
            return d
        except Exception:
            logger.exception("не удалось собрать proxy-auth extension")
            return None

    def _open_home_and_dismiss_overlays(self) -> None:
        region = CITY_TO_REGION.get(self.city, CITY_TO_REGION["kazan"])
        url = self.BASE_URL_TPL.format(city=self.city, region=region)
        assert self._driver is not None
        self._driver.get(url)
        self._dismiss_overlays(self.OVERLAY_WAIT)

    def restart(self) -> None:
        """Полный перезапуск Chrome после крэша/таймаута."""
        logger.warning("LemanaSession restart")
        self.close()
        self._start_driver()
        self._open_home_and_dismiss_overlays()

    def close(self) -> None:
        if self._driver is not None:
            try:
                self._driver.quit()
            except Exception as e:
                logger.warning("driver.quit() failed: %s", e)
            self._driver = None
        if self._proxy_ext_dir:
            shutil.rmtree(self._proxy_ext_dir, ignore_errors=True)
            self._proxy_ext_dir = None

    # ------------------------------------------------------------------
    # public search
    # ------------------------------------------------------------------

    def search(self, query: str, limit: int = 5) -> list[ProductDict]:
        """Полный цикл: ввод запроса -> URL-ы карточек -> парсинг карточек."""
        assert self._driver is not None, "session not started"
        urls = self._perform_search(query)[:limit]
        out: list[ProductDict] = []
        for url in urls:
            try:
                out.append(self._parse_product_page(url))
            except Exception as e:
                logger.warning("[%s] parse_product failed for %s: %s", query, url, e)
        logger.info("search('%s', limit=%d) -> %d products", query, limit, len(out))
        return out

    # ------------------------------------------------------------------
    # overlay handling (region/cookie banners)
    # ------------------------------------------------------------------

    def _dismiss_overlays(self, wait_seconds: int) -> None:
        """Закрыть баннеры региона и куков."""
        driver = self._driver
        assert driver is not None
        overlays = [
            ("css", '[data-qa="apply-region-button"]', "регион (data-qa)"),
            ("xpath", "//button[.//span[normalize-space()='Всё верно']]", "регион (по тексту)"),
            ("xpath", "//button[.//span[normalize-space()='Хорошо']]", "куки"),
        ]
        end_time = time.time() + wait_seconds
        clicked_ever = False
        idle_after_click = 0
        while time.time() < end_time:
            clicked_now = False
            for kind, sel, name in overlays:
                by = By.CSS_SELECTOR if kind == "css" else By.XPATH
                for el in driver.find_elements(by, sel):
                    try:
                        if not el.is_displayed():
                            continue
                        try:
                            driver.execute_script("arguments[0].click();", el)
                        except Exception:
                            el.click()
                        logger.debug("dismissed overlay: %s", name)
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

    # ------------------------------------------------------------------
    # search input handling
    # ------------------------------------------------------------------

    def _perform_search(self, query: str) -> list[str]:
        """Ввести запрос, дождаться выдачи, вернуть URL-ы карточек."""
        driver = self._driver
        assert driver is not None
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((
                By.XPATH,
                "//*[contains(@placeholder, 'Поиск')"
                " or contains(@aria-label, 'Поиск')"
                " or contains(normalize-space(.), 'Поиск')]",
            ))
        )
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
            raise RuntimeError("search trigger not found on page")

        starting_url = driver.current_url
        if trigger.tag_name.lower() == "input":
            try:
                trigger.click()
            except Exception:
                driver.execute_script("arguments[0].click();", trigger)
            try:
                trigger.clear()
            except Exception:
                pass
            trigger.send_keys(query)
            trigger.send_keys(Keys.RETURN)
        else:
            try:
                trigger.click()
            except Exception:
                driver.execute_script("arguments[0].click();", trigger)
            WebDriverWait(driver, 10).until(
                lambda d: d.switch_to.active_element.tag_name.lower() == "input"
            )
            search_input = driver.switch_to.active_element
            search_input.send_keys(query)
            search_input.send_keys(Keys.RETURN)

        WebDriverWait(driver, 15).until(lambda d: d.current_url != starting_url)
        try:
            WebDriverWait(driver, 10).until(
                lambda d: d.find_elements(By.CSS_SELECTOR, '[data-qa="product"]')
            )
        except Exception:
            pass
        return self._extract_search_urls(driver.page_source)

    @staticmethod
    def _extract_search_urls(html: str) -> list[str]:
        tree = HTMLParser(html)
        urls: list[str] = []
        seen: set[str] = set()
        for card in tree.css('[data-qa="product"]'):
            for a in card.css('a[href*="/product/"]'):
                href = (a.attributes.get("href") or "").split("#", 1)[0]
                if not href:
                    continue
                if href in seen:
                    continue
                seen.add(href)
                urls.append(href)
                break
        return urls

    # ------------------------------------------------------------------
    # product page parsing
    # ------------------------------------------------------------------

    def _parse_product_page(self, url: str) -> ProductDict:
        driver = self._driver
        assert driver is not None
        if url.startswith("/"):
            base = f"https://{self.city}.lemanapro.ru"
            url = base + url
        driver.get(url)
        try:
            WebDriverWait(driver, 8).until(
                lambda d: d.find_elements(By.CSS_SELECTOR, 'script[type="application/ld+json"]')
            )
        except Exception:
            pass
        return self._parse_product_html(driver.page_source, fallback_url=url)

    @staticmethod
    def _parse_product_html(html: str, fallback_url: str = "") -> ProductDict:
        tree = HTMLParser(html)
        product_ld, breadcrumbs_ld = LemanaSession._load_json_ld(tree)
        offers = product_ld.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        images = product_ld.get("image") or []
        if isinstance(images, str):
            images = [images]
        availability = offers.get("availability") or ""
        if isinstance(availability, str) and "/" in availability:
            availability = availability.rsplit("/", 1)[-1]
        price_raw = offers.get("price")
        try:
            price = float(price_raw) if price_raw not in (None, "") else None
        except (TypeError, ValueError):
            price = None
        return {
            "url": offers.get("url") or fallback_url,
            "sku": product_ld.get("sku") or None,
            "name": product_ld.get("name") or "",
            "price": price,
            "currency": offers.get("priceCurrency") or "RUB",
            "availability": availability or None,
            "image": images[0] if images else None,
            "description": product_ld.get("description") or None,
            "breadcrumbs": LemanaSession._breadcrumb_names(breadcrumbs_ld),
            "characteristics": LemanaSession._characteristics_from_dom(tree),
        }

    @staticmethod
    def _load_json_ld(tree: HTMLParser) -> tuple[dict, dict]:
        product_ld: dict = {}
        breadcrumbs_ld: dict = {}
        for node in tree.css('script[type="application/ld+json"]'):
            raw = node.text() or ""
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            t = data.get("@type")
            if t == "Product":
                product_ld = data
            elif t == "BreadcrumbList":
                breadcrumbs_ld = data
        return product_ld, breadcrumbs_ld

    @staticmethod
    def _breadcrumb_names(breadcrumbs_ld: dict) -> list[str]:
        names: list[str] = []
        for item in breadcrumbs_ld.get("itemListElement") or []:
            nm = ((item.get("item") or {}).get("name") or "").replace("⭐", "").strip()
            if nm:
                names.append(nm)
        return names

    @staticmethod
    def _characteristics_from_dom(tree: HTMLParser) -> dict[str, str]:
        out: dict[str, str] = {}
        for item in tree.css('[data-qa="characteristics-list-item"]'):
            children = [c for c in item.iter() if c.tag == "div"]
            if len(children) >= 2:
                key = (children[0].text() or "").strip()
                val = (children[1].text() or "").strip()
                if key:
                    out[key] = val
        return out
