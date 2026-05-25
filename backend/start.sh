#!/bin/sh
# Точка входа бэкенда. Если задан LEMANA_UPSTREAM_PROXY — поднимаем локальный
# релей gost (http://127.0.0.1:3128 без пароля -> upstream-прокси с авторизацией),
# потому что Chrome не умеет авторизацию SOCKS5 по логину/паролю. Затем Chrome
# ходит через этот локальный прокси (LEMANA_PROXY).
set -e

if [ -n "$LEMANA_UPSTREAM_PROXY" ]; then
    echo "[start] gost relay: http://127.0.0.1:3128 -> $LEMANA_UPSTREAM_PROXY"
    gost -L "http://127.0.0.1:3128" -F "$LEMANA_UPSTREAM_PROXY" >/tmp/gost.log 2>&1 &
    export LEMANA_PROXY="http://127.0.0.1:3128"
fi

exec xvfb-run -a --server-args="-screen 0 1280x900x24" \
    uvicorn main:app --host 0.0.0.0 --port "${PORT}"
