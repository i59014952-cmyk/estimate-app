"""Диагностика: что реально отдаёт lemanapro.ru на этом сервере.

Запуск (код в контейнер вставлять не нужно — подаём через stdin):
    docker compose exec -T backend xvfb-run -a python - < backend/_qrator_check.py

Печатает заголовок страницы, размер, наличие маркеров Qrator/челленджа
и есть ли на странице поле «Поиск». Если поля нет, а есть маркеры
проверки — значит Qrator режет серверный IP.
"""
import time

import undetected_chromedriver as uc

try:
    from lemana_session import _detect_chrome_major
    ver = _detect_chrome_major()
except Exception:
    ver = None

opts = uc.ChromeOptions()
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--disable-gpu")
kwargs = {"options": opts}
if ver:
    kwargs["version_main"] = ver

d = uc.Chrome(**kwargs)
try:
    d.set_page_load_timeout(45)
    d.get("https://kazan.lemanapro.ru/?fromRegion=34")
    time.sleep(8)
    src = d.page_source
    low = src.lower()
    markers = ("qrator", "captcha", "проверя", "robot", "are you human",
               "checking your browser", "доступ ограничен", "ddos")
    print("CHROME_VERSION_USED:", ver)
    print("FINAL_URL:", d.current_url)
    print("TITLE:", repr(d.title))
    print("PAGE_LEN:", len(src))
    print("HAS_POISK:", "поиск" in low)
    print("CHALLENGE_MARKERS:", [m for m in markers if m in low])
    print("SNIPPET:", repr(src[:400]))
finally:
    try:
        d.quit()
    except Exception:
        pass
