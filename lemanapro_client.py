"""
Парсер каталога Lemana Pro (lemanapro.ru) по архитектуре leroymerlin_scraper.

Архитектура (как в референсе https://github.com/3gr1v750v/leroymerlin_scraper):
    * Scraper(url, driver) -- открывает страницу через undetected_chromedriver,
      ждёт <script id="__NEXT_DATA__">, парсит JSON.
    * Catalog -- собирает ссылки на товары с index-страниц категории.
    * JsonBuilder -- собирает структурированные данные по каждому продукту.
    * driver-функции (initial_object_collection ... json_generator) --
      последовательный pipeline сбора и сохранения в lemanapro_data.json.

Установка:
    py -m pip install undetected-chromedriver selenium beautifulsoup4 lxml

Запуск:
    cd /d/kub && py lemanapro_client.py

Замечание: c домашнего IP Qrator уже клал Playwright. undetected_chromedriver
заметно лучше проходит JS-challenge, но при упорном блоке (RuntimeError на
ожидании __NEXT_DATA__) понадобится российский резидентный прокси.
"""

import json
import math
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import undetected_chromedriver as uc
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# =============================================================================
# КОНСТАНТЫ
# =============================================================================

SOURCE_URL = (
    "https://kazan.lemanapro.ru/catalogue/raspashnye-mezhkomnatnye-dveri/"
    "?fromRegion=506"
)
BASE_DOMAIN = "https://kazan.lemanapro.ru"
OUTPUT_FILE = "lemanapro_data.json"
DELAY_TIME = 5
NEXT_DATA_TIMEOUT = 30


# =============================================================================
# Scraper -- загрузка страницы и извлечение __NEXT_DATA__
# =============================================================================


@dataclass
class Scraper:
    url: str
    driver: uc.Chrome

    def __post_init__(self):
        """
        Открыть URL в браузере, дождаться появления <script id="__NEXT_DATA__">
        и распарсить его в self.next_data.
        """
        self.driver.get(self.url)

        element_present = EC.presence_of_element_located(
            (By.CSS_SELECTOR, "script#__NEXT_DATA__")
        )
        WebDriverWait(self.driver, NEXT_DATA_TIMEOUT).until(element_present)

        self.html = self.driver.page_source
        self.soup = BeautifulSoup(self.html, "lxml")

        raw = self.soup.find("script", id="__NEXT_DATA__")
        if raw is None or not raw.string:
            raise RuntimeError(f"Нет __NEXT_DATA__ на {self.url}")
        self.next_data: dict = json.loads(raw.string)

    @property
    def get_pagination_number(self) -> int:
        """
        Общее количество страниц в данной категории, рассчитанное из __NEXT_DATA__.
        Пробуем стандартные поля totalPages / pageCount, иначе total/perPage.
        """
        page_props = _safe_get(self.next_data, "props", "pageProps") or {}

        path_candidates = [
            ("pagination", "totalPages"),
            ("pagination", "pageCount"),
            ("catalog", "pagination", "totalPages"),
            ("catalog", "totalPages"),
            ("category", "pagination", "totalPages"),
            ("category", "totalPages"),
            ("data", "pagination", "totalPages"),
            ("data", "totalPages"),
            ("totalPages",),
            ("pageCount",),
        ]
        for path in path_candidates:
            value = _safe_get(page_props, *path)
            if isinstance(value, int) and value > 0:
                return value

        total = _deep_find_int(
            page_props, ("total", "totalCount", "totalItems", "count")
        )
        per_page = (
            _deep_find_int(page_props, ("perPage", "pageSize", "limit", "size"))
            or 30
        )
        if total:
            return math.ceil(total / per_page)
        return 1


# =============================================================================
# Catalog -- сбор ссылок на товары с index-страниц
# =============================================================================


@dataclass
class Catalog:
    """Класс подготовки ссылок продуктов выбранной категории."""

    index_catalog: List[str] = field(default_factory=list)

    def index_catalog_builder(self, next_data: dict) -> None:
        """Выгрузка ссылок из списка товаров на index странице."""
        items = _extract_category_items(next_data)
        for item in items:
            if not isinstance(item, dict):
                continue
            url = (
                item.get("url")
                or item.get("link")
                or item.get("href")
                or item.get("productUrl")
            )
            if not url:
                pid = item.get("id") or item.get("productId") or item.get("article")
                if pid:
                    url = f"/product/{pid}/"
            if not url:
                continue
            if url.startswith("/"):
                url = f"{BASE_DOMAIN}{url}"
            self.index_catalog.append(url)

    @property
    def get_catalog(self) -> List[str]:
        return self.index_catalog


