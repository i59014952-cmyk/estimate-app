#!/usr/bin/env bash
# Применяет схему БД (идемпотентно) и проверяет, что таблица шаблонов
# kh_templates создана. Нужно после добавления хранения шаблонов на сервере.
#
# Запуск на сервере из корня проекта:
#     bash deploy/setup-templates.sh
#
# Скрипт безопасно запускать повторно: schema.sql использует
# `create table if not exists`, существующие таблицы не трогаются.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 1. Применяю db/schema.sql внутри контейнера kh-postgres =="
docker compose exec -T db psql -U kh -d kubhouse < db/schema.sql

echo
echo "== 2. Проверяю таблицу kh_templates =="
docker compose exec -T db psql -U kh -d kubhouse -c "\dt kh_templates"
docker compose exec -T db psql -U kh -d kubhouse \
  -c "select to_regclass('public.kh_templates') as table, count(*) as rows from kh_templates;"

echo
echo "== Готово. Если выше видно kh_templates — серверная часть настроена. =="
