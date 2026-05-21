import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import lemana_source as ls

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return f.read()


def test_parse_product_real_jsonld():
    row = ls.parse_product(_read("product_82628666.html"))
    assert row["sku"] == "82628666"
    assert row["name"].startswith("Кирпич рядовой керамический")
    assert row["price"] == 22.0
    assert row["currency"] == "RUB"
    assert row["in_stock"] is True
    assert row["availability"] == "InStock"
    assert row["url"].endswith("82628666/")
    assert row["category"] == "Стройматериалы > Блоки для строительства > Кирпич"
    assert row["review_count"] == 100


def test_characteristics_from_jsonld():
    row = ls.parse_product(_read("product_82628666.html"))
    chars = row["characteristics"]
    assert chars["Марка прочности (российский стандарт)"] == "M125"
    assert chars["Цвет"] == "Красный"
    assert chars["Количество на 1 м³ (шт.)"] == "400"
    assert chars["Страна производства"] == "Россия"


def test_parse_product_no_jsonld_returns_empty():
    assert ls.parse_product("<html><body>no ld</body></html>") == {}


def test_to_float_variants():
    assert ls._to_float(22) == 22.0
    assert ls._to_float("1 250,50") == 1250.50
    assert ls._to_float("22 ₽/шт.") == 22.0
    assert ls._to_float(None) is None
    assert ls._to_float("—") is None


def test_parse_search_dedup_and_absolute():
    urls = ls.parse_search(_read("search_kirpich.html"))
    assert len(urls) == 3
    assert all(u.startswith("https://kazan.lemanapro.ru/product/") for u in urls)
    # anchor (#reviews) must collapse to the same product, not duplicate
    assert urls[0].endswith("82628666/")
    assert "#" not in urls[0]
    assert len(set(urls)) == len(urls)


def test_mock_session_search():
    os.environ["LEMANA_MOCK"] = "1"
    os.environ["LEMANA_MOCK_DIR"] = FIX
    sess = ls.LemanaSession()
    rows = asyncio.run(sess.search("кирпич", limit=5))
    assert len(rows) >= 1
    assert rows[0]["price"] == 22.0
    del os.environ["LEMANA_MOCK"]
    del os.environ["LEMANA_MOCK_DIR"]
