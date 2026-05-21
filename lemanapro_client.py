"""
Парсер Lemana Pro: главная -> поиск -> карточки -> CSV.

Архитектура (по результатам анализа реальных HTML-дампов Леманы):
    * Браузер     -- undetected_chromedriver, потому что lemanapro закрыт Qrator'ом
                     и голый requests получает 401 + 265-байт JS-челлендж.
    * UI flow     -- открыть главную, закрыть оверлеи (регион/куки),
                     ввести запрос в поиск, дождаться редиректа на /search/...
    * Парсинг     -- selectolax по driver.page_source.
                     Главный источник полей -- JSON-LD блоки
                     (<script type="application/ld+json"> с @type=Product и @type=BreadcrumbList).
                     Характеристики -- DOM: [data-qa="characteristics-list-item"].
                     Список товаров на выдаче -- [data-qa="product"] + a[href*="/product/"].
    * Вывод       -- CSV с фиксированным набором колонок; характеристики пакуются
                     в одну ячейку characteristics_json.

Установка:
    py -m pip install undetected-chromedriver selenium selectolax

Запуск:
    cd /d/kub && py lemanapro_client.py
"""

import csv                                          # стандартный csv-модуль для записи итогового файла
import json                                         # разбор JSON-LD блоков
import time                                         # паузы между UI-шагами
from dataclasses import dataclass                   # @dataclass для Scraper-like структур, если понадобятся

import undetected_chromedriver as uc                # Chrome с патчами anti-bot (проходит Qrator)
from selectolax.parser import HTMLParser            # быстрый CSS-селекторный парсер HTML
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# =============================================================================
# КОНСТАНТЫ
# =============================================================================

BASE_DOMAIN = "https://kazan.lemanapro.ru"          # домен для абсолютных URL
SEARCH_QUERY = (
    "Кирпич рядовой керамический полнотелый M125 красный 250x120x65 мм 1 НФ"
)
OUTPUT_CSV = "lemanapro_data.csv"                   # имя итогового CSV
CSV_FIELDS = [                                      # ключи в dict от parse_product -- порядок колонок в CSV
    "name",
    "price",
    "url",
]
CSV_HEADERS = {                                     # как эти ключи показывать в первой строке CSV (отображаемые названия)
    "name": "Материалы",
    "price": "price",
    "url": "url",
}


# =============================================================================
# UI helpers -- закрытие оверлеев и работа со строкой поиска
# =============================================================================


def dismiss_overlays(driver, wait_seconds: int = 10) -> None:
    """
    Закрыть всплывающие баннеры: подтверждение региона ("Всё верно")
    и куки-баннер ("Хорошо"). Кук появляется ПОСЛЕ закрытия региона,
    поэтому крутимся в цикле и после каждого клика ждём, не появится ли
    следующий оверлей. Выход: либо вышло wait_seconds, либо три пустых
    итерации подряд (т.е. больше ничего видимого не появляется).
    """
    overlays = [                                    # (тип, селектор, имя)
        ("css", '[data-qa="apply-region-button"]', "регион (data-qa)"),
        ("xpath", "//button[.//span[normalize-space()='Всё верно']]", "регион (по тексту)"),
        ("xpath", "//button[.//span[normalize-space()='Хорошо']]", "куки"),
    ]

    end_time = time.time() + wait_seconds
    idle_rounds = 0                                 # счётчик пустых итераций подряд

    while time.time() < end_time:
        clicked_now = False
        for kind, sel, name in overlays:
            by = By.CSS_SELECTOR if kind == "css" else By.XPATH
            for el in driver.find_elements(by, sel):
                try:
                    if not el.is_displayed():
                        continue
                    # JS-click первичным -- надёжнее, когда кнопку перекрывает
                    # другой модал или Next.js блокирует pointer-events на body
                    try:
                        driver.execute_script("arguments[0].click();", el)
                    except Exception:
                        el.click()
                    print(f"Закрыли оверлей: {name}")
                    clicked_now = True
                    time.sleep(0.5)                 # даём DOM перерисоваться и появиться следующему
                    break
                except Exception:
                    continue

        if clicked_now:
            idle_rounds = 0                         # сброс: после клика ждём ещё, вдруг придёт куки
        else:
            idle_rounds += 1
            if idle_rounds >= 3:                    # ~0.75 сек тишины -- выходим, больше ничего не появится
                break
            time.sleep(0.25)


def perform_search(driver, query: str = SEARCH_QUERY) -> None:
    """
    Найти строку/кнопку поиска и ввести запрос через send_keys.
    Кандидатов перебираем от самого надёжного (видимый input) к запасному (span).
    """
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
    used_xpath = None
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

    if trigger is None:
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
        lambda d: d.switch_to.active_element.tag_name.lower() == "input"
    )
    search_input = driver.switch_to.active_element
    search_input.send_keys(query)
    search_input.send_keys(Keys.RETURN)


# =============================================================================
# Парсинг -- selectolax по driver.page_source
# =============================================================================


def _load_json_ld(tree: HTMLParser) -> tuple[dict, dict]:
    """
    Вернуть (product_ld, breadcrumbs_ld). Если блока нет -- пустой dict.
    Леманa отдаёт два блока: @type=Product (поля товара) и @type=BreadcrumbList (категории).
    """
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


