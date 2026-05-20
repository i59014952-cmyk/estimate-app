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

import json                                         # стандартный модуль для работы с JSON (загрузка/сохранение)
import math                                         # нужен для math.ceil при расчёте кол-ва страниц
import time                                         # нужен для time.sleep между запросами (анти-бан)
from dataclasses import dataclass, field            # декоратор @dataclass и field для default_factory
from typing import Any, Dict, List, Optional        # аннотации типов для читабельности кода

import undetected_chromedriver as uc                # обёртка над Chrome, обходит часть anti-bot
from bs4 import BeautifulSoup                       # HTML-парсер для извлечения тега <script>
from selenium.webdriver.common.by import By         # перечисление селекторов (CSS, XPATH и т.д.)
from selenium.webdriver.common.keys import Keys     # спецклавиши (Enter, Tab и т.д.) для send_keys
from selenium.webdriver.support import expected_conditions as EC  # готовые условия ожидания
from selenium.webdriver.support.ui import WebDriverWait           # явное ожидание элемента


# =============================================================================
# КОНСТАНТЫ
# =============================================================================

SOURCE_URL = (                                      # стартовый URL категории, с которого начинается обход
    "https://kazan.lemanapro.ru/"
    "?fromRegion=506"                               # ?fromRegion=506 -- фиксирует регион Казань (иначе редирект)
)
BASE_DOMAIN = "https://kazan.lemanapro.ru"          # домен, к которому будем приклеивать относительные ссылки
OUTPUT_FILE = "lemanapro_data.json"                 # имя выходного JSON-файла с собранными товарами
DELAY_TIME = 5                                      # пауза между запросами в секундах (бережём сайт и себя)
NEXT_DATA_TIMEOUT = 30                              # максимум сколько ждём появления тега __NEXT_DATA__
SEARCH_QUERY = (                                    # текст, который вводим в строку поиска
    "Кирпич рядовой керамический полнотелый M125 красный 250x120x65 мм 1 НФ"
)
SEARCH_TRIGGER_XPATH = "//span[normalize-space()='Поиск']"  # XPath по тексту (классы хешированы и меняются)


# =============================================================================
# Scraper -- загрузка страницы и извлечение __NEXT_DATA__
# =============================================================================


