#!/usr/bin/env bash
set -e
mkdir -p components

cat > "index.html" <<'KUBHOUSE_EOF_0T6L3S'
<!doctype html>
<html lang="ru" data-screen-label="01 Workspace">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Kub·House — Смета «Сосны»</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="styles.css"/>
</head>
<body>
<div id="root"></div>

<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

<script type="text/babel" src="tweaks-panel.jsx"></script>
<script type="text/babel" src="components/Logo.jsx"></script>
<script type="text/babel" src="components/Data.jsx"></script>
<script type="text/babel" src="components/Workspace.jsx"></script>

<script type="text/babel">
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light"
}/*EDITMODE-END*/;
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => { document.documentElement.setAttribute("data-theme", t.theme); }, [t.theme]);
  return (
    <>
      <Workspace theme={t.theme} onTheme={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")} />
      <TweaksPanel>
        <TweakSection label="Тема" />
        <TweakRadio label="Палитра" value={t.theme}
          options={[{value:"light",label:"Свет"},{value:"warm",label:"Тёпл."},{value:"dark",label:"Тьма"}]}
          onChange={(v) => setTweak("theme", v)} />
      </TweaksPanel>
    </>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
</script>
</body>
</html>
KUBHOUSE_EOF_0T6L3S

cat > "styles.css" <<'KUBHOUSE_EOF_KZJWAP'
/* Kub-House — глобальные стили / дизайн-токены
   Палитра вытянута из PDF: тёплая бумажная база, кофейные акценты, серая графика.
*/

:root{
  /* Light (paper) */
  --paper:#F4EFE4;          /* фон бумаги */
  --paper-2:#EFE9DC;        /* фон сайдбара / панели */
  --paper-3:#E7E0CF;        /* грид-линии */
  --ink:#1A1714;            /* основной текст */
  --ink-2:#3C342B;          /* вторичный */
  --ink-3:#7A6F60;          /* подписи / muted */
  --ink-4:#A89B87;          /* совсем тонкое */
  --rule:#CFC4AE;           /* линии-разделители */
  --rule-2:#DDD2BC;
  --coffee:#5C3A1E;         /* CTA / акцент 1 */
  --coffee-2:#3E2614;       /* hover */
  --espresso:#1F1612;
  --gold:#A98142;           /* акцент-золото */
  --moss:#6E7B4F;           /* живой акцент */
  --rust:#9A4422;
  --good:#6B8F4E;
  --warn:#B68A2C;
  --paper-card:#FBF7EE;     /* карточки */
  --shadow-1:0 1px 0 rgba(255,255,255,.6) inset, 0 1px 2px rgba(70,52,30,.08);
  --shadow-2:0 1px 0 rgba(255,255,255,.6) inset, 0 18px 40px -18px rgba(70,52,30,.25);

  --serif:"Cormorant Garamond","EB Garamond",Georgia,serif;
  --sans:"Geist","Inter",system-ui,-apple-system,sans-serif;
  --mono:"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace;

  --r-sm:6px;
  --r-md:10px;
  --r-lg:14px;
  --r-xl:20px;
}

[data-theme="dark"]{
  --paper:#15110D;
  --paper-2:#1B1612;
  --paper-3:#231D17;
  --ink:#F2EADB;
  --ink-2:#D7CDB8;
  --ink-3:#9C8E78;
  --ink-4:#6B5F4E;
  --rule:#2E2620;
  --rule-2:#3A3127;
  --coffee:#C89368;
  --coffee-2:#E0AE85;
  --espresso:#F2EADB;
  --gold:#D7AB6A;
  --moss:#9CAE7B;
  --rust:#D17B53;
  --paper-card:#1E1812;
  --shadow-1:0 1px 0 rgba(255,255,255,.04) inset, 0 1px 2px rgba(0,0,0,.4);
  --shadow-2:0 1px 0 rgba(255,255,255,.04) inset, 0 24px 60px -20px rgba(0,0,0,.7);
}

[data-theme="warm"]{
  --paper:#E9D9BC;
  --paper-2:#E0CDA9;
  --paper-3:#D6C098;
  --ink:#231405;
  --ink-2:#3F2611;
  --ink-3:#6B4D2C;
  --ink-4:#8C6E47;
  --rule:#B79D70;
  --rule-2:#C8B284;
  --coffee:#3E2614;
  --coffee-2:#231405;
  --paper-card:#F1E4CB;
}

*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);
  font-family:var(--sans);
  font-feature-settings:"ss01","cv11";
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
body{
  /* грид-фон бумаги — лёгкая миллиметровка как на референсе */
  background-image:
    linear-gradient(var(--paper-3) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-3) 1px, transparent 1px);
  background-size: 28px 28px;
  background-position: -1px -1px;
  background-attachment: fixed;
  background-color: var(--paper);
}
[data-theme="dark"] body{
  background-image:
    linear-gradient(var(--paper-3) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-3) 1px, transparent 1px);
}

a{color:inherit;text-decoration:none}
button{font-family:inherit;color:inherit}

/* Типографика */
.serif{font-family:var(--serif);font-weight:500;letter-spacing:-0.01em}
.serif-it{font-family:var(--serif);font-style:italic;font-weight:500}
.mono{font-family:var(--mono);font-feature-settings:"zero","ss01"}

.eyebrow{
  font-family:var(--mono);
  font-size:10px;
  font-weight:500;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--ink-3);
}
.eyebrow .dot{display:inline-block;width:5px;height:5px;border-radius:99px;background:var(--moss);vertical-align:middle;margin-right:6px}

h1,h2,h3{margin:0;font-family:var(--serif);font-weight:500;letter-spacing:-0.02em;line-height:1.02}
h1{font-size:clamp(44px,6.4vw,100px);line-height:1.0}
h2{font-size:clamp(40px,5.5vw,84px)}
h3{font-size:clamp(28px,3vw,44px)}
p{margin:0;line-height:1.55;color:var(--ink-2)}

.container{max-width:1440px;margin:0 auto;padding:0 40px}
@media (max-width:720px){ .container{padding:0 20px} }