def _category_from_breadcrumbs(breadcrumbs_ld: dict) -> str:
    """Собрать категорию вида "Стройматериалы > Кирпич" из BreadcrumbList."""
    names = []
    for item in breadcrumbs_ld.get("itemListElement") or []:
        nm = ((item.get("item") or {}).get("name") or "").replace("⭐", "").strip()
        if nm:
            names.append(nm)
    return " > ".join(names)


def _characteristics_from_dom(tree: HTMLParser) -> dict:
    """
    Достать характеристики из карточки.
    Структура каждого item:
        <div data-qa="characteristics-list-item">
            <div>{название}</div>
            <div>{значение}</div>
        </div>
    """
    out: dict = {}
    for item in tree.css('[data-qa="characteristics-list-item"]'):
        # .css('div') в selectolax возвращает сам item + всех потомков -- берём только прямых детей
        children = [c for c in item.iter() if c.tag == "div"]
        if len(children) >= 2:
            key = (children[0].text() or "").strip()
            val = (children[1].text() or "").strip()
            if key:
                out[key] = val
    return out


def parse_product(html: str) -> dict:
    """
    Извлечь поля товара из HTML страницы карточки.
    Основной источник -- JSON-LD блоки (надёжнее DOM), характеристики -- DOM.
    """
    tree = HTMLParser(html)
    product_ld, breadcrumbs_ld = _load_json_ld(tree)

    offers = product_ld.get("offers") or {}
    if isinstance(offers, list):                    # на всякий случай: иногда offers -- массив
        offers = offers[0] if offers else {}
    rating = product_ld.get("aggregateRating") or {}

    images = product_ld.get("image") or []
    if isinstance(images, str):
        images = [images]

    availability = offers.get("availability") or ""
    if isinstance(availability, str) and "/" in availability:
        availability = availability.rsplit("/", 1)[-1]  # "https://schema.org/InStock" -> "InStock"

    chars = _characteristics_from_dom(tree)

    return {
        "url": offers.get("url") or "",
        "sku": product_ld.get("sku") or "",
        "name": product_ld.get("name") or "",
        "category": _category_from_breadcrumbs(breadcrumbs_ld),
        "price": offers.get("price"),
        "currency": offers.get("priceCurrency") or "",
        "availability": availability,
        "rating": rating.get("ratingValue"),
        "review_count": rating.get("reviewCount"),
        "image": images[0] if images else "",
        "description": product_ld.get("description") or "",
        "characteristics_json": json.dumps(chars, ensure_ascii=False),
    }


def parse_search(html: str) -> list[str]:
    """Вернуть абсолютные URL карточек товаров со страницы выдачи."""
    tree = HTMLParser(html)
    urls: list[str] = []
    seen: set[str] = set()
    for card in tree.css('[data-qa="product"]'):
        for a in card.css('a[href*="/product/"]'):
            href = (a.attributes.get("href") or "").split("#", 1)[0]  # отрезаем якорь типа /...#reviews
            if not href:
                continue
            if href.startswith("/"):
                href = BASE_DOMAIN + href
            if href in seen:
                continue
            seen.add(href)
            urls.append(href)
            break                                   # одна карточка -- одна ссылка
    return urls


def write_csv(rows: list[dict], path: str) -> None:
    """
    Записать строки в CSV.
    * encoding="utf-8-sig" -- Excel на Windows читает кириллицу без кракозябр.
    * delimiter=";"        -- русский Excel ждёт ; как разделитель полей (запятая = десятичный знак).
                              С обычной запятой строки слипаются в одну колонку A.
    """
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow([CSV_HEADERS[k] for k in CSV_FIELDS])  # заголовок с русскими именами
        for row in rows:
            writer.writerow([row.get(k, "") for k in CSV_FIELDS])
    print(f"CSV: {path} ({len(rows)} строк)")


# =============================================================================
# main
# =============================================================================


def main():
    driver = uc.Chrome(version_main=148)            # пиним под установленный Chrome 148
    driver.set_window_size(1280, 900)

    try:
        driver.get(BASE_DOMAIN + "/?fromRegion=506")  # главная (без __NEXT_DATA__)

        dismiss_overlays(driver)

        starting_url = driver.current_url
        perform_search(driver, SEARCH_QUERY)
        WebDriverWait(driver, 20).until(            # ждём редирект на /search/
            lambda d: d.current_url != starting_url
        )
        search_url = driver.current_url
        print(f"Search URL: {search_url}")

        product_urls = parse_search(driver.page_source)
        print(f"Найдено товаров в выдаче: {len(product_urls)}")
        if not product_urls:
            print("Пусто. Возможно, выдача рендерится позже или селектор изменился.")
            return

        rows: list[dict] = []
        for i, url in enumerate(product_urls, 1):
            print(f"[{i}/{len(product_urls)}] {url}")
            try:
                driver.get(url)
                row = parse_product(driver.page_source)
                rows.append(row)
            except Exception as exc:
                print(f"  skip: {type(exc).__name__}: {exc}")

        write_csv(rows, OUTPUT_CSV)
    except Exception as exc:
        print(f"\n!!! Ошибка: {type(exc).__name__}: {exc}")
        print("Окно браузера оставлено открытым. Нажми Enter в консоли чтобы закрыть.")
        try:
            input()
        except EOFError:
            pass
        raise
    finally:
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
