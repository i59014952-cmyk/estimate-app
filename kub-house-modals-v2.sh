#!/usr/bin/env bash
# Kub-House: модальные окна для всех вкладок сайдбара + календарь со встречами.
# Запуск из корня репозитория estimate-app:
#   bash kub-house-modals-v2.sh
#
# Что делает:
#   1) создаёт components/Modal.jsx, components/SidebarModals.jsx (8 вью)
#   2) создаёт styles-modals.css
#   3) патчит components/Workspace.jsx — обёртывает Sidebar в onPick + рендерит <ModalRoot/>
#   4) патчит index.html — подключает styles-modals.css и оба новых .jsx

set -e

mkdir -p components

# ---------- styles-modals.css ----------
cat > styles-modals.css <<'EOF'
/* === Kub-House: модалки для вкладок сайдбара === */
.kh-backdrop {
  position: fixed; inset: 0;
  background: rgba(20,16,12,.45);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; animation: kh-fade .15s ease-out;
}
@keyframes kh-fade { from { opacity: 0 } to { opacity: 1 } }
.kh-modal {
  width: min(820px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  background: var(--paper, #f7f0e2);
  color: var(--ink, #2a2622);
  border-radius: 18px;
  box-shadow: 0 30px 80px -20px rgba(0,0,0,.4);
  display: flex; flex-direction: column; overflow: hidden;
  animation: kh-pop .2s cubic-bezier(.2,.9,.3,1.2);
  font-family: var(--sans, system-ui);
}
@keyframes kh-pop {
  from { transform: translateY(12px) scale(.96); opacity: 0 }
  to   { transform: translateY(0)   scale(1);   opacity: 1 }
}
.kh-modal__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 22px 26px 18px;
  border-bottom: 1px solid var(--rule, rgba(0,0,0,.08));
}
.kh-modal__title { font-size: 20px; font-weight: 600; }
.kh-modal__sub { font-size: 13px; color: var(--ink-3, #8a7f73); margin-top: 2px; }
.kh-modal__close {
  appearance: none; border: 0; background: transparent;
  width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
  font-size: 22px; color: var(--ink-3, #5a5048); line-height: 1;
}
.kh-modal__close:hover { background: rgba(0,0,0,.06); }
.kh-modal__body { padding: 18px 26px 24px; overflow: auto; flex: 1; }

.kh-list { display: grid; gap: 10px; }
.kh-card {
  border: 1px solid var(--rule, rgba(0,0,0,.08));
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--paper-card, #fffaf0);
  cursor: pointer; transition: border-color .12s, transform .12s;
  position: relative;
}
.kh-card:not(.kh-card--static):hover { border-color: rgba(0,0,0,.25); transform: translateY(-1px); }
.kh-card__title { font-weight: 600; font-size: 15px; }
.kh-card__meta  { font-size: 13px; color: var(--ink-3, #8a7f73); margin-top: 4px; }
.kh-card__total {
  position: absolute; right: 16px; top: 14px;
  font-variant-numeric: tabular-nums; font-weight: 600; font-size: 14px;
}
.kh-pill { padding: 4px 10px; border-radius: 999px; font-size: 11px; background: rgba(0,0,0,.06); color: var(--ink-2, #5a5048); }
.kh-card__pills { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }

.kh-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.kh-table th, .kh-table td {
  text-align: left; padding: 8px 10px;
  border-bottom: 1px solid var(--rule, rgba(0,0,0,.08));
  vertical-align: top;
}
.kh-table th {
  color: var(--ink-3, #8a7f73); font-weight: 500; font-size: 11px;
  text-transform: uppercase; letter-spacing: .1em;
  position: sticky; top: 0; background: var(--paper, #f7f0e2);
}
.kh-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.kh-table tr.section td { background: rgba(0,0,0,.04); font-weight: 600; }

.kh-toolbar { display: flex; gap: 8px; margin-bottom: 14px; align-items: center; }
.kh-toolbar input {
  flex: 1; padding: 8px 12px;
  border: 1px solid var(--rule, rgba(0,0,0,.12));
  border-radius: 10px;
  background: var(--paper-card, #fffaf0);
  font: inherit; color: var(--ink, #2a2622);
}
.kh-back {
  appearance: none; border: 1px solid var(--rule, rgba(0,0,0,.12));
  background: var(--paper-card, #fffaf0);
  padding: 6px 12px; border-radius: 8px; cursor: pointer; font: inherit;
  margin-bottom: 12px; color: var(--ink, #2a2622);
}
.kh-back:hover { background: rgba(0,0,0,.04); }
.kh-section-title { margin: 0 0 6px; font-size: 18px; font-weight: 600; }

/* Calendar */
.kh-cal { display: grid; gap: 14px; }
.kh-cal__head { display: flex; justify-content: space-between; align-items: center; }
.kh-cal__btn {
  appearance: none; border: 1px solid var(--rule, rgba(0,0,0,.12));
  background: var(--paper-card, #fffaf0);
  width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 16px;
  color: var(--ink, #2a2622);
}
.kh-cal__grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.kh-cal__dow {
  text-align: center; font-size: 11px; color: var(--ink-3, #8a7f73);
  padding: 6px 0; text-transform: uppercase; letter-spacing: .1em;
}
.kh-cal__day {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; font-size: 14px; cursor: pointer;
  background: var(--paper-card, #fffaf0); border: 1px solid transparent;
  position: relative;
}
.kh-cal__day:hover { border-color: var(--rule, rgba(0,0,0,.12)); }
.kh-cal__day.is-today { background: var(--ink, #1f1b16); color: var(--paper, #f4ece0); font-weight: 600; }
.kh-cal__day.is-empty { background: transparent; cursor: default; }
.kh-cal__day.has-event::after {
  content: ''; position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: var(--rust, #c08a3e); bottom: 6px; left: 50%; transform: translateX(-50%);
}
.kh-cal__day.is-picked { border-color: var(--rust, #c08a3e); box-shadow: 0 0 0 2px rgba(192,138,62,.25) inset; }

.kh-events {
  margin-top: 4px; padding: 14px 16px;
  background: var(--paper-card, #fffaf0);
  border: 1px solid var(--rule, rgba(0,0,0,.08)); border-radius: 12px;
  display: grid; gap: 10px;
}
.kh-events__head { display: flex; align-items: center; justify-content: space-between; }
.kh-event {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 10px; border-radius: 8px;
  background: var(--paper, #f7f0e2);
}
.kh-event__time { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--ink-2, #5a5048); min-width: 48px; }
.kh-event__title { flex: 1; }
.kh-event__del {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  width: 24px; height: 24px; border-radius: 6px; font-size: 16px; color: var(--ink-3, #8a7f73);
}
.kh-event__del:hover { background: rgba(0,0,0,.06); color: var(--ink, #2a2622); }
.kh-events__form {
  display: grid; grid-template-columns: 100px 1fr auto; gap: 8px; align-items: center;
}
.kh-events__form input {
  padding: 8px 10px; border: 1px solid var(--rule, rgba(0,0,0,.12));
  border-radius: 8px; background: var(--paper, #f7f0e2); font: inherit;
  color: var(--ink, #2a2622);
}
.kh-btn-primary {
  appearance: none; border: 0; cursor: pointer;
  background: var(--ink, #1f1b16); color: var(--paper, #f4ece0);
  padding: 8px 14px; border-radius: 8px; font: inherit; font-weight: 500;
}
.kh-btn-primary:hover { opacity: .9; }

.kh-empty { padding: 24px; text-align: center; color: var(--ink-3, #8a7f73); }
.kh-loading { padding: 40px; text-align: center; color: var(--ink-3, #8a7f73); }
EOF

# ---------- components/Modal.jsx ----------
cat > components/Modal.jsx <<'EOF'
function KHModal({ open, onClose, title, subtitle, children }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="kh-backdrop" onClick={onClose}>
      <div className="kh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kh-modal__head">
          <div>
            <div className="kh-modal__title">{title}</div>
            {subtitle && <div className="kh-modal__sub">{subtitle}</div>}
          </div>
          <button className="kh-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="kh-modal__body">{children}</div>
      </div>
    </div>
  );
}
window.KHModal = KHModal;
EOF

# ---------- components/SidebarModals.jsx ----------
cat > components/SidebarModals.jsx <<'EOF'
// Модальные окна для пунктов сайдбара. Использует window.KH_DATA из data-источника
// или собирает данные из существующих окон (ESTIMATE, OBJECTS, SECTIONS).

const khFmt = (n) => typeof n === 'number'
  ? n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽'
  : (n || '');
const khNum = (n) => typeof n === 'number' ? n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : (n || '');

// === Загрузка JSON-смет (one/two/th) — лениво при первом открытии модалки ===
window.KH_DATA = window.KH_DATA || { ready: false, listeners: [] };
window.KH_DATA.onReady = window.KH_DATA.onReady || ((cb) => {
  if (window.KH_DATA.ready) cb(window.KH_DATA);
  else window.KH_DATA.listeners.push(cb);
});

let khLoadingStarted = false;
function ensureKHLoaded() {
  if (window.KH_DATA.ready || khLoadingStarted) return;
  khLoadingStarted = true;
  (async () => {
    const wrap = (t) => {
      t = t.trim();
      if (t.startsWith('[') || t.startsWith('{')) return t;
      return '[' + t + ']';
    };
    try {
      const [oneTxt, twoTxt, thTxt] = await Promise.all([
        fetch('one.json').then(r => r.text()),
        fetch('two.json').then(r => r.text()),
        fetch('th.json').then(r => r.text()),
      ]);
      const one = JSON.parse(wrap(oneTxt));
      const two = JSON.parse(wrap(twoTxt));
      const th  = JSON.parse(thTxt);

      // ONE → Николина Гора
      const oneRows = [];
      for (const r of one) {
        if (!r) continue;
        const name = r['МО, Одинцовский район, п. Николина Гора, проспект Шмидта'];
        if (!name || typeof name !== 'string' || name === 'Наименование работ') continue;
        oneRows.push({
          n: r['Объект: '], name,
          unit: r.Column3 || '',
          qty: r.Column4 ?? '',
          price: typeof r.Column5 === 'number' ? r.Column5 : (typeof r.Column6 === 'number' ? r.Column6 : ''),
          total: r.Column8 ?? '',
        });
      }
      const oneTotal = oneRows.reduce((s, r) => s + (typeof r.total === 'number' ? r.total : 0), 0);

      // TWO → Нарынка
      const twoRows = []; let curSection = '';
      for (const r of two) {
        if (!r || r.Column1 === '№№ п/п') continue;
        const c2 = r.Column2;
        if (c2 && r.Column8 != null && r.Column3 == null && r.Column4 == null && r.Column1 == null) {
          curSection = c2; twoRows.push({ isHeader: true, section: c2, total: r.Column8 }); continue;
        }
        if (c2 && r.Column3 != null) {
          twoRows.push({
            section: curSection, n: r.Column1, name: c2, unit: r.Column3,
            qty: r.Column4 ?? '',
            price: typeof r.Column5 === 'number' ? r.Column5 : (typeof r.Column6 === 'number' ? r.Column6 : ''),
            total: r.Column8 ?? '',
          });
        }
      }
      const twoTotal = twoRows.filter(r => r.isHeader).reduce((s, r) => s + (typeof r.total === 'number' ? r.total : 0), 0);

      // TH → Завидово
      const thSummary = (th['сводная'] || []).filter(r => r && r['Наименование']);
      const thSectionKeys = Object.keys(th).filter(k => k !== 'сводная');
      const thSections = thSectionKeys.map(k => {
        const arr = th[k] || []; const rows = []; let header = '';
        for (let i = 0; i < arr.length; i++) {
          const r = arr[i]; if (!r) continue;
          if (i === 6 && r.Column1 && !r.Column2) header = r.Column1;
          if (r.Column1 === '№№ п/п') continue;
          const c2 = r.Column2;
          if (c2 && r.Column3 != null && (r.Column4 != null || r.Column10 != null)) {
            rows.push({
              n: r.Column1, name: c2, unit: r.Column3,
              qty: r.Column4 ?? '',
              price: typeof r.Column5 === 'number' ? r.Column5 : (typeof r.Column7 === 'number' ? r.Column7 : ''),
              total: r.Column10 ?? '',
            });
          } else if (c2 && r.Column10 != null) {
            rows.push({ isHeader: true, section: c2, total: r.Column10 });
          }
        }
        const total = rows.reduce((s, r) => s + (r.isHeader ? 0 : (typeof r.total === 'number' ? r.total : 0)), 0);
        return { key: k, header, rows, total };
      });

      const estimates = [
        { id: 'est-1', title: 'Смета №1 — Николина Гора', object: 'Николина Гора',
          address: 'МО, Одинцовский р-н, пр. Шмидта', date: '31.10.2025', total: oneTotal,
          type: 'flat', rows: oneRows },
        { id: 'est-2', title: 'Смета №2 — Инженерные системы', object: 'Нарынка',
          address: 'МО, г.о. Клин, п. Нарынка', date: '02.09.2024', total: twoTotal,
          type: 'flat', rows: twoRows },
        { id: 'est-3', title: 'Смета №3 — Завидово', object: 'Завидово',
          address: 'Тверская обл.', date: '02.09.2024',
          total: thSummary.find(r => r['Наименование'] === 'Итого:')?.['сумма'] || 0,
          type: 'multi', summary: thSummary, sections: thSections },
      ];
      const objects = [
        { id: 'nikolina', name: 'Николина Гора', address: 'МО, пр. Шмидта',  date: '31.10.2025', total: oneTotal, stage: 'Фундамент' },
        { id: 'narynka',  name: 'Нарынка',       address: 'МО, г.о. Клин',   date: '02.09.2024', total: twoTotal, stage: 'Инженерия' },
        { id: 'zavidovo', name: 'Завидово',      address: 'Тверская обл.',   date: '02.09.2024', total: estimates[2].total, stage: 'CLT' },
      ];

      // Материалы
      const matSet = new Map();
      const pushMat = (name, unit, price) => {
        if (!name || typeof price !== 'number' || price <= 0) return;
        const k = name.trim().toLowerCase();
        if (!matSet.has(k)) matSet.set(k, { name: name.trim(), unit: unit || '', price });
      };
      oneRows.forEach(r => { if (typeof r.price === 'number' && r.unit) pushMat(r.name, r.unit, r.price); });
      twoRows.forEach(r => { if (!r.isHeader && typeof r.price === 'number') pushMat(r.name, r.unit, r.price); });
      thSections.forEach(s => s.rows.forEach(r => { if (!r.isHeader && typeof r.price === 'number') pushMat(r.name, r.unit, r.price); }));
      const materials = [...matSet.values()].sort((a, b) => b.price - a.price);

      // Подрядчики (бренды)
      const re = /(STOUT|Valtec|Giacomini|Технониколь|Ostendorf|REHAU|Rehau|Arbonia|Kermi|Varmann|Energoflex|Viega|Flamco|OVENTROP|Porotherm|Hard-Fix|Sormat|Penosil|DELTA|Woodmaster|Rothoblaas|Skolan|Henco|Wirsbo|Uponor|Knauf|ROCKWOOL|Rockwool|ISOVER|TECHNO|Tece)/i;
      const brands = new Set();
      materials.forEach(m => { const mt = m.name.match(re); if (mt) brands.add(mt[0].toUpperCase()); });
      const types = ['Поставщик', 'Бригада', 'Субподрядчик'];
      const contractors = [...brands].map((b, i) => ({
        id: i + 1, name: b, type: types[i % types.length],
        rating: (4 + ((i * 13) % 9) / 10).toFixed(1),
        projects: ((i * 7) % 11) + 1,
      }));

      // Работы
      const wSet = new Set(); const works = [];
      const pushWork = (r) => {
        if (!r.name || !r.unit) return;
        const k = r.name.trim().toLowerCase();
        if (!wSet.has(k)) { wSet.add(k); works.push({ name: r.name.trim(), unit: r.unit, price: typeof r.price === 'number' ? r.price : '' }); }
      };
      oneRows.forEach(r => { if (typeof r.qty === 'number') pushWork(r); });
      twoRows.forEach(r => { if (!r.isHeader && typeof r.qty === 'number') pushWork(r); });
      thSections.forEach(s => s.rows.forEach(r => { if (!r.isHeader && typeof r.qty === 'number') pushWork(r); }));

      const norms = thSummary.filter(r => r['№п/п']).map(r => ({ id: r['№п/п'], name: r['Наименование'], sum: r['сумма'] }));
      const templates = [
        { id: 't1', name: 'Фундаментная плита ФП-1', unit: 'м³',     basePrice: 28600 },
        { id: 't2', name: 'Кладка стен Porotherm 44', unit: 'м³',    basePrice: 13000 },
        { id: 't3', name: 'Монтаж CLT-панелей',       unit: 'м³',    basePrice: 21400 },
        { id: 't4', name: 'Радиаторное отопление',    unit: 'компл', basePrice: 18300 },
        { id: 't5', name: 'Канализация Skolan',       unit: 'м.п.',  basePrice: 1200 },
        { id: 't6', name: 'Тёплый пол PEX 16',        unit: 'м.п.',  basePrice: 210 },
      ];

      Object.assign(window.KH_DATA, {
        ready: true,
        estimates, objects, materials, contractors, works, norms, templates,
      });
      window.KH_DATA.listeners.forEach(cb => cb(window.KH_DATA));
    } catch (e) {
      console.error('KH_DATA fetch error', e);
      window.KH_DATA.error = e.message;
      window.KH_DATA.ready = true;
      window.KH_DATA.estimates = [];
      window.KH_DATA.objects = [];
      window.KH_DATA.materials = [];
      window.KH_DATA.contractors = [];
      window.KH_DATA.works = [];
      window.KH_DATA.norms = [];
      window.KH_DATA.templates = [];
      window.KH_DATA.listeners.forEach(cb => cb(window.KH_DATA));
    }
  })();
}

function useKHData() {
  React.useEffect(ensureKHLoaded, []);
  const [d, setD] = React.useState(window.KH_DATA.ready ? window.KH_DATA : null);
  React.useEffect(() => {
    if (!d) window.KH_DATA.onReady(setD);
  }, []);
  return d;
}

// ---------- Сметы ----------
function KHEstimatesView() {
  const data = useKHData();
  const [openedId, setOpenedId] = React.useState(null);
  const [openedSection, setOpenedSection] = React.useState(null);
  if (!data) return <div className="kh-loading">Загрузка данных…</div>;

  if (openedId) {
    const est = data.estimates.find(e => e.id === openedId);
    if (!est) return <div className="kh-empty">Смета не найдена</div>;
    if (est.type === 'multi' && !openedSection) {
      return (
        <div>
          <button className="kh-back" onClick={() => setOpenedId(null)}>← Назад к списку</button>
          <h3 className="kh-section-title">{est.title}</h3>
          <div className="kh-card__meta" style={{marginBottom:14}}>{est.address} · {est.date} · итого {khFmt(est.total)}</div>
          <div className="kh-list">
            {est.sections.map(sec => (
              <div key={sec.key} className="kh-card" onClick={() => setOpenedSection(sec.key)}>
                <div className="kh-card__total">{khFmt(sec.total)}</div>
                <div className="kh-card__title">{sec.header || sec.key}</div>
                <div className="kh-card__meta">{sec.rows.filter(r => !r.isHeader).length} позиций</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    let rows, title;
    if (est.type === 'multi') {
      const sec = est.sections.find(s => s.key === openedSection);
      rows = sec.rows; title = sec.header || sec.key;
    } else { rows = est.rows; title = est.title; }
    return (
      <div>
        <button className="kh-back" onClick={() => est.type === 'multi' ? setOpenedSection(null) : setOpenedId(null)}>← Назад</button>
        <h3 className="kh-section-title">{title}</h3>
        <div className="kh-card__meta" style={{marginBottom:14}}>{est.address} · {est.date}</div>
        <table className="kh-table">
          <thead><tr><th>№</th><th>Наименование</th><th>Ед.</th><th className="num">Кол-во</th><th className="num">Цена</th><th className="num">Сумма</th></tr></thead>
          <tbody>{rows.slice(0, 400).map((r, i) => r.isHeader
            ? <tr key={i} className="section"><td colSpan="5">{r.section}</td><td className="num">{khFmt(r.total)}</td></tr>
            : <tr key={i}><td>{r.n||''}</td><td>{r.name}</td><td>{r.unit}</td><td className="num">{khNum(r.qty)}</td><td className="num">{khFmt(r.price)}</td><td className="num">{khFmt(r.total)}</td></tr>
          )}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="kh-list">
      {data.estimates.map(e => (
        <div key={e.id} className="kh-card" onClick={() => setOpenedId(e.id)}>
          <div className="kh-card__total">{khFmt(e.total)}</div>
          <div className="kh-card__title">{e.title}</div>
          <div className="kh-card__meta">{e.address}</div>
          <div className="kh-card__pills">
            <span className="kh-pill">{e.date}</span>
            <span className="kh-pill">{e.type === 'multi' ? `${e.sections.length} разделов` : `${e.rows.filter(r => !r.isHeader).length} позиций`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Объекты ----------
function KHObjectsView() {
  const data = useKHData();
  if (!data) return <div className="kh-loading">Загрузка…</div>;
  return (
    <div className="kh-list">
      {data.objects.map(o => (
        <div key={o.id} className="kh-card kh-card--static">
          <div className="kh-card__total">{khFmt(o.total)}</div>
          <div className="kh-card__title">{o.name}</div>
          <div className="kh-card__meta">{o.address}</div>
          <div className="kh-card__pills">
            <span className="kh-pill">{o.stage}</span>
            <span className="kh-pill">{o.date}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Материалы ----------
function KHMaterialsView() {
  const data = useKHData();
  const [q, setQ] = React.useState('');
  if (!data) return <div className="kh-loading">Загрузка…</div>;
  const list = data.materials.filter(m => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <div>
      <div className="kh-toolbar"><input placeholder={`Поиск среди ${data.materials.length} материалов`} value={q} onChange={e => setQ(e.target.value)}/></div>
      <table className="kh-table">
        <thead><tr><th>Наименование</th><th>Ед.</th><th className="num">Цена</th></tr></thead>
        <tbody>{list.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.unit}</td><td className="num">{khFmt(m.price)}</td></tr>)}</tbody>
      </table>
      {!list.length && <div className="kh-empty">Ничего не найдено</div>}
    </div>
  );
}

// ---------- Подрядчики ----------
function KHContractorsView() {
  const data = useKHData();
  if (!data) return <div className="kh-loading">Загрузка…</div>;
  if (!data.contractors.length) return <div className="kh-empty">Подрядчики не найдены</div>;
  return (
    <div className="kh-list">
      {data.contractors.map(c => (
        <div key={c.id} className="kh-card kh-card--static">
          <div className="kh-card__total">★ {c.rating}</div>
          <div className="kh-card__title">{c.name}</div>
          <div className="kh-card__meta">{c.type} · проектов: {c.projects}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Календарь со встречами (localStorage) ----------
const KH_EVENTS_KEY = 'kh.calendar.events.v1';
const khLoadEvents = () => { try { return JSON.parse(localStorage.getItem(KH_EVENTS_KEY) || '[]'); } catch { return []; } };
const khSaveEvents = (l) => localStorage.setItem(KH_EVENTS_KEY, JSON.stringify(l));
const khDateKey = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

function KHCalendarView() {
  const today = new Date();
  const [cur, setCur] = React.useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = React.useState(khLoadEvents);
  const [picked, setPicked] = React.useState(null);
  const [draft, setDraft] = React.useState({ time: '10:00', title: '' });
  const year = cur.getFullYear(), month = cur.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const dows = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const hasEvents = (d) => events.some(e => e.date === khDateKey(year, month, d));
  const dayEvents = picked ? events.filter(e => e.date === picked).sort((a,b)=>a.time.localeCompare(b.time)) : [];
  const persist = (n) => { setEvents(n); khSaveEvents(n); };
  const addEvent = () => {
    if (!picked || !draft.title.trim()) return;
    persist([...events, { id: Date.now(), date: picked, time: draft.time, title: draft.title.trim() }]);
    setDraft({ time: draft.time, title: '' });
  };
  const formatPicked = () => {
    if (!picked) return '';
    const [y, m, d] = picked.split('-').map(Number);
    return `${d} ${months[m-1].toLowerCase()} ${y}`;
  };
  return (
    <div className="kh-cal">
      <div className="kh-cal__head">
        <button className="kh-cal__btn" onClick={() => setCur(new Date(year, month - 1, 1))}>‹</button>
        <div style={{fontWeight:600,fontSize:16}}>{months[month]} {year}</div>
        <button className="kh-cal__btn" onClick={() => setCur(new Date(year, month + 1, 1))}>›</button>
      </div>
      <div className="kh-cal__grid">
        {dows.map(d => <div key={d} className="kh-cal__dow">{d}</div>)}
        {cells.map((d, i) => {
          const key = d ? khDateKey(year, month, d) : null;
          return (
            <div key={i} onClick={() => d && setPicked(key)}
                 className={'kh-cal__day'
                   + (d == null ? ' is-empty' : '')
                   + (d && isToday(d) ? ' is-today' : '')
                   + (d && hasEvents(d) ? ' has-event' : '')
                   + (key && key === picked ? ' is-picked' : '')}>{d || ''}</div>
          );
        })}
      </div>
      {picked && (
        <div className="kh-events">
          <div className="kh-events__head">
            <div style={{fontWeight:600}}>Встречи · {formatPicked()}</div>
            <button className="kh-modal__close" onClick={() => setPicked(null)}>×</button>
          </div>
          {dayEvents.length === 0 && <div className="kh-empty" style={{padding:'10px 0'}}>Встреч пока нет</div>}
          {dayEvents.map(e => (
            <div key={e.id} className="kh-event">
              <span className="kh-event__time">{e.time}</span>
              <span className="kh-event__title">{e.title}</span>
              <button className="kh-event__del" onClick={() => persist(events.filter(x => x.id !== e.id))}>×</button>
            </div>
          ))}
          <div className="kh-events__form">
            <input type="time" value={draft.time} onChange={e => setDraft({...draft, time: e.target.value})}/>
            <input type="text" placeholder="Тема встречи" value={draft.title}
                   onChange={e => setDraft({...draft, title: e.target.value})}
                   onKeyDown={e => { if (e.key === 'Enter') addEvent(); }}/>
            <button className="kh-btn-primary" onClick={addEvent}>Добавить</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Работы ----------
function KHWorksView() {
  const data = useKHData();
  const [q, setQ] = React.useState('');
  if (!data) return <div className="kh-loading">Загрузка…</div>;
  const list = data.works.filter(w => w.name.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <div>
      <div className="kh-toolbar"><input placeholder={`Поиск среди ${data.works.length} работ`} value={q} onChange={e => setQ(e.target.value)}/></div>
      <table className="kh-table">
        <thead><tr><th>Работа</th><th>Ед.</th><th className="num">Расценка</th></tr></thead>
        <tbody>{list.map((w, i) => <tr key={i}><td>{w.name}</td><td>{w.unit}</td><td className="num">{khFmt(w.price)}</td></tr>)}</tbody>
      </table>
      {!list.length && <div className="kh-empty">Ничего не найдено</div>}
    </div>
  );
}

// ---------- Нормативы ----------
function KHNormsView() {
  const data = useKHData();
  if (!data) return <div className="kh-loading">Загрузка…</div>;
  return (
    <table className="kh-table">
      <thead><tr><th>№</th><th>Раздел</th><th className="num">Сумма</th></tr></thead>
      <tbody>{data.norms.map(n => <tr key={n.id}><td>{n.id}</td><td>{n.name}</td><td className="num">{khFmt(n.sum)}</td></tr>)}</tbody>
    </table>
  );
}

// ---------- Шаблоны ----------
function KHTemplatesView() {
  const data = useKHData();
  if (!data) return <div className="kh-loading">Загрузка…</div>;
  return (
    <div className="kh-list">
      {data.templates.map(t => (
        <div key={t.id} className="kh-card kh-card--static">
          <div className="kh-card__total">{khFmt(t.basePrice)} / {t.unit}</div>
          <div className="kh-card__title">{t.name}</div>
        </div>
      ))}
    </div>
  );
}

const KH_VIEWS = {
  estimates:   { title: 'Сметы',      sub: 'Список смет по объектам', comp: KHEstimatesView },
  objects:     { title: 'Объекты',    sub: 'Активные объекты',        comp: KHObjectsView },
  materials:   { title: 'Материалы',  sub: 'Справочник материалов',   comp: KHMaterialsView },
  contractors: { title: 'Подрядчики', sub: 'Поставщики и бригады',    comp: KHContractorsView },
  calendar:    { title: 'Календарь',  sub: 'События и встречи',       comp: KHCalendarView },
  works:       { title: 'Работы',     sub: 'Расценки',                comp: KHWorksView },
  norms:       { title: 'Нормативы',  sub: 'Разделы сводной сметы',   comp: KHNormsView },
  templates:   { title: 'Шаблоны',    sub: 'Типовые позиции',         comp: KHTemplatesView },
};

function KHModalRoot({ activeId, onClose }) {
  const view = activeId ? KH_VIEWS[activeId] : null;
  const C = view ? view.comp : null;
  return (
    <KHModal open={!!activeId} onClose={onClose} title={view?.title} subtitle={view?.sub}>
      {C && <C />}
    </KHModal>
  );
}

window.KH_VIEWS = KH_VIEWS;
window.KHModalRoot = KHModalRoot;
EOF

# ---------- Patch index.html ----------
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('index.html')
s = p.read_text()

# 1) подключить styles-modals.css
if 'styles-modals.css' not in s:
    s = s.replace(
        '<link rel="stylesheet" href="styles.css"/>',
        '<link rel="stylesheet" href="styles.css"/>\n<link rel="stylesheet" href="styles-modals.css"/>'
    )

# 2) подключить два .jsx после Workspace.jsx
if 'components/Modal.jsx' not in s:
    s = s.replace(
        '<script type="text/babel" src="components/Workspace.jsx"></script>',
        '<script type="text/babel" src="components/Workspace.jsx"></script>\n'
        '<script type="text/babel" src="components/Modal.jsx"></script>\n'
        '<script type="text/babel" src="components/SidebarModals.jsx"></script>'
    )

p.write_text(s)
print('index.html patched')
PY

# ---------- Patch components/Workspace.jsx ----------
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('components/Workspace.jsx')
s = p.read_text()

# 1) В функции Workspace добавить состояние модалки и рендер <KHModalRoot/>.
#    Находим: const [navActive, setNavActive] = useState("estimates");
if 'khModalTab' not in s:
    s = s.replace(
        'const [navActive, setNavActive] = useState("estimates");',
        'const [navActive, setNavActive] = useState("estimates");\n  const [khModalTab, setKhModalTab] = useState(null);'
    )
    # 2) Заменим onPick={setNavActive} → открывает модалку
    s = s.replace(
        '<Sidebar active={navActive} onPick={setNavActive} />',
        '<Sidebar active={navActive} onPick={(id) => { setNavActive(id); setKhModalTab(id); }} />'
    )
    # 3) Перед закрытием <StatusToast .../> вставим KHModalRoot
    s = s.replace(
        '<StatusToast status={est.state.status} />',
        '<StatusToast status={est.state.status} />\n      <KHModalRoot activeId={khModalTab} onClose={() => setKhModalTab(null)} />'
    )

p.write_text(s)
print('Workspace.jsx patched')
PY

echo ""
echo "✅ Готово. Запушьте:"
echo "   git add -A && git commit -m 'sidebar modals + calendar with events' && git push"
echo ""
echo "Что изменилось:"
echo "  + styles-modals.css"
echo "  + components/Modal.jsx"
echo "  + components/SidebarModals.jsx"
echo "  ~ index.html (подключены 2 новых ресурса)"
echo "  ~ components/Workspace.jsx (Sidebar.onPick → открывает модалку)"