/* Кнопки */
.btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:11px 18px;border-radius:99px;border:1px solid var(--rule);
  background:transparent;color:var(--ink);
  font-size:13px;font-weight:500;letter-spacing:.005em;
  cursor:pointer;transition:transform .12s ease, background .15s ease, border-color .15s ease;
  font-family:var(--sans);
}
.btn:hover{background:rgba(0,0,0,.04);border-color:var(--ink-3)}
[data-theme="dark"] .btn:hover{background:rgba(255,255,255,.04)}
.btn-primary{
  background:var(--coffee);color:#FBF5E7;border-color:transparent;
  box-shadow:0 1px 0 rgba(255,255,255,.18) inset, 0 8px 22px -8px rgba(92,58,30,.55);
}
.btn-primary:hover{background:var(--coffee-2)}
.btn-ghost{border-color:transparent}
.btn-sm{padding:7px 12px;font-size:12px}
.btn-icon{width:32px;height:32px;padding:0;justify-content:center;border-radius:99px}

/* Тонкие линии-засечки в углах кадра — как на PDF */
.frame{position:relative}
.frame::before,
.frame::after,
.frame > .frame-bl,
.frame > .frame-br{
  content:"";position:absolute;width:14px;height:14px;
  border:1px solid var(--ink-4); opacity:.55;
}
.frame::before{top:-1px;left:-1px;border-right:0;border-bottom:0}
.frame::after{top:-1px;right:-1px;border-left:0;border-bottom:0}
.frame > .frame-bl{bottom:-1px;left:-1px;border-right:0;border-top:0}
.frame > .frame-br{bottom:-1px;right:-1px;border-left:0;border-top:0}

/* Утилиты */
.row{display:flex}
.col{display:flex;flex-direction:column}
.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}.gap-6{gap:24px}.gap-8{gap:32px}
.center{align-items:center}
.between{justify-content:space-between}
.muted{color:var(--ink-3)}
.tiny{font-size:11px}
.divider{height:1px;background:var(--rule);width:100%}
.divider-dashed{border-top:1px dashed var(--rule);width:100%;height:0}

/* Тики-измерения (как на чертеже) */
.tick{position:relative;display:inline-block}
.tick::before,.tick::after{content:"";position:absolute;width:1px;height:7px;background:var(--ink-3);top:50%;transform:translateY(-50%)}
.tick::before{left:-9px}
.tick::after{right:-9px}

/* Селект-фокус */
.focusable{outline:none}
.focusable:focus-visible{box-shadow:0 0 0 3px rgba(92,58,30,.18)}
KUBHOUSE_EOF_KZJWAP

cat > "tweaks-panel.jsx" <<'KUBHOUSE_EOF_7NW9TD'

// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;width:100%;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel"
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

function TweakColor({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <input type="color" className="twk-swatch" value={value}
             onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});
KUBHOUSE_EOF_7NW9TD

cat > "components/Logo.jsx" <<'KUBHOUSE_EOF_MLYY08'
// Logo.jsx — мини-знак Kub-House (квадратик с двумя строками)
function KubLogo({ size = 36, light = false }) {
  const stroke = light ? "currentColor" : "var(--ink)";
  return (
    <div className="row center gap-2" style={{ lineHeight: 1 }}>
      <div style={{
        width: size, height: size, border: `1px solid ${stroke}`,
        display: "grid", placeItems: "center",
        fontFamily: "var(--mono)", fontSize: size * 0.22,
        letterSpacing: ".06em", textAlign: "center", color: stroke,
        flexShrink: 0
      }}>
        <div style={{ display:"flex", flexDirection:"column", lineHeight:1.05 }}>
          <span style={{fontWeight:600}}>KUB</span>
          <span style={{borderTop:`1px solid ${stroke}`, paddingTop:1, marginTop:1, fontWeight:600}}>HOUSE</span>
        </div>
      </div>
      <div className="col" style={{ gap: 2 }}>
        <div className="serif" style={{ fontSize: size * 0.62, lineHeight: .95, color: stroke }}>
          Kub<span style={{opacity:.7}}>·</span>House
        </div>
        <div className="mono" style={{ fontSize: size * 0.24, letterSpacing: ".18em", color: "var(--ink-3)" }}>
          WOOD ARCHITECTURE
        </div>
      </div>
    </div>
  );
}

