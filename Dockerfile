FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app

# Real Google Chrome нужен для undetected_chromedriver (Playwright тащит свой Chromium —
# uc с ним не работает: разные пути, разная сборка, разная сигнатура).
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
        | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/main.py .
COPY backend/lemana_session.py .
COPY backend/lemana_worker.py .
COPY backend/lemana_api.py .

ENV PORT=8000
# LEMANA_HEADLESS=0 — Lemana/Qrator детектит --headless=new и не рендерит SPA,
# поэтому Chrome запускается с окном внутри виртуального X-сервера xvfb.
ENV LEMANA_HEADLESS=0
EXPOSE 8000

CMD xvfb-run -a uvicorn main:app --host 0.0.0.0 --port ${PORT}
