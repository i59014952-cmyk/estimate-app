#!/usr/bin/env python3
"""CLI поверх LemanaSession: поиск товаров на lemanapro.ru из терминала.

Браузер по умолчанию запускается скрыто (headless). Примеры:

    python3 lemana_cli.py "ламинат"
    python3 lemana_cli.py --city moscow --limit 10 "ламинат" "плитка"
    python3 lemana_cli.py --no-headless "ламинат"        # показать окно Chrome
    python3 lemana_cli.py --chrome-version 131 "ламинат" # при несовпадении версии
    python3 lemana_cli.py --json out.json --csv out.csv "ламинат"

Требуется установленный Google Chrome (undetected_chromedriver подбирает драйвер
под его версию).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys

from lemana_session import CITY_TO_REGION, LemanaSession


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="lemana_cli.py",
        description="Поиск товаров на lemanapro.ru (название, цена, артикул, ссылка).",
    )
    p.add_argument("queries", nargs="+", help="Один или несколько поисковых запросов.")
    p.add_argument(
        "--city", default="kazan",
        help=f"Город-slug. Известные: {', '.join(sorted(CITY_TO_REGION))} (default: kazan).",
    )
    p.add_argument("--limit", type=int, default=5,
                   help="Сколько товаров на запрос (default: 5).")
    p.add_argument("--no-headless", dest="headless", action="store_false",
                   help="Показать окно Chrome (по умолчанию скрыто).")
    p.add_argument("--chrome-version", type=int, default=None,
                   help="Мажорная версия Chrome, если драйвер не совпал.")
    p.add_argument("--json", metavar="FILE", help="Сохранить результат в JSON-файл.")
    p.add_argument("--csv", metavar="FILE", help="Сохранить плоский список товаров в CSV.")
    return p


def _print_human(query: str, products: list[dict]) -> None:
    print(f"\n=== {query} — найдено {len(products)} ===")
    for i, prod in enumerate(products, 1):
        price = prod.get("price")
        currency = prod.get("currency") or "RUB"
        price_str = f"{price:g} {currency}" if price is not None else "цена не указана"
        print(f"{i}. {prod.get('name') or '(без названия)'}")
        print(f"   {price_str}  |  арт. {prod.get('sku') or '-'}")
        if prod.get("url"):
            print(f"   {prod['url']}")


def _write_csv(path: str, results: list[dict]) -> None:
    fields = ["query", "name", "price", "currency", "sku", "availability", "url"]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for entry in results:
            for prod in entry["products"]:
                writer.writerow({"query": entry["query"], **prod})


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    results: list[dict] = []
    exit_code = 0
    with LemanaSession(
        city=args.city,
        headless=args.headless,
        chrome_version=args.chrome_version,
    ) as session:
        for query in args.queries:
            try:
                products = session.search(query, limit=args.limit)
                results.append({"query": query, "ok": True, "products": products})
            except Exception as e:  # одна ошибка не должна валить остальные запросы
                exit_code = 1
                results.append({"query": query, "ok": False, "error": str(e),
                                "products": []})
                print(f"[!] Ошибка по запросу '{query}': {e}", file=sys.stderr)

    for entry in results:
        if entry["ok"]:
            _print_human(entry["query"], entry["products"])

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\nJSON сохранён: {args.json}")
    if args.csv:
        _write_csv(args.csv, results)
        print(f"CSV сохранён: {args.csv}")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
