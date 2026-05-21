# Деплой бэкенда на Timeweb Cloud

Миграция с Render.com на облачный сервер Timeweb.

## Рекомендуемая конфигурация сервера

- **Образ:** Ubuntu 24.04
- **Регион:** Москва (MSK-1) или Санкт-Петербург — целевые сайты российские
- **Конфигурация:** 8 ГБ RAM / 4 vCPU (комфортно) или 4 ГБ / 2 vCPU (минимум)
- **Сеть:** публичный IPv4 — обязателен
- **Бэкапы:** можно отключить (сервер stateless, код в git, данные в Supabase)

## Шаг 1. Cloud-init

При создании сервера вставьте содержимое `cloud-init.yaml` в поле «7. Cloud-init».
Скрипт поставит Docker + Compose и откроет порт 8000. Секретов не содержит.

## Шаг 2. Развёртывание (один раз, по SSH)

```bash
ssh root@<ip-сервера>
git clone <repo-url> /opt/estimate-app
cd /opt/estimate-app
docker compose up -d --build
curl localhost:8000/health   # {"playwright_available": true}
```

## Шаг 3. Переключить фронтенд на новый бэкенд

В `app.js` константа `PRICES_BACKEND` указывает на старый Render-URL.
Замените на адрес нового сервера, затем пересоберите фронтенд (`npm run build`):

```js
const PRICES_BACKEND = 'http://<ip-сервера>:8000';
```

Для HTTPS поставьте reverse-proxy (Caddy/nginx) с доменом и Let's Encrypt —
иначе браузер заблокирует mixed content, если фронтенд открыт по https.

## Обновление кода

```bash
cd /opt/estimate-app && git pull && docker compose up -d --build
```
