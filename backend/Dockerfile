FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app

# Google Chrome for undetected_chromedriver (Lemana source). The Playwright base
# ships Chromium for Playwright but not google-chrome, which uc auto-detects.
RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates xvfb \
    && wget -q -O /usr/share/keyrings/google-chrome.gpg.key https://dl.google.com/linux/linux_signing_key.pub \
    && gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg /usr/share/keyrings/google-chrome.gpg.key \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY lemana_source.py .
COPY db.py .
COPY auth.py .
COPY create_user.py .

ENV PORT=8000
# Run Chrome "headed" under a virtual display: headless trips Qrator on Lemana.
ENV LEMANA_HEADLESS=0
EXPOSE 8000

CMD xvfb-run -a --server-args="-screen 0 1280x900x24" uvicorn main:app --host 0.0.0.0 --port ${PORT}
