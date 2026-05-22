#!/usr/bin/env python3
"""CLI парсинга цен Lemana Pro (бывш. Леруа Мерлен).

Переиспользует LemanaSession (обход Qrator через undetected_chromedriver +
разбор JSON-LD), поэтому отдельной логики парсинга тут нет — только сбор
аргументов, прогон запросов/URL-ов и вывод.

Примеры:
    # поиск по запросам, вывод таблицей
    python lemana_cli.py "ламинат" "плинтус"

    # конкретные товары по URL, вывод JSON в файл
    python lemana_cli.py --json out.json https://kazan.lemanapro.ru/product/...

    # другой город, по 10 товаров на запрос, CSV в stdout
    python lemana_cli.py --city moscow --limit 10 --csv "краска"

Запуск из каталога backend/ (рядом с lemana_session.py) или установите
backend в PYTHONPATH.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import sys
from typing import Optional

# Известные города дублируем здесь, чтобы --help и аргументы работали без
# установленного браузера. Сам LemanaSession (тянет undetected_chromedriver)
# импортируется лениво в collect().
KNOWN_CITIES = ("moscow", "spb", "kazan")


def _fmt_price(p: Optional[float]) -> str:
    if p is None:
        return "—"
    # 1234.0 -> "1 234", 1234.5 -> "1 234,5"
    s = f"{p:,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
    return s


def collect(
    queries: list[str],
    urls: list[str],
    city: str,
    limit: int,
    headless: bool,
    chrome_version: Optional[int],
    proxy: Optional[str] = None,
) -> list[dict]:
    """Один прогон Chrome на все запросы и URL-ы."""
    from lemana_session import LemanaSession  # deferred: тянет браузер

    rows: list[dict] = []
    with LemanaSession(city=city, headless=headless,
                       chrome_version=chrome_version, proxy=proxy) as s:
        for q in queries:
            try:
                rows.extend(s.search(q, limit=limit))
            except Exception as e:  # один запрос не должен ронять весь прогон
                logging.error("запрос %r упал: %s", q, e)
        for url in urls:
            try:
                rows.append(s._parse_product_page(url))
            except Exception as e:
                logging.error("URL %s упал: %s", url, e)
    return rows


def render_table(rows: list[dict]) -> str:
    if not rows:
        return "Ничего не найдено."
    out: list[str] = []
    for r in rows:
        price = _fmt_price(r.get("price"))
        cur = r.get("currency") or ""
        avail = r.get("availability") or ""
        line = f"{price} {cur}".strip()
        if avail:
            line += f"  [{avail}]"
        out.append(f"{r.get('name', '')}")
        out.append(f"    {line}")
        if r.get("sku"):
            out.append(f"    арт. {r['sku']}")
        if r.get("url"):
            out.append(f"    {r['url']}")
        out.append("")
    return "\n".join(out).rstrip()


def render_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "price", "currency", "availability", "sku", "url"])
    for r in rows:
        w.writerow([
            r.get("name", ""),
            "" if r.get("price") is None else r["price"],
            r.get("currency", ""),
            r.get("availability") or "",
            r.get("sku") or "",
            r.get("url") or "",
        ])
    return buf.getvalue()


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="Парсинг цен с *.lemanapro.ru",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "terms", nargs="+",
        help="Поисковые запросы и/или URL товаров (URL определяется по http).",
    )
    p.add_argument(
        "--city", default="kazan",
        help=f"Город/регион. Известные: {', '.join(KNOWN_CITIES)} (по умолч. kazan).",
    )
    p.add_argument(
        "--limit", type=int, default=5,
        help="Сколько товаров брать на один поисковый запрос (по умолч. 5).",
    )
    p.add_argument(
        "--chrome-version", type=int, default=None,
        help="Мажорная версия Chrome для драйвера (если автоопределение мажет).",
    )
    p.add_argument(
        "--no-headless", action="store_true",
        help="Запустить браузер с окном (иногда помогает против Qrator).",
    )
    p.add_argument(
        "--proxy", default=None, metavar="URL",
        help="Прокси, напр. http://host:port или socks5://host:port "
             "(или env LEMANA_PROXY). Без user:pass.",
    )
    out = p.add_mutually_exclusive_group()
    out.add_argument("--json", metavar="FILE", nargs="?", const="-",
                     help="Вывести JSON (в FILE или stdout при отсутствии аргумента).")
    out.add_argument("--csv", action="store_true", help="Вывести CSV в stdout.")
    p.add_argument("-v", "--verbose", action="store_true", help="Подробный лог.")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(message)s",
    )

    queries = [t for t in args.terms if not t.lower().startswith("http")]
    urls = [t for t in args.terms if t.lower().startswith("http")]

    rows = collect(
        queries=queries,
        urls=urls,
        city=args.city,
        limit=args.limit,
        headless=not args.no_headless,
        chrome_version=args.chrome_version,
        proxy=args.proxy,
    )

    if args.json is not None:
        payload = json.dumps(rows, ensure_ascii=False, indent=2)
        if args.json == "-":
            print(payload)
        else:
            with open(args.json, "w", encoding="utf-8") as f:
                f.write(payload)
            print(f"Записано {len(rows)} товаров в {args.json}", file=sys.stderr)
    elif args.csv:
        sys.stdout.write(render_csv(rows))
    else:
        print(render_table(rows))

    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