@dataclass                                          # автогенерация __init__ для полей ниже
class Scraper:
    url: str                                        # URL, который нужно открыть в браузере
    driver: uc.Chrome                               # переиспользуемый экземпляр undetected_chromedriver

    def __post_init__(self):
        """
        Открыть URL в браузере, дождаться появления <script id="__NEXT_DATA__">
        и распарсить его в self.next_data.
        """
        self.driver.get(self.url)                   # навигация браузера на целевой URL

        element_present = EC.presence_of_element_located(   # условие: элемент присутствует в DOM
            (By.CSS_SELECTOR, "script#__NEXT_DATA__")       # ищем тег <script id="__NEXT_DATA__">
        )
        WebDriverWait(self.driver, NEXT_DATA_TIMEOUT).until(element_present)  # ждём до 30 сек

        self.html = self.driver.page_source         # снимаем итоговый HTML после рендера JS
        self.soup = BeautifulSoup(self.html, "lxml")  # парсим HTML парсером lxml (быстрый)

        raw = self.soup.find("script", id="__NEXT_DATA__")  # достаём конкретный <script> с данными Next.js
        if raw is None or not raw.string:                   # если тега нет или он пустой -- блок/ошибка
            raise RuntimeError(f"Нет __NEXT_DATA__ на {self.url}")
        self.next_data: dict = json.loads(raw.string)       # парсим содержимое <script> как JSON

    @property                                       # доступ как к атрибуту: scraper.get_pagination_number
    def get_pagination_number(self) -> int:
        """
        Общее количество страниц в данной категории, рассчитанное из __NEXT_DATA__.
        Пробуем стандартные поля totalPages / pageCount, иначе total/perPage.
        """
        page_props = _safe_get(self.next_data, "props", "pageProps") or {}  # ныряем в props.pageProps

        path_candidates = [                         # список возможных путей до totalPages в JSON
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
        for path in path_candidates:                # пытаемся по каждому пути
            value = _safe_get(page_props, *path)    # безопасное чтение по цепочке ключей
            if isinstance(value, int) and value > 0:  # принимаем только положительные целые
                return value

        total = _deep_find_int(                     # фоллбэк: ищем общее число товаров где угодно в JSON
            page_props, ("total", "totalCount", "totalItems", "count")
        )
        per_page = (                                # ищем размер страницы; по умолчанию 30
            _deep_find_int(page_props, ("perPage", "pageSize", "limit", "size"))
            or 30
        )
        if total:                                   # если знаем total -- считаем кол-во страниц
            return math.ceil(total / per_page)
        return 1                                    # если ничего не нашли -- считаем что одна страница


# =============================================================================
# Catalog -- сбор ссылок на товары с index-страниц
# =============================================================================


@dataclass
class Catalog:
    """Класс подготовки ссылок продуктов выбранной категории."""

    index_catalog: List[str] = field(default_factory=list)  # список URL товаров (отдельный список на каждый Catalog)

    def index_catalog_builder(self, next_data: dict) -> None:
        """Выгрузка ссылок из списка товаров на index странице."""
        items = _extract_category_items(next_data)  # вытаскиваем массив товаров из __NEXT_DATA__
        for item in items:                          # обходим каждую карточку товара
            if not isinstance(item, dict):          # пропускаем, если структура неожиданная
                continue
            url = (                                 # пробуем разные имена поля со ссылкой
                item.get("url")
                or item.get("link")
                or item.get("href")
                or item.get("productUrl")
            )
            if not url:                             # если прямой ссылки нет -- собираем её из id
                pid = item.get("id") or item.get("productId") or item.get("article")
                if pid:
                    url = f"/product/{pid}/"        # стандартный шаблон карточки товара
            if not url:                             # ничего не нашли -- пропускаем
                continue
            if url.startswith("/"):                 # относительная ссылка -> добавляем домен
                url = f"{BASE_DOMAIN}{url}"
            self.index_catalog.append(url)          # копим итоговый URL в общий список

    @property
    def get_catalog(self) -> List[str]:
        return self.index_catalog                   # геттер для собранного списка ссылок


# =============================================================================
# JsonBuilder -- сборка структурированных данных продукта из __NEXT_DATA__
# =============================================================================


@dataclass
class JsonBuilder:
    """
    Класс обслуживания сбора и формирования пакета данных о продукте
    после отработки скрепера.
    """

    product_file: List[Dict] = field(default_factory=list)  # аккумулятор всех собранных товаров

    def collect_product_content(self, next_data: dict) -> None:
        """Сборщик словаря с данными продуктов."""
        page_props = _safe_get(next_data, "props", "pageProps") or {}  # точка входа в данные страницы
        product = (                                 # сам объект товара -- в одном из трёх возможных мест
            _safe_get(page_props, "product")
            or _safe_get(page_props, "data", "product")
            or _safe_get(page_props, "initialState", "product")
            or {}
        )
        if not product:                             # карточки нет -- выходим, ничего не добавляем
            return

        product_title = product.get("name") or product.get("title") or "-"  # название товара

        product_url = product.get("url") or "-"     # URL карточки (или дефис, если не нашли)
        if isinstance(product_url, str) and product_url.startswith("/"):
            product_url = f"{BASE_DOMAIN}{product_url}"  # относительный -> абсолютный

        product_description = (                     # описание из основного поля или из seo.description
            product.get("description")
            or _safe_get(product, "seo", "description")
            or "-"
        )

        product_price = self.price_selector(product)  # цена -- сложная логика, вынесена в метод

        brand = _safe_get(product, "brand", "name") or product.get("brand") or "-"  # бренд
        if isinstance(brand, dict):                 # иногда brand -- словарь, достаём из него .name
            brand = brand.get("name", "-")

        category_nodes = (                          # хлебные крошки / категории
            product.get("breadcrumbs") or product.get("categories") or []
        )
        category = [                                # превращаем узлы в плоский список названий
            (n.get("name") if isinstance(n, dict) else str(n))
            for n in category_nodes
            if n
        ]

        specifications = self.load_specifications(product)  # характеристики (ключ -> значение)
        images = self.load_images(product)          # список URL картинок

        data = {                                    # итоговая нормализованная запись о товаре
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

        self.product_file.append(data)              # добавляем товар в общий список

    def price_selector(self, product: dict) -> Optional[float]:
        """На сайте может публиковаться одна из нескольких цен."""
        candidates = [                              # перебираем все возможные пути к цене
            _safe_get(product, "price", "current"),
            _safe_get(product, "price", "value"),
            _safe_get(product, "price", "best"),
            _safe_get(product, "price"),
            product.get("currentPrice"),
            product.get("bestPrice"),
        ]
        for value in candidates:
            if isinstance(value, dict):             # вложенный словарь без числа -- пропуск
                continue
            result = _to_float(value)               # пытаемся привести строку/число к float
            if result is not None:
                return result                       # возвращаем первое успешно распарсенное значение
        return None                                 # цены нет -> None

    def load_specifications(self, product: dict) -> Dict[str, Any]:
        """Блок выгрузки спецификаций продукта."""
        raw = product.get("characteristics") or product.get("attributes") or []  # массив групп характеристик
        return _flatten_characteristics(raw)        # разворачиваем во flat dict

    def load_images(self, product: dict) -> List[str]:
        """Блок выгрузки картинок."""
        raw = product.get("images") or product.get("gallery") or []  # список изображений
        out: List[str] = []                         # итоговый список URL-ов
        if isinstance(raw, list):
            for img in raw:
                if isinstance(img, dict):           # формат {"url": "...", "src": "..."}
                    url = img.get("url") or img.get("src")
                    if url:
                        out.append(url)
                elif isinstance(img, str):          # либо просто строка URL
                    out.append(img)
        single = product.get("image")               # поле image -- одиночная превью-картинка
        if isinstance(single, dict):
            url = single.get("url")
            if url:
                out.append(url)
        elif isinstance(single, str):
            out.append(single)
        return out                                  # возвращаем все собранные URL


# =============================================================================
# Driver pipeline -- последовательная сборка каталога и продуктов
# =============================================================================


def initial_object_collection(source_url, driver):
    """
    Сбор данных о количестве страниц и сохранение объекта первой страницы в
    пулл последующего скреппинга.
    """
    start_page = Scraper(source_url, driver)        # грузим первую (нулевую) страницу категории
    total_pages = start_page.get_pagination_number  # узнаём общее кол-во страниц пагинации
    index_catalog = [start_page]                    # сразу кладём первую страницу в общий список
    return total_pages, index_catalog               # отдаём наружу: число страниц и стартовый объект


def urls_pull_object_collection(
    total_pages, delay_time, source_url, index_catalog, scraper_class, driver
):
    """Создаём массив из объектов с данными индекса страниц."""
    for pagination in range(2, total_pages + 1):    # стартуем с 2-й, т.к. 1-ю уже взяли
        time.sleep(delay_time)                      # пауза между запросами
        sep = "&" if "?" in source_url else "?"     # корректно приклеиваем ?page=N или &page=N
        url = f"{source_url}{sep}page={pagination}"  # URL конкретной страницы пагинации
        index_catalog.append(scraper_class(url, driver))  # грузим страницу и сохраняем объект Scraper
    return index_catalog                            # массив объектов всех index-страниц


def urls_pull_list_collection(index_catalog, catalog):
    """Создаём каталог с перечнем ссылок продуктов."""
    for page in index_catalog:                      # обходим каждую загруженную index-страницу
        catalog.index_catalog_builder(page.next_data)  # достаём из неё ссылки на товары


def pages_pull_objects_collection(catalog, delay_time, scraper_class, driver):
    """Создаём массив объектов с данными продуктов."""
    list_to_scrape = []                             # сюда складываем Scraper'ов для карточек товаров
    total_products = len(catalog.index_catalog)     # общее число товаров (для прогресса)
    counter = 0                                     # счётчик обработанных товаров

    for url in catalog.index_catalog:               # обходим все собранные ссылки на товары
        time.sleep(delay_time)                      # пауза между загрузкой карточек
        try:
            list_to_scrape.append(scraper_class(url, driver))  # грузим карточку товара
        except Exception as exc:                    # ловим любую ошибку -- продолжаем со следующего товара
            print(f"\nSkip {url}: {exc}")
        counter += 1
        print(                                      # печатаем прогресс "Processing X of Y" в одну строку
            f"\rProcessing {counter} of {total_products}", end="", flush=True
        )

    print()                                         # перевод строки после прогресс-бара
    return list_to_scrape                           # отдаём массив загруженных карточек


def product_data_builder(json_builder, list_to_scrape):
    """Собираем данные о продуктах в словарь."""
    for page in list_to_scrape:                     # каждую загруженную карточку
        json_builder.collect_product_content(page.next_data)  # парсим и добавляем в product_file


def json_generator(json_builder):
    """Создаём JSON фаил на основе данных словаря."""
    with open(OUTPUT_FILE, "w", encoding="utf-8") as outfile:  # открываем файл на запись в UTF-8
        json.dump(
            json_builder.product_file, outfile, indent=4, ensure_ascii=False  # читаемый JSON с кириллицей
        )


def dismiss_overlays(driver, wait_seconds: int = 10) -> None:
    """
    Закрыть всплывающие баннеры: подтверждение региона ("Всё верно")
    и куки-баннер ("Хорошо"). Структура кнопок (из инспектора):
        <button data-testid="button" [data-qa="apply-region-button"]>
            <span>Текст</span>
        </button>
    Модалки появляются с задержкой ~3-5 сек после загрузки, поэтому ждём.
    """
    overlays = [                                    # (тип, селектор, имя)
        ("css", '[data-qa="apply-region-button"]', "регион (data-qa)"),
        ("xpath", "//button[.//span[normalize-space()='Всё верно']]", "регион (по тексту)"),
        ("xpath", "//button[.//span[normalize-space()='Хорошо']]", "куки"),
    ]

    # Ждём появления любой из кнопок (опционально: за wait_seconds их может и не быть -- идём дальше)
    end_time = time.time() + wait_seconds
    while time.time() < end_time:
        for _, sel, _ in overlays:
            by = By.CSS_SELECTOR if not sel.startswith("//") else By.XPATH
            if driver.find_elements(by, sel):       # хотя бы одна появилась -- выходим из ожидания
                break
        else:
            time.sleep(0.5)
            continue
        break

    # Теперь пытаемся закрыть каждую известную кнопку
    for kind, sel, name in overlays:
        by = By.CSS_SELECTOR if kind == "css" else By.XPATH
        for el in driver.find_elements(by, sel):
            try:
                if not el.is_displayed():
                    continue
                try:
                    el.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", el)
                print(f"Закрыли оверлей: {name}")
                time.sleep(0.5)                     # даём DOM перерисоваться
                break
            except Exception:
                continue


def perform_search(driver, query: str = SEARCH_QUERY) -> None:
    """
    Найти строку/кнопку поиска и ввести запрос через send_keys.

    UI на главной может быть реализован тремя способами:
      1) Видимый <input placeholder="Поиск"> прямо в шапке -- печатаем сразу в него.
      2) Кнопка/иконка с текстом "Поиск" -- кликаем, ждём появления input,
         печатаем в active_element.
      3) <span>Поиск</span> поверх скрытой кнопки -- кликаем по предку-button.
    Перебираем кандидатов в этом порядке.
    """
    # Сначала ждём, пока в DOM хоть что-то с текстом/placeholder "Поиск" появится
    WebDriverWait(driver, 20).until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                "//*[contains(@placeholder, 'Поиск')"
                " or contains(@aria-label, 'Поиск')"
                " or contains(normalize-space(.), 'Поиск')]",
            )
        )
    )

    candidate_xpaths = [                            # порядок важен: от самого надёжного к запасному
        "//input[contains(@placeholder, 'Поиск')]",                          # видимый инпут с placeholder
        "//input[contains(@aria-label, 'Поиск') or contains(@aria-label, 'Искать')]",
        "//header//button[.//span[contains(normalize-space(.), 'Поиск')]]",  # button в шапке с 'Поиск'
        "//*[@role='button'][.//span[contains(normalize-space(.), 'Поиск')]]",
        "//span[contains(normalize-space(.), 'Поиск')]/ancestor::button[1]",
        "//span[contains(normalize-space(.), 'Поиск')]/ancestor::*[@role='button'][1]",
        "//header//span[contains(normalize-space(.), 'Поиск')]",             # сам span как последний шанс
    ]

    trigger = None                                  # первый ВИДИМЫЙ элемент, который подойдёт
    used_xpath = None                               # для диагностики
    for xp in candidate_xpaths:
        for el in driver.find_elements(By.XPATH, xp):
            try:
                if el.is_displayed():
                    trigger, used_xpath = el, xp
                    break
            except Exception:
                continue
        if trigger is not None:
            break

    if trigger is None:                             # ничего не нашли -- печатаем диагностику и падаем
        candidates = driver.find_elements(
            By.XPATH, "//*[contains(@placeholder,'Поиск') or normalize-space()='Поиск']"
        )
        print(f"DIAG: 'Поиск'-элементов в DOM: {len(candidates)}")
        for el in candidates[:5]:
            try:
                print(
                    f"  tag={el.tag_name} visible={el.is_displayed()}"
                    f" placeholder={el.get_attribute('placeholder')!r}"
                    f" text={el.text!r}"
                )
            except Exception as exc:
                print(f"  ошибка чтения элемента: {exc}")
        raise RuntimeError("Триггер поиска не найден -- см. DIAG выше")

    print(f"Найден триггер поиска по XPath: {used_xpath}")

    # Случай 1: триггер -- это input. Кликаем для фокуса и сразу печатаем.
    if trigger.tag_name.lower() == "input":
        try:
            trigger.click()
        except Exception:
            driver.execute_script("arguments[0].click();", trigger)
        trigger.send_keys(query)
        trigger.send_keys(Keys.RETURN)
        return

    # Случай 2/3: триггер -- кнопка. Кликаем, ждём появления input в фокусе.
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


