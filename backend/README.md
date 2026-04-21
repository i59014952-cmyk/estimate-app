# Petrovich price proxy

FastAPI + Playwright backend that searches petrovich.ru for a list of
material names and returns `{title, price, url}` for each. Needed
because petrovich.ru uses Variti bot-protection — simple HTTP clients
get 503 without a headless browser.

## Deploy to Render (free plan)

1. Push this repo to GitHub (already done).
2. Go to https://render.com → **New** → **Blueprint**.
3. Point it at your GitHub repo and approve. Render reads `render.yaml`
   at the repo root and builds the Dockerfile in `backend/`.
4. Wait ~5–10 min for the first build (Playwright image is ~1 GB).
5. Your backend URL will be `https://petrovich-proxy-XXXX.onrender.com`
   — grab it from the Render dashboard.
6. In `app.js` at the repo root, set:
   ```js
   const PETROVICH_BACKEND = "https://petrovich-proxy-XXXX.onrender.com";
   ```
7. Commit and push.

## Local test

```bash
cd backend
pip install -r requirements.txt
playwright install --with-deps chromium
uvicorn main:app --reload
```

Then:

```bash
curl -X POST http://localhost:8000/prices \
  -H "Content-Type: application/json" \
  -d '{"names":["цемент м500","саморезы гипсокартон"]}'
```

## Notes / gotchas

- **Free Render plan sleeps** after 15 min of inactivity. First request
  after sleep takes 30–60 s (cold boot + Chromium launch).
- **512 MB RAM** is tight — if you get OOM kills, upgrade to Starter
  plan ($7/mo) or reduce `MAX_ITEMS` in `main.py`.
- **Selectors are best-effort.** If Petrovich changes their markup,
  update `CARD_SELECTOR` / `TITLE_SELECTOR` / `PRICE_SELECTOR` /
  `LINK_SELECTOR` in `main.py`.
- **Rate limits.** Default `PER_QUERY_DELAY_S = 0.4` throttles requests.
  Increase if Petrovich starts returning captchas.
- **City.** Petrovich auto-selects a city by IP. To force one, set a
  cookie in `prices()`:
  ```python
  await context.add_cookies([{
      "name": "CityID", "value": "26",  # 26 = Kazan
      "domain": ".petrovich.ru", "path": "/",
  }])
  ```
- **Caching.** Repeated queries hit Petrovich every time. For a real
  deployment add Redis or SQLite caching keyed by `query`.
- **Legal.** Scraping may violate Petrovich ToS. Use for personal
  estimates; don't republish prices.