# =============================================================================
# JsonBuilder -- сборка структурированных данных продукта из __NEXT_DATA__
# =============================================================================


@dataclass
class JsonBuilder:
    """
    Класс обслуживания сбора и формирования пакета данных о продукте
    после отработки скрепера.
    """

    product_file: List[Dict] = field(default_factory=list)

    def collect_product_content(self, next_data: dict) -> None:
        """Сборщик словаря с данными продуктов."""
        page_props = _safe_get(next_data, "props", "pageProps") or {}
        product = (
            _safe_get(page_props, "product")
            or _safe_get(page_props, "data", "product")
            or _safe_get(page_props, "initialState", "product")
            or {}
        )
        if not product:
            return

        product_title = product.get("name") or product.get("title") or "-"

        product_url = product.get("url") or "-"
        if isinstance(product_url, str) and product_url.startswith("/"):
            product_url = f"{BASE_DOMAIN}{product_url}"

        product_description = (
            product.get("description")
            or _safe_get(product, "seo", "description")
            or "-"
        )

        product_price = self.price_selector(product)

        brand = _safe_get(product, "brand", "name") or product.get("brand") or "-"
        if isinstance(brand, dict):
            brand = brand.get("name", "-")

        category_nodes = (
            product.get("breadcrumbs") or product.get("categories") or []
        )
        category = [
            (n.get("name") if isinstance(n, dict) else str(n))
            for n in category_nodes
            if n
        ]

        specifications = self.load_specifications(product)
        images = self.load_images(product)

        data = {
            "domain": BASE_DOMAIN,
            "product_url": product_url,
            "product_title": product_title,
            "product_description": product_description,
            "price": product_price,
            "brand": brand,
            "category": category,
            "specifications": specifications,
            "images": images,
        }

        self.product_file.append(data)

    def price_selector(self, product: dict) -> Optional[float]:
        """На сайте может публиковаться одна из нескольких цен."""
        candidates = [
            _safe_get(product, "price", "current"),
            _safe_get(product, "price", "value"),
            _safe_get(product, "price", "best"),
            _safe_get(product, "price"),
            product.get("currentPrice"),
            product.get("bestPrice"),
        ]
        for value in candidates:
            if isinstance(value, dict):
                continue
            result = _to_float(value)
            if result is not None:
                return result
        return None

    def load_specifications(self, product: dict) -> Dict[str, Any]:
        """Блок выгрузки спецификаций продукта."""
        raw = product.get("characteristics") or product.get("attributes") or []
        return _flatten_characteristics(raw)

    def load_images(self, product: dict) -> List[str]:
        """Блок выгрузки картинок."""
        raw = product.get("images") or product.get("gallery") or []
        out: List[str] = []
        if isinstance(raw, list):
            for img in raw:
                if isinstance(img, dict):
                    url = img.get("url") or img.get("src")
                    if url:
                        out.append(url)
                elif isinstance(img, str):
                    out.append(img)
        single = product.get("image")
        if isinstance(single, dict):
            url = single.get("url")
            if url:
                out.append(url)
        elif isinstance(single, str):
            out.append(single)
        return out


# =============================================================================
# Driver pipeline -- последовательная сборка каталога и продуктов
# =============================================================================


def initial_object_collection(source_url, driver):
    """
    Сбор данных о количестве страниц и сохранение объекта первой страницы в
    пулл последующего скреппинга.
    """
    start_page = Scraper(source_url, driver)
    total_pages = start_page.get_pagination_number
    index_catalog = [start_page]
    return total_pages, index_catalog


def urls_pull_object_collection(
    total_pages, delay_time, source_url, index_catalog, scraper_class, driver
):
    """Создаём массив из объектов с данными индекса страниц."""
    for pagination in range(2, total_pages + 1):
        time.sleep(delay_time)
        sep = "&" if "?" in source_url else "?"
        url = f"{source_url}{sep}page={pagination}"
        index_catalog.append(scraper_class(url, driver))
    return index_catalog


def urls_pull_list_collection(index_catalog, catalog):
    """Создаём каталог с перечнем ссылок продуктов."""
    for page in index_catalog:
        catalog.index_catalog_builder(page.next_data)


