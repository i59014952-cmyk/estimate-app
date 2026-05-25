#!/bin/sh
# Точка входа бэкенда.
# 1) Поднимаем виртуальный дисплей Xvfb вручную (headed-Chrome — headless палит
#    Qrator). Запускаем uvicorn напрямую с DISPLAY, без xvfb-run.
# 2) Если задан LEMANA_UPSTREAM_PROXY — поднимаем локальный релей gost
#    (http://127.0.0.1:3128 без пароля -> upstream с авторизацией), т.к. Chrome
#    не умеет авторизацию SOCKS5 по логину/паролю. Chrome ходит через релей.
set -e

# виртуальный дисплей
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99

# прокси-релей (опционально)
if [ -n "$LEMANA_UPSTREAM_PROXY" ]; then
    echo "[start] gost relay: http://127.0.0.1:3128 -> $LEMANA_UPSTREAM_PROXY"
    gost -L "http://127.0.0.1:3128" -F "$LEMANA_UPSTREAM_PROXY" >/tmp/gost.log 2>&1 &
    export LEMANA_PROXY="http://127.0.0.1:3128"
fi

exec uvicorn main:app --host 0.0.0.0 --port "${PORT}"
