# Деплой Kub·House / sme-ta.ru на свой сервер (Timeweb Cloud)

Весь стек поднимается через `docker compose`: **backend** (FastAPI + Chrome для
парсинга), **db** (PostgreSQL — собственная БД, не Supabase) и **caddy**
(reverse-proxy с авто-HTTPS). Фронтенд — статический сайт на GitHub Pages,
который ходит в бэкенд по `https://api.<домен>`.

## Рекомендуемая конфигурация сервера

- **Образ:** Ubuntu 24.04
- **Регион:** Москва (MSK-1) или Санкт-Петербург — целевые сайты российские
- **Конфигурация:** 8 ГБ RAM / 4 vCPU (комфортно для Lemana) или 4 ГБ / 2 vCPU (минимум)
- **Сеть:** публичный IPv4 — обязателен
- **Бэкапы:** данные теперь в томе Postgres (`pg_data`), сервер НЕ stateless —
  делайте `pg_dump` (см. ниже) или включите бэкап диска.

## Шаг 1. Cloud-init

При создании сервера вставьте содержимое `cloud-init.yaml` в поле «Cloud-init».
Скрипт поставит Docker + Compose и базовый firewall. Секретов не содержит.

## Шаг 2. Swap (важно — защита от OOM)

Lemana запускает headed-Chrome под Xvfb — это тяжело по памяти. На 4 ГБ без
swap пиковая нагрузка может уронить сервер. Добавьте 4 ГБ swap:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

(В `docker-compose.yml` у backend уже стоят `mem_limit: 3g` / `memswap_limit: 5g` —
при нехватке памяти ядро прибьёт только контейнер, а не весь сервер.)

## Шаг 3. Порты (firewall)

```bash
ufw allow OpenSSH
ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
```

Порт 8000 (бэкенд) наружу не нужен — он `expose`-only, весь трафик идёт через
Caddy на 80/443.

## Шаг 4. Код и секреты

```bash
git clone <repo-url> /opt/estimate-app
cd /opt/estimate-app
```

Создайте `/opt/estimate-app/.env` (см. `.env.example` в корне репо). Минимум:

```dotenv
POSTGRES_PASSWORD=<openssl rand -hex 24>     # пароль БД
KH_JWT_SECRET=<openssl rand -hex 32>         # секрет для JWT входа
LEMANA_UPSTREAM_PROXY=socks5://USER:PASS@HOST:PORT   # прокси для Lemana (см. ниже)
KH_ADMIN_EMAILS=admin@example.com            # необязательно: кому роль admin
```

**Прокси для Lemana.** lemanapro.ru за Qrator блокирует IP сервера, поэтому
Lemana ходит через российский (мобильный) прокси. SOCKS5 указывается как
`LEMANA_UPSTREAM_PROXY` — авторизацию делает встроенный релей gost (`backend/start.sh`),
Chrome ходит через локальный `http://127.0.0.1:3128`. Без этой строки сайт
работает, но поиск цен Lemana — нет. Petrovich и др. магазины ходят напрямую.

## Шаг 5. DNS

- `api.<домен>` → **A-запись** на IP сервера (бэкенд).
- Фронтенд (`<домен>`) — на GitHub Pages (CNAME на Pages) ИЛИ self-host (собрать
  `npm run build` и отдавать `dist/`).

Домены жёстко заданы в `Caddyfile` (`api.sme-ta.ru, sme-ta.ru`) и во фронте в
`lib/estimateCore.js` (`PRICES_BACKEND='https://api.sme-ta.ru'`). При другом
домене — поправьте обе строки.

## Шаг 6. Запуск

```bash
cd /opt/estimate-app
docker compose up -d
curl https://api.<домен>/health    # {"status":"ok", "playwright_available": true}
```

Пустая БД создаётся автоматически из `db/schema.sql` (при первом создании тома
`pg_data`). Caddy выпустит HTTPS-сертификаты (нужны открытые 80/443 и DNS,
указывающий на сервер).

## Обновление кода

На сервере репозиторий обычно в detached HEAD, поэтому `git pull` не сработает —
переключайтесь жёстко на прод-ветку:

```bash
cd /opt/estimate-app
git fetch origin
git reset --hard origin/claude/repair-estimate-calculator-RE5sE
docker compose build backend && docker compose up -d backend
```

Перезапуск без пересборки безопасен (`start.sh` сам чистит stale Xvfb-lock):

```bash
docker compose restart backend
```

## Бэкап и восстановление БД

```bash
# дамп
docker compose exec -T db pg_dump -U kh kubhouse > db_backup.sql
# восстановление
docker compose exec -T db psql -U kh kubhouse < db_backup.sql
```

## Диагностика

```bash
docker compose logs --tail=100 backend        # логи (ошибки Chrome/прокси/таймауты)
docker stats --no-stream                       # память/CPU контейнеров
free -h                                         # память/ swap хоста
```

Типовая засада: после `docker compose restart` Chrome падал с
`session not created: cannot connect to chrome ... from chrome not reachable` —
это stale `/tmp/.X99-lock` мешал Xvfb. Исправлено в `start.sh` (чистит lock
перед стартом). Если образ старый — вместо `restart` используйте
`docker compose up -d --force-recreate backend`.