def main():
    """Основной драйвер проекта: главная → поиск → собрать товары из выдачи."""

    delay_time: int = DELAY_TIME                    # копия константы паузы (на случай переопределения)
    driver = uc.Chrome()                            # запускаем браузер с патчами anti-detection

    driver.set_window_size(1280, 900)               # фиксируем размер окна (важно для рендера и анти-бота)

    try:
        # --- Шаг 0: открываем ГЛАВНУЮ напрямую, без Scraper. ---
        # На главной нет <script id="__NEXT_DATA__"> -- Scraper тут падает.
        # Главная нужна только чтобы был DOM с кнопкой "Поиск".
        driver.get(BASE_DOMAIN + "/?fromRegion=506")

        # --- Шаг 0.5: гасим оверлеи (куки + подтверждение региона). ---
        # Без этого Next.js блокирует pointer-events на body и клик по поиску не доходит.
        # dismiss_overlays сам ждёт появления модалок до 10 сек.
        dismiss_overlays(driver)
        time.sleep(1)                               # даём pointer-events вернуться на body

        # --- Шаг 1: клик по "Поиск" + ввод запроса + Enter. ---
        starting_url = driver.current_url           # запоминаем URL до клика, чтобы поймать редирект
        perform_search(driver, SEARCH_QUERY)        # клик по кнопке поиска + send_keys + Enter

        # --- Шаг 2: ждём, пока браузер уедет на страницу выдачи. ---
        WebDriverWait(driver, 20).until(
            lambda d: d.current_url != starting_url
        )
        search_url = driver.current_url             # URL страницы выдачи -- его и используем как source_url
        print(f"Search URL: {search_url}")          # для диагностики

        # --- Шаг 3: стандартный пайплайн каталога, но source_url = страница выдачи. ---
        # Scraper(search_url, driver) сделает driver.get(search_url) -- перезагрузка
        # на ту же выдачу, и распарсит __NEXT_DATA__, который на странице выдачи уже есть.
        total_pages, index_catalog = initial_object_collection(
            search_url, driver
        )
        print(f"Total pages: {total_pages}")

        full_catalog = urls_pull_object_collection(
            total_pages, delay_time, search_url, index_catalog, Scraper, driver
        )

        catalog = Catalog()                         # пустой контейнер для ссылок на товары
        urls_pull_list_collection(full_catalog, catalog)  # собираем ссылки на все товары
        print(f"Total product URLs: {len(catalog.index_catalog)}")

        list_to_scrape = pages_pull_objects_collection(  # грузим карточку каждого товара
            catalog, delay_time, Scraper, driver
        )

        json_builder = JsonBuilder()                # пустой контейнер для нормализованных данных
        product_data_builder(json_builder, list_to_scrape)  # парсим JSON каждой карточки

        json_generator(json_builder)                # сохраняем итог в файл

        print(f"\rДанные сохранены в {OUTPUT_FILE}")
    except Exception as exc:                       # при ошибке -- не закрываем окно сразу, чтобы можно было инспектировать
        print(f"\n!!! Ошибка: {type(exc).__name__}: {exc}")
        print("Окно браузера оставлено открытым. Нажми Enter в консоли чтобы закрыть.")
        try:
            input()
        except EOFError:                            # если запустили не из терминала -- просто закрываем
            pass
        raise
    finally:
        try:
            driver.quit()                           # только quit -- driver.close() + quit() даёт WinError 6 на Windows
        except Exception:
            pass