def pages_pull_objects_collection(catalog, delay_time, scraper_class, driver):
    """Создаём массив объектов с данными продуктов."""
    list_to_scrape = []
    total_products = len(catalog.index_catalog)
    counter = 0

    for url in catalog.index_catalog:
        time.sleep(delay_time)
        try:
            list_to_scrape.append(scraper_class(url, driver))
        except Exception as exc:
            print(f"\nSkip {url}: {exc}")
        counter += 1
        print(
            f"\rProcessing {counter} of {total_products}", end="", flush=True
        )

    print()
    return list_to_scrape


def product_data_builder(json_builder, list_to_scrape):
    """Собираем данные о продуктах в словарь."""
    for page in list_to_scrape:
        json_builder.collect_product_content(page.next_data)


def json_generator(json_builder):
    """Создаём JSON фаил на основе данных словаря."""
    with open(OUTPUT_FILE, "w", encoding="utf-8") as outfile:
        json.dump(
            json_builder.product_file, outfile, indent=4, ensure_ascii=False
        )


def main():
    """Основной драйвер проекта."""

    delay_time: int = DELAY_TIME
    driver = uc.Chrome()

    driver.set_window_size(1280, 900)

    try:
        source_url = SOURCE_URL

        total_pages, index_catalog = initial_object_collection(
            source_url, driver
        )
        print(f"Total pages: {total_pages}")

        full_catalog = urls_pull_object_collection(
            total_pages, delay_time, source_url, index_catalog, Scraper, driver
        )

        catalog = Catalog()
        urls_pull_list_collection(full_catalog, catalog)
        print(f"Total product URLs: {len(catalog.index_catalog)}")

        list_to_scrape = pages_pull_objects_collection(
            catalog, delay_time, Scraper, driver
        )

        json_builder = JsonBuilder()
        product_data_builder(json_builder, list_to_scrape)

        json_generator(json_builder)

        print(f"\rДанные сохранены в {OUTPUT_FILE}")
    finally:
        try:
            driver.close()
        except Exception:
            pass
        driver.quit()


# =============================================================================
# Хелперы
# =============================================================================


def _safe_get(obj: Any, *path: str) -> Any:
    cur = obj
    for key in path:
        if isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return None
        if cur is None:
            return None
    return cur


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("\xa0", "").replace(" ", "").replace(",", ".")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _flatten_characteristics(raw: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items()}
    if not isinstance(raw, list):
        return out
    for group in raw:
        if not isinstance(group, dict):
            continue
        if "name" in group and "value" in group:
            out[str(group["name"])] = group["value"]
            continue
        props = group.get("properties") or group.get("attributes") or []
        for p in props:
            if isinstance(p, dict) and "name" in p:
                out[str(p["name"])] = p.get("value")
    return out


def _extract_category_items(next_data: dict) -> List[dict]:
    """Список товаров категории из __NEXT_DATA__ с фоллбэком на deep-scan."""
    page_props = _safe_get(next_data, "props", "pageProps") or {}
    path_candidates = [
        ("products",),
        ("items",),
        ("data", "products"),
        ("catalog", "products"),
        ("catalog", "items"),
        ("category", "products"),
        ("category", "items"),
        ("searchResult", "products"),
        ("initialState", "catalog", "products"),
        ("initialState", "search", "products"),
    ]
    for path in path_candidates:
        value = _safe_get(page_props, *path)
        if isinstance(value, list) and value:
            return value
    return _deep_find_products(page_props) or []


def _deep_find_products(obj: Any) -> Optional[List[dict]]:
    """Ищем первый список словарей, похожих на карточки товаров."""
    if isinstance(obj, list) and obj and isinstance(obj[0], dict):
        keys = set(obj[0].keys())
        if keys & {"id", "productId", "article"} and keys & {"name", "title"}:
            return obj
    if isinstance(obj, dict):
        for v in obj.values():
            found = _deep_find_products(v)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _deep_find_products(item)
            if found:
                return found
    return None


def _deep_find_int(obj: Any, keys: tuple) -> Optional[int]:
    """Глубокий поиск целочисленного значения по любому из ключей."""
    if isinstance(obj, dict):
        for k in keys:
            v = obj.get(k)
            if isinstance(v, int):
                return v
        for v in obj.values():
            found = _deep_find_int(v, keys)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _deep_find_int(item, keys)
            if found is not None:
                return found
    return None


if __name__ == "__main__":
    main()