// Иконки (минималистичные line-icons)
function Icon({ name, size=16 }) {
  const s = size; const sw = 1.4;
  const props = { width:s, height:s, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:sw, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "doc": return <svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>;
    case "house": return <svg {...props}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>;
    case "cube": return <svg {...props}><path d="M12 3l9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v9"/></svg>;
    case "users": return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "cal": return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case "list": return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case "ruler": return <svg {...props}><path d="M21 3l-6 6m6-6l-3 3m-3 3l-3 3m-3 3l-3 3M3 21l18-18"/><path d="M3 21h6v-6"/></svg>;
    case "tpl": return <svg {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>;
    case "refresh": return <svg {...props}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>;
    case "export": return <svg {...props}><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>;
    case "upload": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>;
    case "plus": return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case "minus": return <svg {...props}><path d="M5 12h14"/></svg>;
    case "chev": return <svg {...props}><path d="M9 18l6-6-6-6"/></svg>;
    case "chevd": return <svg {...props}><path d="M6 9l6 6 6-6"/></svg>;
    case "moon": return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case "sun": return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
    case "arr": return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "check": return <svg {...props}><path d="M20 6L9 17l-5-5"/></svg>;
    case "tree": return <svg {...props}><path d="M3 6h4M3 12h6M3 18h8"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>;
    case "x": return <svg {...props}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case "play": return <svg {...props}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case "pause": return <svg {...props}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "wrench": return <svg {...props}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z"/></svg>;
    case "layers": return <svg {...props}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
    case "bell": return <svg {...props}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    case "spark": return <svg {...props}><path d="M12 2l2.5 7L22 11l-7.5 2L12 20l-2.5-7L2 11l7.5-2z"/></svg>;
    default: return null;
  }
}

Object.assign(window, { KubLogo, Icon });
KUBHOUSE_EOF_MLYY08

cat > "components/Data.jsx" <<'KUBHOUSE_EOF_USSU0Y'
// Data.jsx — фейковые но правдоподобные данные для сметы «Сосны»

const ESTIMATE = {
  code: "EST-0024",
  title: "Сосны",
  subtitle: "Резиденция · Деревянный каркас · 284 м²",
  revision: "R3",
  date: "24.04.2026",
  estimator: "А. Меньшов",
  area: 284,
  location: "Д. Горки, 14 соток",
  stage: "Смета / R3",
  budget: {
    materials: 4_280_500,
    works: 3_120_000,
    overhead: 612_000,
    vat: 1_602_500,
    total: 9_615_000,
  },
  stats: [
    { k: "Каталог", v: "2 078", u: "позиций", d: "+128 за неделю", dir: "up" },
    { k: "Своя база", v: "787", u: "материалов", d: "Обновл. 2 мин назад" },
    { k: "DDC цены", v: "1 291", u: "записей", d: "Синх. активна", live: true },
    { k: "Маржа проекта", v: "18.4", u: "%", d: "−2.1 п.п.", dir: "down" },
  ],
};

const SECTIONS = [
  {
    id: "s1", name: "Земляные работы и фундамент", code: "01", total: 1_240_000, expanded: true,
    rows: [
      { n: "01.01", name: "Разработка котлована экскаватором", unit: "м³", qty: 86, price: 720, src: "Норматив ГЭСН", srcKind: "norm" },
      { n: "01.02", name: "Монолитная плита УШП h=300", unit: "м²", qty: 142, price: 6900, src: "КП «БазисБетон»", srcKind: "kp" },
      { n: "01.03", name: "Гидроизоляция Икопал ЭКП", unit: "м²", qty: 158, price: 480, src: "Каталог KH", srcKind: "kh" },
      { n: "01.04", name: "Утеплитель XPS 100 мм", unit: "м²", qty: 142, price: 720, src: "Своя база", srcKind: "own" },
    ],
  },
  {
    id: "s2", name: "Стены и каркас", code: "02", total: 3_870_000, expanded: true,
    rows: [
      { n: "02.01", name: "Брус клеёный 200×200, лиственница", unit: "м³", qty: 22.4, price: 34800, src: "Каталог KH", srcKind: "kh", hot: true },
      { n: "02.02", name: "Узлы соединений (металл)", unit: "компл.", qty: 48, price: 4200, src: "Подрядчик «Линия»", srcKind: "pod" },
      { n: "02.03", name: "Контурная теплоизоляция Rockwool 200", unit: "м²", qty: 248, price: 880, src: "Своя база", srcKind: "own" },
      { n: "02.04", name: "Пароизоляция Изоспан А", unit: "м²", qty: 248, price: 95, src: "Каталог KH", srcKind: "kh" },
      { n: "02.05", name: "Планкен скошенный, сосна термо", unit: "м²", qty: 196, price: 2150, src: "Каталог KH", srcKind: "kh" },
    ],
  },
  {
    id: "s3", name: "Кровля", code: "03", total: 980_000, expanded: false,
    rows: [
      { n: "03.01", name: "Стропильная система", unit: "м³", qty: 8.2, price: 28000, src: "Своя база", srcKind: "own" },
      { n: "03.02", name: "Фальцевая кровля Zn-Mg", unit: "м²", qty: 168, price: 2400, src: "Каталог KH", srcKind: "kh" },
    ],
  },
  {
    id: "s4", name: "Инженерия", code: "04", total: 1_510_000, expanded: false,
    rows: [
      { n: "04.01", name: "Тёплый пол водяной", unit: "м²", qty: 142, price: 1800, src: "Подрядчик «Тепло+»", srcKind: "pod" },
      { n: "04.02", name: "Вентиляция с рекуперацией", unit: "компл.", qty: 1, price: 420000, src: "КП «Айрвент»", srcKind: "kp" },
    ],
  },
  {
    id: "s5", name: "Отделка и полы", code: "05", total: 2_015_000, expanded: false,
    rows: [
      { n: "05.01", name: "Паркет дуб массив, селект", unit: "м²", qty: 124, price: 6900, src: "Каталог KH", srcKind: "kh" },
      { n: "05.02", name: "OSB-3 плита 12 мм", unit: "лист", qty: 86, price: 1280, src: "Каталог KH", srcKind: "kh" },
    ],
  },
];

const POPULAR_MATERIALS = [
  { name: "Брус клеёный 200×200", note: "лиственница", price: 34_800, unit: "м³", color: "#C8A57A" },
  { name: "Планкен скошенный", note: "сосна термо", price: 2_150, unit: "м²", color: "#7C4A2A" },
  { name: "Паркет дуб массив", note: "селект", price: 6_900, unit: "м²", color: "#5C3A1E" },
  { name: "OSB-3 плита 12 мм", note: "лист", price: 1_280, unit: "лист", color: "#E0C898" },
  { name: "Rockwool Лайт Баттс", note: "100 мм", price: 1_180, unit: "м²", color: "#8C7E4F" },
  { name: "Изоспан А", note: "паропроницаемая", price: 95, unit: "м²", color: "#9DA98C" },
];

const HISTORY = [
  { who: "А. Меньшов", what: "создал ревизию R3", when: "сегодня · 14:31", live: true },
  { who: "Д. Ковров", what: "согласовал R2", when: "вчера · 18:04" },
  { who: "Система", what: "обновила цены DDC", when: "23 апр · 09:15", live: true },
  { who: "Е. Тарасов", what: "добавил подрядчика «Линия»", when: "22 апр · 16:40" },
];

const OBJECTS = [
  { code: "EST-0024", name: "Сосны", loc: "Д. Горки", area: 284, stage: "R3", budget: 9_615_000, status: "active" },
  { code: "EST-0023", name: "Берёзовая 12", loc: "Истра", area: 196, stage: "R5", budget: 7_120_000, status: "approved" },
  { code: "EST-0022", name: "Озеро", loc: "Завидово", area: 412, stage: "R2", budget: 14_280_000, status: "active" },
  { code: "EST-0021", name: "Кедр", loc: "Дмитров", area: 168, stage: "R7", budget: 5_840_000, status: "build" },
  { code: "EST-0020", name: "Долина", loc: "Тверь", area: 308, stage: "R1", budget: 11_200_000, status: "draft" },
];

const NAV = [
  { id: "estimates", label: "Сметы", icon: "doc", count: 24, active: true },
  { id: "objects", label: "Объекты", icon: "house", count: 18 },
  { id: "materials", label: "Материалы", icon: "cube", count: 2_078 },
  { id: "contractors", label: "Подрядчики", icon: "users", count: 47 },
  { id: "calendar", label: "Календарь", icon: "cal" },
];

const NAV2 = [
  { id: "works", label: "Работы", icon: "wrench" },
  { id: "norms", label: "Нормативы", icon: "ruler" },
  { id: "templates", label: "Шаблоны", icon: "tpl" },
];

const fmt = (n, sep=" ") => Number(n).toLocaleString("ru-RU").replace(/\u00A0/g, sep);
const fmtMoney = (n) => fmt(Math.round(n)) + " ₽";

Object.assign(window, { ESTIMATE, SECTIONS, POPULAR_MATERIALS, HISTORY, OBJECTS, NAV, NAV2, fmt, fmtMoney });
KUBHOUSE_EOF_USSU0Y

cat > "components/Workspace.jsx" <<'KUBHOUSE_EOF_UHT0MD'
// Workspace.jsx — рабочий стол сметчика, 1:1 с PDF (пустая смета «Сосны»)

const { useState, useMemo, useEffect } = React;

function StatCell({ k, v, u, d, dir, live }) {
  return (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      <div className="eyebrow">{live && <span className="dot" />}{k}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
        <span className="serif" style={{ fontSize: 38, lineHeight: .9, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{v}</span>
        <span className="muted tiny" style={{ paddingBottom: 3 }}>{u}</span>
      </div>
      <div className="row center" style={{ gap: 4 }}>
        {dir === "up" && <span style={{ color: "var(--good)", fontSize: 11 }}>↗</span>}
        {dir === "down" && <span style={{ color: "var(--rust)", fontSize: 11 }}>↘</span>}
        <span className="tiny muted">{d}</span>
      </div>
    </div>
  );
}

function TopBar({ onTheme, theme }) {
  return (
    <div className="row center between" style={{
      padding: "14px 28px", borderBottom: "1px solid var(--rule)",
      background: "var(--paper)", position: "sticky", top: 0, zIndex: 10
    }}>
      <div className="row center gap-6">
        <KubLogo size={32} />
        <div className="row center gap-3 mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", marginLeft: 8 }}>
          <span>Workspace</span>
          <span style={{ opacity: .5 }}>›</span>
          <span>Сметы</span>
          <span style={{ opacity: .5 }}>›</span>
          <span style={{ color: "var(--ink)" }}>Новый расчёт</span>
        </div>
      </div>
      <div className="row center gap-3">
        <button className="btn btn-sm"><Icon name="plus" size={14} /> Новая смета</button>
        <div className="row center gap-2 mono tiny" style={{
          padding: "7px 12px", border: "1px solid var(--rule)", borderRadius: 99, color: "var(--ink-3)"
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99, background: "var(--moss)",
            boxShadow: "0 0 0 3px rgba(110,123,79,.2)"
          }} /> Автосохр · 14:32
        </div>
        <button className="btn btn-icon" onClick={onTheme} title="Тема">
          <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
        </button>
        <div style={{
          width: 32, height: 32, borderRadius: 99, background: "var(--coffee)",
          color: "#FBF5E7", display: "grid", placeItems: "center",
          fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".05em"
        }}>АМ</div>
      </div>
    </div>
  );
}

function Sidebar({ active, onPick }) {
  const Item = ({ it }) => (
    <button
      onClick={() => onPick && onPick(it.id)}
      className="row center between focusable"
      style={{
        width: "100%", padding: "9px 12px", borderRadius: 8,
        background: active === it.id ? "var(--ink)" : "transparent",
        color: active === it.id ? "var(--paper)" : "var(--ink-2)",
        border: 0, cursor: "pointer", textAlign: "left",
        fontSize: 13, fontFamily: "var(--sans)"
      }}
    >
      <span className="row center gap-3">
        <Icon name={it.icon} size={15} />
        <span>{it.label}</span>
      </span>
      {it.count != null && (
        <span className="mono tiny" style={{ opacity: active === it.id ? .7 : .55 }}>
          {fmt(it.count)}
        </span>
      )}
    </button>
  );
  return (
    <aside className="col" style={{
      width: 232, padding: "20px 16px 18px", gap: 4,
      borderRight: "1px solid var(--rule)", background: "var(--paper-2)",
      minHeight: "100%"
    }}>
      <div className="eyebrow" style={{ padding: "0 12px 8px" }}>Рабочая область</div>
      {NAV.map(it => <Item key={it.id} it={it} />)}
      <div className="eyebrow" style={{ padding: "16px 12px 8px" }}>Справочники</div>
      {NAV2.map(it => <Item key={it.id} it={it} />)}

      <div className="frame" style={{
        marginTop: "auto", padding: "14px 14px 12px", border: "1px solid var(--rule)",
        background: "var(--paper-card)", position: "relative"
      }}>
        <div className="frame-bl" /><div className="frame-br" />
        <div className="eyebrow" style={{ marginBottom: 8 }}>Текущий объект</div>
        <div className="serif-it" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 10, fontStyle: "italic" }}>
          Резиденция «{ESTIMATE.title}»
        </div>
        <div className="col tiny mono" style={{ gap: 5, color: "var(--ink-3)" }}>
          <div><span style={{ color: "var(--ink-4)" }}>Д.</span> Горки, 14 соток</div>
          <div><span style={{ color: "var(--ink-4)" }}>Площадь</span> 284 м²</div>
          <div><span style={{ color: "var(--ink-4)" }}>Этап</span> Смета / R3</div>
        </div>
      </div>
    </aside>
  );
}