# =============================================================================
# Хелперы
# =============================================================================


def _safe_get(obj: Any, *path: str) -> Any:
    cur = obj                                       # стартуем с корневого объекта
    for key in path:                                # идём по цепочке ключей
        if isinstance(cur, dict):
            cur = cur.get(key)                      # шаг вглубь словаря
        else:
            return None                             # на пути встретили не-словарь -- путь оборван
        if cur is None:
            return None                             # ключ отсутствует -- выходим
    return cur                                      # успешно дошли до конца пути


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None                                 # None -> None (валидный "цены нет")
    if isinstance(value, (int, float)):
        return float(value)                         # уже число -- просто приводим к float
    if isinstance(value, str):
        cleaned = value.replace("\xa0", "").replace(" ", "").replace(",", ".")  # "1 234,50" -> "1234.50"
        try:
            return float(cleaned)                   # пробуем распарсить
        except ValueError:
            return None                             # не получилось -- значит не число
    return None                                     # другие типы -- считаем что нет цены


def _flatten_characteristics(raw: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {}                        # плоский результат: {название: значение}
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items()}  # уже dict -- просто приводим ключи к строкам
    if not isinstance(raw, list):
        return out                                  # неожиданный формат -- пустой dict
    for group in raw:                               # обходим группы характеристик
        if not isinstance(group, dict):
            continue
        if "name" in group and "value" in group:    # формат "плоская пара" {name, value}
            out[str(group["name"])] = group["value"]
            continue
        props = group.get("properties") or group.get("attributes") or []  # формат "группа со списком свойств"
        for p in props:
            if isinstance(p, dict) and "name" in p:
                out[str(p["name"])] = p.get("value")  # добавляем каждую характеристику в плоский dict
    return out


