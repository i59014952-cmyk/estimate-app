#!/usr/bin/env bash
# kub-house-loader.sh — встраивает полноэкранный лоадер «Рулетка»
# (вариант №1 из loaders/index.html) в estimate-app.
#
# Что делает:
#   1) создаёт components/Loader.jsx
#   2) подключает его в index.html
#   3) делает window.khShowLoader(durationMs) глобально доступной
#   4) показывает лоадер при первой загрузке (1.8s) и при смене тарифа
#
# Запуск из корня estimate-app:
#   bash kub-house-loader.sh

set -euo pipefail

ROOT="$(pwd)"
COMP="$ROOT/components"
mkdir -p "$COMP"

# ---------- 1. components/Loader.jsx ----------
cat > "$COMP/Loader.jsx" <<'JSX'
// Полноэкранный лоадер «Подбираем лучшие цены» — рулетка с ценами.
// Управляется через window.khShowLoader(durationMs) и window.khHideLoader().

(function () {
  const C = {
    paper: '#F4ECE0',
    ink: '#1F1B16',
    ink3: '#8A7F73',
    rust: '#C25842',
  };

  function LoaderOverlay({ visible, onDone }) {
    React.useEffect(() => {
      if (!visible) return;
      // блокируем скролл, пока лоадер показан
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }, [visible]);

    return (
      <div
        aria-hidden={!visible}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: C.paper,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity .35s ease',
        }}
      >
        {/* Рулетка */}
        <div style={{ position: 'relative', width: 280, height: 110 }}>
          {/* корпус */}
          <div style={{
            position: 'absolute', left: 0, top: 30, width: 70, height: 60, borderRadius: 10,
            background: C.rust, border: `1.5px solid ${C.ink}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#fff', border: `1.5px solid ${C.ink}`,
            }}/>
          </div>
          {/* лента */}
          <div style={{
            position: 'absolute', left: 70, top: 50, height: 22, width: 200,
            background: '#F5E29A', border: `1.5px solid ${C.ink}`, overflow: 'hidden',
          }}>
            <div className="kh-tape" style={{
              display: 'flex', gap: 22, padding: '0 6px', whiteSpace: 'nowrap',
              height: '100%', alignItems: 'center',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.ink,
            }}>
              <span>28 600 ₽</span><span>14 200 ₽</span><span>9 850 ₽</span>
              <span>32 100 ₽</span><span>6 400 ₽</span><span>18 700 ₽</span>
              <span>2 150 ₽</span><span>41 900 ₽</span><span>11 300 ₽</span>
              <span>28 600 ₽</span><span>14 200 ₽</span><span>9 850 ₽</span>
            </div>
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `repeating-linear-gradient(90deg, ${C.ink} 0 1px, transparent 1px 16px)`,
              opacity: .35,
            }}/>
          </div>
        </div>

        {/* Подпись */}
        <div style={{
          fontFamily: '"Cormorant Garamond", serif', fontStyle: 'italic',
          fontSize: 28, color: C.ink, marginTop: 26, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>Подбираем лучшие цены</div>

        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.18em',
          textTransform: 'uppercase', color: C.ink3, marginTop: 14,
        }}>замеряем рынок</div>

        <style>{`
          @keyframes kh-tape { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-160px) } }
          .kh-tape { animation: kh-tape 2.6s ease-in-out infinite; }
        `}</style>
      </div>
    );
  }

  // -- Контроллер: вешаем root рядом с #root, управляем через window --
  function mount() {
    const host = document.createElement('div');
    host.id = 'kh-loader-root';
    document.body.appendChild(host);
    const root = ReactDOM.createRoot(host);

    let visible = false;
    let timer = null;
    function render() { root.render(<LoaderOverlay visible={visible}/>); }

    window.khShowLoader = function (ms) {
      visible = true;
      render();
      if (timer) clearTimeout(timer);
      const d = typeof ms === 'number' ? ms : 1800;
      timer = setTimeout(() => { visible = false; render(); }, d);
    };
    window.khHideLoader = function () {
      if (timer) clearTimeout(timer);
      visible = false;
      render();
    };

    render();

    // Авто-показ при первом заходе
    if (!sessionStorage.getItem('kh-loader-shown')) {
      sessionStorage.setItem('kh-loader-shown', '1');
      window.khShowLoader(1800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
JSX

# ---------- 2. подключение в index.html ----------
INDEX="$ROOT/index.html"
if [ -f "$INDEX" ] && ! grep -q 'components/Loader.jsx' "$INDEX"; then
  # вставляем перед закрывающим </body>
  awk '
    /<\/body>/ && !done {
      print "    <script type=\"text/babel\" src=\"components/Loader.jsx\"></script>";
      done=1
    }
    { print }
  ' "$INDEX" > "$INDEX.tmp" && mv "$INDEX.tmp" "$INDEX"
  echo "✓ index.html: подключён components/Loader.jsx"
else
  echo "• index.html: уже подключён или не найден — пропускаю"
fi

# ---------- 3. показ при смене тарифа ----------
WS="$COMP/Workspace.jsx"
if [ -f "$WS" ] && ! grep -q 'khShowLoader' "$WS"; then
  # ищем строку вида: setActiveTariff(<что-то>) и добавляем khShowLoader перед ней.
  # Безопаснее всего — найти setActiveTariff( и обернуть точечно через sed на вызов из обработчика.
  # Простая стратегия: добавить хук на изменение activeTariff через useEffect.
  python3 - "$WS" <<'PY'
import sys, re, io
p = sys.argv[1]
s = open(p, 'r', encoding='utf-8').read()
hook = """
  // KH: показать лоадер при смене тарифа
  React.useEffect(() => {
    if (window.khShowLoader) window.khShowLoader(1400);
  }, [activeTariff]);
"""
# вставляем сразу после первого useState/useEffect внутри функции Workspace
m = re.search(r'function\s+Workspace\s*\([^)]*\)\s*\{', s)
if m:
    insert_at = m.end()
    s = s[:insert_at] + hook + s[insert_at:]
    open(p, 'w', encoding='utf-8').write(s)
    print('✓ Workspace.jsx: добавлен хук на смену тарифа')
else:
    print('• Workspace.jsx: function Workspace не найден — пропускаю')
PY
else
  echo "• Workspace.jsx: уже патчен или не найден — пропускаю"
fi

echo
echo "Готово."
echo "Теперь: git add -A && git commit -m \"add price loader overlay\" && git push"
