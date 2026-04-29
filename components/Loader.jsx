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
          background: 'rgba(20,16,12,.18)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity .35s ease, backdrop-filter .35s ease',
        }}
      >
        <div
          style={{
            background: C.paper,
            border: '1px solid rgba(80,60,30,.18)',
            borderRadius: 16,
            padding: '40px 48px 36px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 30px 80px -20px rgba(20,16,12,.45), 0 4px 16px -4px rgba(20,16,12,.18)',
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(.96)',
            transition: 'transform .35s cubic-bezier(.2,.9,.3,1.2)',
            position: 'relative',
          }}
        >
          {/* corner ticks */}
          {[
            { top: -1, left: -1, br: '0 0 0 0', borderRight: 0, borderBottom: 0 },
            { top: -1, right: -1, br: '0 0 0 0', borderLeft: 0, borderBottom: 0 },
            { bottom: -1, left: -1, br: '0 0 0 0', borderRight: 0, borderTop: 0 },
            { bottom: -1, right: -1, br: '0 0 0 0', borderLeft: 0, borderTop: 0 },
          ].map((p, i) => (
            <span key={i} style={{
              position: 'absolute',
              width: 12, height: 12,
              border: `1px solid ${C.ink}`,
              ...p,
            }} />
          ))}

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
            fontSize: 26, color: C.ink, marginTop: 22, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}>Подбираем лучшие цены</div>

          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.18em',
            textTransform: 'uppercase', color: C.ink3, marginTop: 12,
          }}>замеряем рынок</div>
        </div>

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