def _extract_category_items(next_data: dict) -> List[dict]:
    """Список товаров категории из __NEXT_DATA__ с фоллбэком на deep-scan."""
    page_props = _safe_get(next_data, "props", "pageProps") or {}  # точка входа в JSON Next.js
    path_candidates = [                             # возможные места, где Lemana хранит массив товаров
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
        value = _safe_get(page_props, *path)        # пробуем каждый путь по очереди
        if isinstance(value, list) and value:       # нашли непустой список -- возвращаем
            return value
    return _deep_find_products(page_props) or []    # фоллбэк: рекурсивный поиск товаров


def _deep_find_products(obj: Any) -> Optional[List[dict]]:
    """Ищем первый список словарей, похожих на карточки товаров."""
    if isinstance(obj, list) and obj and isinstance(obj[0], dict):  # это непустой список dict'ов?
        keys = set(obj[0].keys())                                   # смотрим ключи первого элемента
        if keys & {"id", "productId", "article"} and keys & {"name", "title"}:  # есть id + название -> товары
            return obj
    if isinstance(obj, dict):
        for v in obj.values():                      # рекурсивно ныряем в каждое значение словаря
            found = _deep_find_products(v)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:                            # рекурсивно ныряем в каждый элемент списка
            found = _deep_find_products(item)
            if found:
                return found
    return None                                     # ничего похожего не нашли


def _deep_find_int(obj: Any, keys: tuple) -> Optional[int]:
    """Глубокий поиск целочисленного значения по любому из ключей."""
    if isinstance(obj, dict):
        for k in keys:
            v = obj.get(k)
            if isinstance(v, int):                  # нашли int по нужному ключу -- возвращаем
                return v
        for v in obj.values():                      # иначе рекурсивно идём по значениям
            found = _deep_find_int(v, keys)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:                            # рекурсивно по элементам списка
            found = _deep_find_int(item, keys)
            if found is not None:
                return found
    return None                                     # не нашли -- None


if __name__ == "__main__":                          # запуск только как скрипт, не при импорте
    main()                                          # точка входа