function HeroBlock() {
  return (
    <div className="frame" style={{ position: "relative", padding: "30px 40px 28px", borderTop: "1px solid var(--rule-2)", borderBottom: "1px solid var(--rule-2)" }}>
      <div className="frame-bl" /><div className="frame-br" />
      <div className="row between" style={{ alignItems: "flex-start", gap: 24 }}>
        <div className="col gap-3">
          <div className="serif" style={{ fontSize: 60, lineHeight: .92, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>
            Смета <span className="serif-it" style={{ fontStyle: "italic" }}>«Сосны»</span>
          </div>
          <div className="mono tiny" style={{ color: "var(--ink-3)", letterSpacing: ".08em" }}>
            <b style={{ color: "var(--ink)" }}>{ESTIMATE.code}</b>
            <span style={{ margin: "0 8px", color: "var(--ink-4)" }}>·</span>
            Резиденция
            <span style={{ margin: "0 8px", color: "var(--ink-4)" }}>·</span>
            Деревянный каркас
            <span style={{ margin: "0 8px", color: "var(--ink-4)" }}>·</span>
            284 м²
          </div>
        </div>
        <div className="col mono tiny" style={{ alignItems: "flex-end", gap: 4, color: "var(--ink-3)", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
          <div>РЕВИЗИЯ <b style={{ color: "var(--ink)" }}>{ESTIMATE.revision}</b></div>
          <div>ДАТА <b style={{ color: "var(--ink)" }}>{ESTIMATE.date}</b></div>
          <div>СМЕТЧИК <b style={{ color: "var(--ink)" }}>{ESTIMATE.estimator}</b></div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 28, gap: 0 }}>
        {ESTIMATE.stats.map((s, i) => (
          <div key={i} className="row" style={{ flex: 1, paddingRight: 24, borderRight: i < ESTIMATE.stats.length - 1 ? "1px dashed var(--rule)" : 0, paddingLeft: i ? 24 : 0 }}>
            <StatCell {...s} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Toolbar({ tab, onTab, query, onQuery }) {
  const tabs = [
    { id: "all", label: "Все", icon: "layers" },
    { id: "works", label: "Работы" },
    { id: "materials", label: "Материалы" },
    { id: "tree", label: "Дерево" },
  ];
  return (
    <div className="row between center" style={{ padding: "16px 32px", gap: 12, flexWrap: "wrap" }}>
      <div className="row center gap-3" style={{
        flex: 1, minWidth: 280, padding: "9px 14px",
        border: "1px solid var(--rule)", borderRadius: 99, background: "var(--paper-card)"
      }}>
        <Icon name="search" size={15} />
        <input
          value={query} onChange={(e) => onQuery(e.target.value)}
          placeholder="Найти работу, материал или подрядчика…"
          style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--ink)", fontSize: 13, fontFamily: "var(--sans)" }}
        />
        <span className="mono tiny" style={{ color: "var(--ink-4)", border: "1px solid var(--rule)", borderRadius: 4, padding: "2px 6px" }}>⌘K</span>
      </div>
      <div className="row center" style={{ gap: 6 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => onTab(t.id)} className="btn btn-sm"
            style={{
              background: tab === t.id ? "var(--ink)" : "transparent",
              color: tab === t.id ? "var(--paper)" : "var(--ink-2)",
              borderColor: tab === t.id ? "var(--ink)" : "var(--rule)"
            }}>
            {t.icon && <Icon name={t.icon} size={12} />}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// SVG-домик 1:1 со скрина: 2 этажа, 2 окна 4-панельные, дверь-арка, дерево, лента Ø 14 200 мм
// Вокруг — летают листы бумаги, карандаш, линейка, рулетка
function HouseSketch() {
  const sand = "#EFE5CB";
  const sandRoof = "#DFD0A8";
  const moss = "#8A9A66";
  const ink = "var(--ink-2)";
  const dim = "var(--ink-3)";

  return (
    <div style={{ position: "relative", width: 320, height: 200, margin: "0 auto" }}>
      <svg viewBox="0 0 460 280" width="320" height="200" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <pattern id="kh-paper-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0H0V6" stroke="rgba(80,60,30,.18)" strokeWidth=".4" fill="none"/>
          </pattern>
        </defs>

        {/* Дерево слева */}
        <g stroke={moss} strokeWidth="1.4" fill="none" strokeLinecap="round">
          <circle cx="80" cy="120" r="16" fill={moss} fillOpacity=".25"/>
          <line x1="80" y1="136" x2="80" y2="218"/>
          <path d="M80 158 L70 152 M80 158 L90 152"/>
          <path d="M80 174 L68 167 M80 174 L92 167"/>
          <path d="M80 192 L66 184 M80 192 L94 184"/>
        </g>

        {/* Земля + штриховка */}
        <line x1="20" y1="218" x2="440" y2="218" stroke={ink} strokeWidth="1.2"/>
        <g stroke={ink} strokeWidth=".9" opacity=".75">
          {Array.from({length: 28}).map((_,i) => (
            <line key={i} x1={28 + i*15} y1="220" x2={22 + i*15} y2="232"/>
          ))}
        </g>

        {/* Дом — корпус */}
        <path d="M150 110 L150 218 L330 218 L330 110 Z" fill={sand} stroke={ink} strokeWidth="1.6" strokeLinejoin="round"/>
        {/* Крыша двускатная */}
        <path d="M134 110 L240 30 L346 110 Z" fill={sandRoof} stroke={ink} strokeWidth="1.6" strokeLinejoin="round"/>
        {/* Конёк-линия */}
        <line x1="240" y1="30" x2="240" y2="110" stroke={ink} strokeWidth="1.2" opacity=".5"/>

        {/* Водостоки/вертикальные пунктиры */}
        <line x1="180" y1="115" x2="180" y2="218" stroke={ink} strokeWidth="1" strokeDasharray="3 4" opacity=".55"/>
        <line x1="300" y1="115" x2="300" y2="218" stroke={ink} strokeWidth="1" strokeDasharray="3 4" opacity=".55"/>

        {/* Левое окно 4-панельное */}
        <g stroke={ink} strokeWidth="1.4" fill="white">
          <rect x="170" y="138" width="40" height="44"/>
          <line x1="190" y1="138" x2="190" y2="182"/>
          <line x1="170" y1="160" x2="210" y2="160"/>
        </g>
        {/* Правое окно 4-панельное */}
        <g stroke={ink} strokeWidth="1.4" fill="white">
          <rect x="270" y="138" width="40" height="44"/>
          <line x1="290" y1="138" x2="290" y2="182"/>
          <line x1="270" y1="160" x2="310" y2="160"/>
        </g>

        {/* Дверь-арка */}
        <path d="M222 218 L222 168 Q222 152 240 152 Q258 152 258 168 L258 218 Z" fill={sandRoof} stroke={ink} strokeWidth="1.4"/>
        <circle cx="252" cy="190" r="1.6" fill={ink}/>

        {/* Размерная лента снизу */}
        <g stroke={ink} strokeWidth="1.2" fill="none">
          <line x1="180" y1="240" x2="300" y2="240"/>
          <path d="M180 235 L172 240 L180 245" />
          <path d="M300 235 L308 240 L300 245" />
        </g>
        <text x="240" y="262" fontFamily="JetBrains Mono, monospace" fontSize="13" fill={dim} textAnchor="middle" letterSpacing=".08em">Ø 14 200 мм</text>

        {/* === Летающие объекты === */}
        {/* лист бумаги 1 — большой, в воздухе слева сверху */}
        <g className="kh-fly-1" style={{ transformOrigin: "60px 60px" }}>
          <g transform="translate(28 28) rotate(-18)">
            <rect x="0" y="0" width="46" height="58" fill="white" stroke={ink} strokeWidth="1.1"/>
            <rect x="0" y="0" width="46" height="58" fill="url(#kh-paper-grid)"/>
            <line x1="6" y1="10" x2="40" y2="10" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="6" y1="16" x2="34" y2="16" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <rect x="6" y="24" width="20" height="14" stroke={ink} strokeWidth=".7" fill="none"/>
            <line x1="6" y1="44" x2="40" y2="44" stroke={ink} strokeWidth=".7" opacity=".4"/>
            <line x1="6" y1="50" x2="30" y2="50" stroke={ink} strokeWidth=".7" opacity=".4"/>
          </g>
        </g>

        {/* лист бумаги 2 — справа сверху */}
        <g className="kh-fly-2" style={{ transformOrigin: "400px 50px" }}>
          <g transform="translate(380 22) rotate(14)">
            <rect x="0" y="0" width="40" height="52" fill="white" stroke={ink} strokeWidth="1.1"/>
            <line x1="5" y1="10" x2="32" y2="10" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="5" y1="16" x2="28" y2="16" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="5" y1="22" x2="34" y2="22" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="5" y1="32" x2="22" y2="32" stroke={ink} strokeWidth=".7" opacity=".4"/>
            <line x1="5" y1="38" x2="32" y2="38" stroke={ink} strokeWidth=".7" opacity=".4"/>
          </g>
        </g>

        {/* лист бумаги 3 — маленький, слева в середине */}
        <g className="kh-fly-3" style={{ transformOrigin: "30px 150px" }}>
          <g transform="translate(8 134) rotate(8)">
            <rect x="0" y="0" width="30" height="38" fill="white" stroke={ink} strokeWidth="1"/>
            <line x1="4" y1="8" x2="24" y2="8" stroke={ink} strokeWidth=".6" opacity=".5"/>
            <line x1="4" y1="14" x2="20" y2="14" stroke={ink} strokeWidth=".6" opacity=".5"/>
            <line x1="4" y1="22" x2="24" y2="22" stroke={ink} strokeWidth=".6" opacity=".4"/>
          </g>
        </g>

        {/* карандаш — справа в середине, наклонён */}
        <g className="kh-fly-4" style={{ transformOrigin: "420px 150px" }}>
          <g transform="translate(394 130) rotate(-32)">
            {/* корпус */}
            <rect x="0" y="0" width="56" height="9" fill="#D8A45C" stroke={ink} strokeWidth=".9"/>
            {/* металлическая обойма */}
            <rect x="56" y="0" width="6" height="9" fill="#B7B7BE" stroke={ink} strokeWidth=".9"/>
            {/* ластик */}
            <rect x="62" y="0" width="6" height="9" fill="#E89B8B" stroke={ink} strokeWidth=".9"/>
            {/* грифель */}
            <path d="M0 0 L-9 4.5 L0 9 Z" fill="#3a3a3a" stroke={ink} strokeWidth=".9"/>
            {/* кончик-ободок */}
            <line x1="-2" y1="2.2" x2="-2" y2="6.8" stroke={ink} strokeWidth=".9"/>
          </g>
        </g>

        {/* линейка-треугольник — внизу слева в воздухе */}
        <g className="kh-fly-5" style={{ transformOrigin: "70px 240px" }}>
          <g transform="translate(36 224) rotate(10)">
            <path d="M0 0 L70 0 L0 38 Z" fill="rgba(212,176,90,.85)" stroke={ink} strokeWidth="1"/>
            {/* деления */}
            {Array.from({length: 13}).map((_,i)=> (
              <line key={i} x1={5+i*5} y1="0" x2={5+i*5} y2={i%5===0?6:3} stroke={ink} strokeWidth=".7"/>
            ))}
          </g>
        </g>

        {/* рулетка — справа внизу */}
        <g className="kh-fly-6" style={{ transformOrigin: "400px 240px" }}>
          <g transform="translate(376 226)">
            <rect x="0" y="0" width="34" height="22" rx="3" fill="#C25842" stroke={ink} strokeWidth="1.1"/>
            <circle cx="11" cy="11" r="6.5" fill="#fff" stroke={ink} strokeWidth=".9"/>
            <circle cx="11" cy="11" r="2" fill={ink}/>
            <rect x="22" y="9" width="22" height="4" fill="#F5E29A" stroke={ink} strokeWidth=".9"/>
            <line x1="26" y1="9" x2="26" y2="13" stroke={ink} strokeWidth=".7"/>
            <line x1="32" y1="9" x2="32" y2="13" stroke={ink} strokeWidth=".7"/>
            <line x1="38" y1="9" x2="38" y2="13" stroke={ink} strokeWidth=".7"/>
          </g>
        </g>

        {/* циркуль — слева внизу */}
        <g className="kh-fly-7" style={{ transformOrigin: "120px 60px" }}>
          <g transform="translate(106 38) rotate(-8)">
            <circle cx="14" cy="0" r="3" fill="#fff" stroke={ink} strokeWidth="1.1"/>
            <line x1="14" y1="2" x2="2" y2="28" stroke={ink} strokeWidth="1.4"/>
            <line x1="14" y1="2" x2="26" y2="28" stroke={ink} strokeWidth="1.4"/>
            <line x1="2" y1="28" x2="0" y2="32" stroke={ink} strokeWidth="1.4"/>
            <line x1="26" y1="28" x2="28" y2="32" stroke={ink} strokeWidth="1.4"/>
          </g>
        </g>

        {/* мини-стикеры/калькулятор */}
        <g className="kh-fly-8" style={{ transformOrigin: "430px 110px" }}>
          <g transform="translate(412 92) rotate(-12)">
            <rect x="0" y="0" width="28" height="34" rx="2" fill="#F2EAD8" stroke={ink} strokeWidth="1"/>
            <rect x="3" y="3" width="22" height="6" fill="#fff" stroke={ink} strokeWidth=".7"/>
            {[0,1,2].map(r => [0,1,2].map(c => (
              <rect key={`${r}-${c}`} x={3+c*8} y={13+r*7} width="6" height="5" fill="#fff" stroke={ink} strokeWidth=".5"/>
            )))}
          </g>
        </g>
      </svg>

      <style>{`
        @keyframes kh-orbit-1 { 0%{transform:translate(0,0) rotate(-18deg)} 50%{transform:translate(8px,-10px) rotate(-12deg)} 100%{transform:translate(0,0) rotate(-18deg)} }
        @keyframes kh-orbit-2 { 0%{transform:translate(0,0) rotate(14deg)} 50%{transform:translate(-10px,8px) rotate(20deg)} 100%{transform:translate(0,0) rotate(14deg)} }
        @keyframes kh-orbit-3 { 0%{transform:translate(0,0) rotate(8deg)} 50%{transform:translate(-6px,-12px) rotate(0deg)} 100%{transform:translate(0,0) rotate(8deg)} }
        @keyframes kh-orbit-4 { 0%{transform:translate(0,0) rotate(-32deg)} 50%{transform:translate(-12px,-6px) rotate(-26deg)} 100%{transform:translate(0,0) rotate(-32deg)} }
        @keyframes kh-orbit-5 { 0%{transform:translate(0,0) rotate(10deg)} 50%{transform:translate(8px,-8px) rotate(4deg)} 100%{transform:translate(0,0) rotate(10deg)} }
        @keyframes kh-orbit-6 { 0%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(-8px,-10px) rotate(-6deg)} 100%{transform:translate(0,0) rotate(0deg)} }
        @keyframes kh-orbit-7 { 0%{transform:translate(0,0) rotate(-8deg)} 50%{transform:translate(10px,8px) rotate(-2deg)} 100%{transform:translate(0,0) rotate(-8deg)} }
        @keyframes kh-orbit-8 { 0%{transform:translate(0,0) rotate(-12deg)} 50%{transform:translate(-6px,10px) rotate(-18deg)} 100%{transform:translate(0,0) rotate(-12deg)} }
        .kh-fly-1{animation:kh-orbit-1 7s ease-in-out infinite}
        .kh-fly-2{animation:kh-orbit-2 8.5s ease-in-out infinite}
        .kh-fly-3{animation:kh-orbit-3 6s ease-in-out infinite .3s}
        .kh-fly-4{animation:kh-orbit-4 9s ease-in-out infinite .6s}
        .kh-fly-5{animation:kh-orbit-5 7.5s ease-in-out infinite .2s}
        .kh-fly-6{animation:kh-orbit-6 8s ease-in-out infinite .9s}
        .kh-fly-7{animation:kh-orbit-7 7.2s ease-in-out infinite .5s}
        .kh-fly-8{animation:kh-orbit-8 9.5s ease-in-out infinite .1s}
        @media (prefers-reduced-motion: reduce){
          .kh-fly-1,.kh-fly-2,.kh-fly-3,.kh-fly-4,.kh-fly-5,.kh-fly-6,.kh-fly-7,.kh-fly-8{animation:none}
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col center" style={{ padding: "40px 32px 44px", alignItems: "center", textAlign: "center" }}>
      <HouseSketch />
      <div className="serif" style={{ fontSize: 28, lineHeight: 1.1, marginTop: 20, marginBottom: 10, letterSpacing:"-0.01em" }}>
        Начните <span className="serif-it" style={{ fontStyle: "italic" }}>с чистого листа</span>
      </div>
      <p style={{ maxWidth: 380, fontSize: 13.5, color: "var(--ink-2)", marginBottom: 20 }}>
        Загрузите коммерческое предложение — распознаем позиции, сопоставим с каталогом KUB·HOUSE и рассчитаем смету. Или добавьте материалы из правой панели.
      </p>
      <div className="row center gap-3" style={{ marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn btn-primary"><Icon name="upload" size={13} /> Загрузить КП</button>
        <button className="btn"><Icon name="cal" size={13} /> Начать по шаблону</button>
        <button className="btn"><Icon name="plus" size={13} /> Добавить строку</button>
      </div>
      <div className="row center gap-2 mono tiny" style={{ color: "var(--ink-4)", letterSpacing: ".08em" }}>
        {["XLSX","PDF","DOCX","CSV"].map(f => (
          <span key={f} style={{ padding: "3px 7px", border: "1px solid var(--rule)", borderRadius: 4 }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

function PositionsHeader() {
  return (
    <div className="row between" style={{ padding: "14px 32px 12px", flexWrap:"wrap", gap:12, alignItems: "flex-end" }}>
      <div className="col gap-2">
        <div className="row center gap-3">
          <span className="serif" style={{ fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Позиции <span className="serif-it" style={{ fontStyle:"italic" }}>сметы</span>
          </span>
          <span className="mono tiny" style={{ color:"var(--ink-4)", padding:"2px 8px", border:"1px solid var(--rule)", borderRadius:99 }}>R3.0</span>
        </div>
        <div className="mono tiny muted" style={{ whiteSpace: "nowrap" }}>
          <b style={{ color:"var(--ink)" }}>0</b> строк
          <span style={{ margin: "0 8px", color:"var(--ink-4)" }}>·</span>
          <b style={{ color:"var(--ink)" }}>0</b> разделов
          <span style={{ margin: "0 8px", color:"var(--ink-4)" }}>·</span>
          итого — <b className="serif" style={{ color:"var(--ink)", fontSize:15 }}>— ₽</b>
        </div>
      </div>
      <div className="row gap-2 center">
        <button className="btn btn-sm"><Icon name="refresh" size={13} /> Обновить цены</button>
        <button className="btn btn-sm"><Icon name="export" size={13} /> Экспорт</button>
      </div>
    </div>
  );
}

function ColumnsHeader() {
  return (
    <div className="row" style={{ padding: "10px 32px", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", color: "var(--ink-4)", background: "var(--paper-2)" }}>
      <div className="mono tiny" style={{ width: 56, letterSpacing: ".08em" }}>#</div>
      <div className="mono tiny" style={{ flex: 1, letterSpacing: ".08em" }}>НАИМЕНОВАНИЕ</div>
      <div className="mono tiny" style={{ width: 64, textAlign: "center", letterSpacing: ".08em" }}>ЕД. ИЗМ.</div>
      <div className="mono tiny" style={{ width: 80, textAlign: "right", letterSpacing: ".08em" }}>КОЛ-ВО</div>
      <div className="mono tiny" style={{ width: 100, textAlign: "right", letterSpacing: ".08em" }}>ЦЕНА, ₽</div>
      <div className="mono tiny" style={{ width: 130, textAlign: "right", letterSpacing: ".08em" }}>ИТОГО, ₽</div>
      <div className="mono tiny" style={{ width: 110, textAlign: "right", letterSpacing: ".08em" }}>ИСТОЧНИК</div>
    </div>
  );
}

function BudgetCard() {
  const items = ["Материалы", "Работы", "Накладные", "НДС 20%"];
  return (
    <div className="frame" style={{ padding:"18px 18px 16px", border:"1px solid var(--rule)", background:"var(--paper-card)", position:"relative" }}>
      <div className="frame-bl" /><div className="frame-br" />
      <div className="eyebrow" style={{ marginBottom:14 }}>Бюджет</div>
      <div className="col" style={{ gap:10 }}>
        {items.map((l,i) => (
          <div key={i} className="row between center" style={{ borderBottom: "1px dashed var(--rule)", paddingBottom:8 }}>
            <span style={{ fontSize:13, color:"var(--ink-2)" }}>{l}</span>
            <span className="mono muted" style={{ fontSize: 13 }}>— ₽</span>
          </div>
        ))}
      </div>
      <div className="row between center" style={{ marginTop:16 }}>
        <span className="serif-it" style={{ fontSize: 22, fontStyle:"italic" }}>Итого</span>
        <span className="serif" style={{ fontSize: 30, letterSpacing: "-0.02em" }}>— <span className="mono tiny muted">₽</span></span>
      </div>
    </div>
  );
}

function PopularMaterials() {
  return (
    <div>
      <div className="row between center" style={{ padding: "0 0 12px" }}>
        <div className="eyebrow">Популярные материалы</div>
        <a className="mono tiny" style={{ color: "var(--ink-3)", letterSpacing: ".06em" }}>открыть каталог →</a>
      </div>
      <div className="col gap-3">
        {POPULAR_MATERIALS.slice(0,4).map((m,i) => (
          <div key={i} className="row center gap-3" style={{
            padding: "8px", border: "1px solid var(--rule)", borderRadius: 10,
            background: "var(--paper-card)"
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 6, background: m.color,
              backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.07) 0 2px, transparent 2px 5px)",
              flexShrink: 0
            }} />
            <div className="col" style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{m.name}</div>
              <div className="mono tiny muted" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {fmt(m.price)} ₽ / {m.unit} <span style={{ color:"var(--ink-4)" }}>·</span> {m.note}
              </div>
            </div>
            <button className="btn btn-icon" style={{ width: 28, height: 28 }}><Icon name="plus" size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryFeed() {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 12 }}>История изменений</div>
      <div className="col gap-3">
        {HISTORY.slice(0,3).map((h, i) => (
          <div key={i} className="row gap-3" style={{ position:"relative", paddingLeft: 14 }}>
            <span style={{
              position:"absolute", left:0, top:6,
              width: 6, height: 6, borderRadius: 99,
              background: h.live ? "var(--rust)" : "var(--ink-4)",
              boxShadow: h.live ? "0 0 0 3px rgba(154,68,34,.15)" : "none"
            }} />
            <div className="col" style={{ gap: 2 }}>
              <div style={{ fontSize: 12, lineHeight: 1.4 }}><b>{h.who}</b> {h.what}</div>
              <div className="mono tiny muted">{h.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RightPanel() {
  return (
    <aside className="col" style={{
      width: 320, padding: "20px 22px 24px", gap: 24,
      borderLeft: "1px solid var(--rule)", background: "var(--paper-2)",
      flexShrink: 0
    }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Бюджет объекта</div>
        <BudgetCard />
      </div>
      <PopularMaterials />
      <HistoryFeed />
    </aside>
  );
}

function StatusBar() {
  return (
    <div className="row between mono tiny" style={{
      padding: "8px 28px", borderTop: "1px solid var(--rule)",
      color: "var(--ink-3)", letterSpacing: ".08em", background: "var(--paper)"
    }}>
      <div className="row gap-3">
        <span>KUB HOUSE</span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span>СМЕТА</span>
        <span>ОБЪЕКТ <b style={{ color: "var(--ink)" }}>EST-0024</b></span>
        <span>РЕВ <b style={{ color: "var(--ink)" }}>R3</b></span>
        <span>284 М² · ДЕРЕВ. КАРКАС</span>
      </div>
      <div className="row gap-3">
        <span>СОЕДИНЕНИЕ <span style={{ color: "var(--moss)" }}>● АКТИВНО</span></span>
        <span>БИЛД 4.2.1</span>
      </div>
    </div>
  );
}

function Workspace({ embedded = false, onTheme, theme }) {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [navActive, setNavActive] = useState("estimates");

  return (
    <div className="col" style={{
      background: "var(--paper)",
      minHeight: "100vh",
      width: "100%",
    }}>
      <TopBar onTheme={onTheme} theme={theme} />
      <div className="row" style={{ flex: 1, minHeight: 0 }}>
        <Sidebar active={navActive} onPick={setNavActive} />
        <main className="col" style={{ flex: 1, minWidth: 0 }}>
          <HeroBlock />
          <Toolbar tab={tab} onTab={setTab} query={query} onQuery={setQuery} />
          <PositionsHeader />
          <ColumnsHeader />
          <EmptyState />
        </main>
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}

Object.assign(window, { Workspace });
KUBHOUSE_EOF_UHT0MD

echo "Done. Review with: git status && git diff"
echo "Then: git add -A && git commit -m 'Kub-House workspace' && git push"
