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

## Шаг 3. HTTPS через домен (обязательно для GitHub Pages)

Фронтенд на GitHub Pages работает по HTTPS, поэтому бэкенд тоже должен быть на
HTTPS — иначе браузер заблокирует запросы (mixed content). Решается доменом +
Caddy (авто-сертификат Let's Encrypt).

1. Купите домен и создайте **A-запись** на IP сервера.
2. Откройте порты 80/443 (для выпуска сертификата):
   ```bash
   ufw allow 80/tcp && ufw allow 443/tcp || true
   ```
3. Задайте домен и перезапустите стек:
   ```bash
   cd /opt/estimate-app
   echo "DOMAIN=ваш-домен.ru" > .env
   docker compose up -d
   ```
4. Проверьте HTTPS (через минуту, пока выпускается сертификат):
   ```bash
   curl https://ваш-домен.ru/health
   ```

## Шаг 4. Переключить фронтенд на новый бэкенд

В `app.js` константа `PRICES_BACKEND` указывает на старый Render-URL.
Замените на домен нового сервера (по HTTPS), затем закоммитьте — GitHub Pages
пересоберётся автоматически:

```js
const PRICES_BACKEND = 'https://ваш-домен.ru';
```

## Обновление кода

```bash
cd /opt/estimate-app && git pull && docker compose up -d --build
```
