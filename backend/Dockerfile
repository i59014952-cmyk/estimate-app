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

# gost — локальный релей для прокси. Chrome не умеет авторизацию SOCKS5 по
# логину/паролю, поэтому gost авторизуется в upstream-прокси, а Chrome ходит
# через локальный http://127.0.0.1:3128 без пароля. Включается, только если
# задан LEMANA_UPSTREAM_PROXY (см. start.sh).
RUN wget -q -O /tmp/gost.tgz \
      https://github.com/go-gost/gost/releases/download/v3.2.6/gost_3.2.6_linux_amd64.tar.gz \
    && tar -xzf /tmp/gost.tgz -C /usr/local/bin gost \
    && chmod +x /usr/local/bin/gost \
    && rm -f /tmp/gost.tgz

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./
COPY start.sh ./
RUN chmod +x start.sh

ENV PORT=8000
# Run Chrome "headed" under a virtual display: headless trips Qrator on Lemana.
ENV LEMANA_HEADLESS=0
EXPOSE 8000

CMD ["sh", "/app/start.sh"]
