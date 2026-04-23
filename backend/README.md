# Petrovich price parser

Бэкенд на FastAPI + Playwright, парсит цены с **petrovich.ru** и отдаёт JSON.
API повторяет форму существующего lemanapro-парсера: `/search`, `/batch`,
`/health`, `/cache/*`.

## API

### `GET /search?query=цемент&city=moscow&limit=5`

Ищет товары по строке. Город — slug (`moscow`, `spb`, `kazan`, `ekaterinburg`;
без города — `moscow`).

```json
{
  "query": "цемент",
  "city": "moscow",
  "strategy_used": "url_catalog",
  "cached": false,
  "results": [
    {
      "name": "Цемент Portland М500 Д0 50 кг Holcim",
      "sku": "106958",
      "price": 670.0,
      "currency": "RUB",
      "unit": null,
      "in_stock": null,
      "city": "moscow",
      "url": "https://petrovich.ru/product/106958/"
    }
  ]
}
```

### `POST /batch`

Батч-поиск. Аналог `/search` с массивом запросов.

```json
{
  "queries": ["цемент м500", "гипсокартон влагостойкий"],
  "city": "moscow",
  "limit": 1
}
```

Ответ:

```json
{
  "city": "moscow",
  "count": 2,
  "items": [
    { "query": "цемент м500", "found": true, "strategy_used": "url_catalog",
      "cached": false, "item": { "name": "...", "price": 670, ... } },
    { "query": "гипсокартон влагостойкий", "found": false }
  ]
}
```

### `GET /health` → `{"status":"ok","playwright_available":true,"site":"petrovich.ru"}`

### `GET /cache/stats` / `DELETE /cache`

## Деплой на Railway

1. Railway → **New Project** → **Deploy from GitHub repo** → выбрать этот репо.
2. В настройках проекта указать **Root Directory** = `backend` (чтобы Railway
   видел именно `backend/Dockerfile` и `railway.toml`).
3. Deploy. Первая сборка — 5–10 минут (качается Playwright-образ ~1 ГБ).
4. После `Deployment successful` откроется URL вида
   `https://<project>-production.up.railway.app`.
5. `curl <url>/health` — должно вернуть JSON со `status:"ok"`.

## Деплой на Render (альтернатива)

В корне репо уже есть `render.yaml`, который указывает на этот же `backend/`.
Render → **Blueprint** → выбрать репо → Apply.

## Локальный запуск

```bash
cd backend
pip install -r requirements.txt
playwright install --with-deps chromium
uvicorn main:app --reload
```

```bash
curl "http://localhost:8000/search?query=цемент&limit=3"
```

## Переменные окружения

- `DEFAULT_CITY` — город по умолчанию (`moscow` если не задано).
- `ALLOWED_ORIGINS` — CORS whitelist через запятую, либо `*`.

## Стратегии скрейпинга

Для каждого запроса пробуем последовательно:

1. **`url_catalog`** — `GET /catalog/?search=<q>`, ждём появление
   `[data-test="product-card-catalog-slim"]`. Быстро, когда работает.
2. **`form_submit`** — открываем главную, вписываем строку в поисковое поле и
   жмём Enter. Медленнее, но ближе к реальному пользователю.

Поле `strategy_used` в ответе показывает, каким путём получен результат
(или `cache`, если из кеша).

## Гарантии

- **Кеш**: 1 час, до 5 000 ключей, TTL-based eviction.
- **Защита**: petrovich.ru прикрыт Variti; `requests`/`httpx` без браузера
  возвращают 503. Поэтому необходим Playwright + правильные cookies
  (`CityID`/`city`) — выставляются автоматически по `city`.
- **Селекторы**: `data-test="product-card-catalog-slim"` /
  `product-title` / `product-gold-price` / `product-link`. Если Петрович
  поменяет — править в `main.py` в константах `CARD_SEL`, `TITLE_SEL` и др.
