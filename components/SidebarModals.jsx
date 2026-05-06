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
const KH_OBJECTS_KEY = 'kh-objects-v1';
const KH_OBJECTS_SEEDED_KEY = 'kh-objects-seeded-v2';
window.KH_OBJECT_FILES = window.KH_OBJECT_FILES || new Map();
const khLoadObjects = () => { try { return JSON.parse(localStorage.getItem(KH_OBJECTS_KEY) || '[]'); } catch { return []; } };
const khSaveObjectsLocal = (l) => { try { localStorage.setItem(KH_OBJECTS_KEY, JSON.stringify(l)); window.dispatchEvent(new Event('kh-storage')); } catch {} };
const khSaveObjects = (l) => {
  khSaveObjectsLocal(l);
  if (window.SB) {
    const cleaned = l.map(o => ({
      id: String(o.id), name: o.name || '', address: o.address || '',
      area: o.area === '' || o.area == null ? null : Number(o.area),
      stage: o.stage || '', date: o.date || '',
      budget: o.budget === '' || o.budget == null ? null : Number(o.budget),
      client: o.client || '', note: o.note || '',
      status: o.status || 'active',
      files: o.files || [],
    }));
    if (cleaned.length) window.SB.upsert('kh_objects', cleaned, 'id').catch(e => console.warn('cloud objects:', e));
  }
};

const KH_OBJECTS_SEED = [
  {
    name: 'Резиденция «Сосны»',
    address: 'МО, Одинцовский р-н, КП «Николина Гора»',
    area: 284, stage: 'Фундамент', date: '24.04.2026',
    budget: 18_500_000,
    client: 'А. Меньшов',
    status: 'active',
    note: 'Каркасный дом из клеёного бруса, 2 этажа, эксплуатируемая кровля. Готовность ~25%.',
  },
  {
    name: 'Дом у озера',
    address: 'Тверская обл., Завидово',
    area: 412, stage: 'CLT-монтаж', date: '02.09.2025',
    budget: 26_900_000,
    client: 'Д. Ковров',
    status: 'active',
    note: 'CLT-панели Segezha + терраса 96 м². Сдача — Q3 2026.',
  },
  {
    name: 'Шале «Берёзовая»',
    address: 'МО, Дмитровский р-н, КП «Берёзовая роща»',
    area: 168, stage: 'Сдан', date: '15.10.2024',
    budget: 11_400_000,
    client: 'И. Соколов',
    status: 'completed',
    note: 'Каркасный дом из КДК, 1.5 этажа. Подписаны акты КС-2/КС-3, гарантия — до 2026.',
  },
];

function khSeedObjectsIfNeeded(current) {
  if (localStorage.getItem(KH_OBJECTS_SEEDED_KEY)) return current;
  const patched = current.map(o => o.status ? o : { ...o, status: 'active' });
  const existing = new Set(patched.map(o => (o.name || '').trim().toLowerCase()));
  const fresh = KH_OBJECTS_SEED
    .filter(o => !existing.has(o.name.trim().toLowerCase()))
    .map((o, i) => ({ id: 'seed-obj-' + i + '-' + Date.now(), files: [], ...o }));
  const next = [...fresh, ...patched];
  khSaveObjects(next);
  try { localStorage.setItem(KH_OBJECTS_SEEDED_KEY, '1'); } catch {}
  return next;
}

function KHObjectsView() {
  const [list, setList] = React.useState(() => khSeedObjectsIfNeeded(khLoadObjects()));
  const [tab, setTab] = React.useState('active');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const [draft, setDraft] = React.useState(emptyObjDraft());
  const [, force] = React.useReducer(x => x + 1, 0);

  const persist = (next) => { setList(next); khSaveObjects(next); };

  const counts = {
    active: list.filter(o => (o.status || 'active') === 'active').length,
    completed: list.filter(o => o.status === 'completed').length,
  };
  const filtered = list.filter(o => (o.status || 'active') === tab);

  const setStatus = (id, status) => persist(list.map(o => o.id === id ? { ...o, status } : o));

  const startAdd = () => { setDraft(emptyObjDraft()); setEditingId(null); setFormOpen(true); };
  const startEdit = (o) => {
    setDraft({
      name: o.name || '', address: o.address || '', area: o.area ?? '',
      stage: o.stage || '', date: o.date || '', budget: o.budget ?? '',
      client: o.client || '', note: o.note || '', status: o.status || 'active',
    });
    setEditingId(o.id); setFormOpen(true);
  };
  const cancelForm = () => { setFormOpen(false); setEditingId(null); };

  const submitForm = (e) => {
    if (e) e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    const fields = {
      name, address: draft.address.trim(),
      area: draft.area === '' ? '' : Number(draft.area) || '',
      stage: draft.stage.trim(), date: draft.date.trim(),
      budget: draft.budget === '' ? '' : Number(draft.budget) || '',
      client: draft.client.trim(), note: draft.note.trim(),
      status: draft.status || 'active',
    };
    if (editingId) {
      persist(list.map(o => o.id === editingId ? { ...o, ...fields } : o));
    } else {
      persist([{ id: 'o-' + Date.now(), files: [], ...fields }, ...list]);
    }
    cancelForm();
  };

  const removeOne = (id) => {
    if (!confirm('Удалить объект?')) return;
    persist(list.filter(o => o.id !== id));
    window.KH_OBJECT_FILES.delete(id);
    if (window.SB) window.SB.remove('kh_objects', `id=eq.${encodeURIComponent(id)}`).catch(e => console.warn('cloud objects del:', e));
  };

  React.useEffect(() => {
    if (!window.SB) return;
    let cancelled = false;
    window.SB.selectAll('kh_objects', 'order=updated_at.desc').then(remote => {
      if (cancelled || !Array.isArray(remote)) return;
      if (remote.length) {
        setList(remote);
        khSaveObjectsLocal(remote);
      } else {
        const local = khLoadObjects();
        if (local.length) khSaveObjects(local);
      }
    }).catch(e => console.warn('cloud load objects:', e));
    return () => { cancelled = true; };
  }, []);

  const attachFiles = (id) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const cur = window.KH_OBJECT_FILES.get(id) || [];
      window.KH_OBJECT_FILES.set(id, [...cur, ...files]);
      const meta = files.map(f => ({ name: f.name, size: f.size, time: Date.now() }));
      persist(list.map(o => o.id === id ? { ...o, files: [...(o.files || []), ...meta] } : o));
      force();
    };
    input.click();
  };

  const removeFile = (objId, idx) => {
    const cur = window.KH_OBJECT_FILES.get(objId) || [];
    if (cur[idx]) {
      const next = cur.slice(); next.splice(idx, 1);
      window.KH_OBJECT_FILES.set(objId, next);
    }
    persist(list.map(o => {
      if (o.id !== objId) return o;
      const f = (o.files || []).slice(); f.splice(idx, 1);
      return { ...o, files: f };
    }));
  };

  const downloadFile = (objId, idx) => {
    const cur = window.KH_OBJECT_FILES.get(objId) || [];
    const f = cur[idx];
    if (!f) { alert('Файл был прикреплён в прошлой сессии и сейчас недоступен. Прикрепите его заново.'); return; }
    const a = document.createElement('a');
    const href = URL.createObjectURL(f);
    a.href = href; a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 8000);
  };

  const sizeLabel = (n) => !n ? '' : n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;

  const ObjTab = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 14px', border: 'none', borderBottom: '2px solid ' + (tab === id ? 'var(--ink)' : 'transparent'),
        background: 'transparent', color: tab === id ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: tab === id ? 600 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--sans)',
      }}
    >{label} <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}>· {counts[id]}</span></button>
  );

  return (
    <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        <ObjTab id="active" label="Активные" />
        <ObjTab id="completed" label="Завершённые" />
        {!formOpen && <button className="kh-btn-primary" onClick={startAdd} style={{ marginLeft: 'auto', marginBottom: 6 }}>+ Добавить объект</button>}
      </div>

      {formOpen && (
        <form onSubmit={submitForm}
          className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, border: '1px solid var(--moss)', background: 'var(--paper-card)' }}>
          <div style={{ fontWeight: 600 }}>{editingId ? 'Редактировать объект' : 'Новый объект'}</div>
          <input autoFocus placeholder="Название" value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })} style={khInputStyle()} />
          <input placeholder="Адрес" value={draft.address}
            onChange={e => setDraft({ ...draft, address: e.target.value })} style={khInputStyle()} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Площадь, м²" type="number" value={draft.area}
              onChange={e => setDraft({ ...draft, area: e.target.value })} style={{ ...khInputStyle(), width: 140 }} />
            <input placeholder="Этап (Фундамент / CLT-монтаж / Отделка…)" value={draft.stage}
              onChange={e => setDraft({ ...draft, stage: e.target.value })} style={{ ...khInputStyle(), flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Дата (24.04.2026)" value={draft.date}
              onChange={e => setDraft({ ...draft, date: e.target.value })} style={{ ...khInputStyle(), width: 160 }} />
            <input placeholder="Бюджет, ₽" type="number" value={draft.budget}
              onChange={e => setDraft({ ...draft, budget: e.target.value })} style={{ ...khInputStyle(), flex: 1 }} />
          </div>
          <input placeholder="Заказчик" value={draft.client}
            onChange={e => setDraft({ ...draft, client: e.target.value })} style={khInputStyle()} />
          <textarea placeholder="Описание / комментарий" value={draft.note}
            onChange={e => setDraft({ ...draft, note: e.target.value })}
            rows={3} style={{ ...khInputStyle(), resize: 'vertical' }} />
          <select value={draft.status || 'active'} onChange={e => setDraft({ ...draft, status: e.target.value })} style={khInputStyle()}>
            <option value="active">Активный</option>
            <option value="completed">Завершённый</option>
          </select>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm" onClick={cancelForm}>Отмена</button>
            <button type="submit" className="kh-btn-primary" disabled={!draft.name.trim()}>
              {editingId ? 'Сохранить изменения' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 && !formOpen && (
        <div className="kh-empty" style={{ padding: 16 }}>
          {tab === 'active' ? 'Активных объектов нет' : 'Завершённых объектов нет'} — нажмите «+ Добавить объект».
        </div>
      )}

      <div className="kh-list">
        {filtered.map(o => {
          const filesInMem = window.KH_OBJECT_FILES.get(o.id) || [];
          const filesMeta = o.files || [];
          return (
            <div key={o.id} className="kh-card kh-card--static" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kh-card__title">{o.name}</div>
                  {o.address && <div className="kh-card__meta">{o.address}</div>}
                  <div className="kh-card__pills" style={{ marginTop: 6 }}>
                    {o.stage && <span className="kh-pill">{o.stage}</span>}
                    {o.area && <span className="kh-pill">{o.area} м²</span>}
                    {o.date && <span className="kh-pill">{o.date}</span>}
                    {o.client && <span className="kh-pill">{o.client}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm" onClick={() => startEdit(o)} title="Редактировать">✎</button>
                    <button className="btn btn-sm" style={{ color: 'var(--rust)' }} onClick={() => removeOne(o.id)} title="Удалить">×</button>
                  </div>
                  {o.budget ? (
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
                      {khFmt(o.budget)}
                    </div>
                  ) : null}
                </div>
              </div>
              {o.note && <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{o.note}</div>}
              {filesMeta.length > 0 && (
                <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filesMeta.map((f, i) => {
                    const inMem = filesInMem[i];
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                        border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--paper)' }}>
                        <span style={{ flex: 1, fontSize: 12, color: inMem ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                          📎 {f.name}{f.size ? ' · ' + sizeLabel(f.size) : ''}{!inMem ? ' (нужно прикрепить заново)' : ''}
                        </span>
                        {inMem && <button className="btn btn-sm" onClick={() => downloadFile(o.id, i)} title="Скачать">↓</button>}
                        <button className="btn btn-sm" style={{ color: 'var(--rust)' }} onClick={() => removeFile(o.id, i)} title="Убрать">×</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={() => attachFiles(o.id)}>+ Прикрепить файлы</button>
                {(o.status || 'active') === 'active'
                  ? <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setStatus(o.id, 'completed')}>✓ Завершить</button>
                  : <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setStatus(o.id, 'active')}>↶ В активные</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function emptyObjDraft() {
  return { name: '', address: '', area: '', stage: '', date: '', budget: '', client: '', note: '', status: 'active' };
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
const KH_CONTRACTORS_KEY = 'kh-contractors-v1';
const KH_SEEDED_KEY = 'kh-contractors-seeded-v3';
window.KH_CONTRACTOR_FILES = window.KH_CONTRACTOR_FILES || new Map();
const khLoadContractors = () => { try { return JSON.parse(localStorage.getItem(KH_CONTRACTORS_KEY) || '[]'); } catch { return []; } };
const khSaveContractorsLocal = (l) => { try { localStorage.setItem(KH_CONTRACTORS_KEY, JSON.stringify(l)); window.dispatchEvent(new Event('kh-storage')); } catch {} };
const khSaveContractors = (l) => {
  khSaveContractorsLocal(l);
  if (window.SB) {
    const cleaned = l.map(c => ({
      id: String(c.id), name: c.name || '',
      email: c.email || '', phone: c.phone || '',
      type: c.type || '', org: c.org || '', website: c.website || '',
      file_name: c.fileName || null,
      file_size: c.fileSize == null ? null : Number(c.fileSize),
      file_time: c.fileTime == null ? null : Number(c.fileTime),
    }));
    if (cleaned.length) window.SB.upsert('kh_contractors', cleaned, 'id').catch(e => console.warn('cloud contractors:', e));
  }
};

const KH_SEED = [
  { name: 'ТЕХНОНИКОЛЬ',     type: 'Производитель', email: 'test1@mail.ru', phone: '+7 (000) 000-00-01', website: 'https://www.tn.ru/',                  org: 'Кровля, гидро- и теплоизоляция, фасады' },
  { name: 'Segezha Group',   type: 'Производитель', email: 'test2@mail.ru', phone: '+7 (000) 000-00-02', website: 'https://segezha-group.com/',          org: 'Пиломатериалы, фанера, клеёный брус, бумага' },
  { name: 'CLT Development', type: 'Производитель', email: 'test3@mail.ru', phone: '+7 (000) 000-00-03', website: 'https://cltdevelopment.ru/products',  org: 'CLT-панели, инжиниринг' },
  { name: 'Adler-Werk',      type: 'Производитель', email: 'test4@mail.ru', phone: '+7 (000) 000-00-04', website: 'https://adler-lacke.ru/',             org: 'ЛКМ для дерева, лаки, масла, краски' },
  { name: 'КЗС',             type: 'Поставщик',     email: 'test5@mail.ru', phone: '+7 (000) 000-00-05', website: 'https://kzs.ru/',                     org: 'Стройматериалы' },
  { name: 'Dörken',          type: 'Производитель', email: 'test6@mail.ru', phone: '+7 (000) 000-00-06', website: 'https://www.doerken.com/ru/ru/start', org: 'DELTA-мембраны, гидро- и пароизоляция' },
];

function khSeedIfNeeded(current) {
  if (localStorage.getItem(KH_SEEDED_KEY)) return current;
  const byName = new Map(current.map(c => [(c.name || '').trim().toLowerCase(), c]));
  const merged = current.map(c => ({ ...c }));
  const seedFresh = [];
  KH_SEED.forEach((v, i) => {
    const key = v.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      const idx = merged.indexOf(merged.find(c => c === existing) || existing);
      const target = merged[idx] || existing;
      ['phone', 'website', 'email', 'org', 'type'].forEach(k => {
        if (!target[k] && v[k]) target[k] = v[k];
      });
    } else {
      seedFresh.push({ id: 'seed-' + i + '-' + Date.now(), ...v });
    }
  });
  const next = [...seedFresh, ...merged];
  khSaveContractors(next);
  try { localStorage.setItem(KH_SEEDED_KEY, '1'); } catch {}
  return next;
}

function KHContractorsView() {
  const data = useKHData();
  const [list, setList] = React.useState(() => khSeedIfNeeded(khLoadContractors()));
  const [tab, setTab] = React.useState('Производители');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const [draft, setDraft] = React.useState({ name: '', email: '', phone: '', type: 'Производитель', org: '', website: '' });
  const [, force] = React.useReducer(x => x + 1, 0);

  const persist = (next) => { setList(next); khSaveContractors(next); };

  const counts = {
    'Производители': list.filter(c => c.type === 'Производитель').length,
    'Подрядчики':    list.filter(c => c.type !== 'Производитель').length,
  };
  const filtered = list.filter(c =>
    tab === 'Производители' ? c.type === 'Производитель' : c.type !== 'Производитель'
  );

  const startAdd = () => {
    setDraft({ name: '', email: '', phone: '', type: tab === 'Производители' ? 'Производитель' : 'Поставщик', org: '', website: '' });
    setEditingId(null);
    setFormOpen(true);
  };
  const startEdit = (c) => {
    setDraft({ name: c.name || '', email: c.email || '', phone: c.phone || '', type: c.type || 'Поставщик', org: c.org || '', website: c.website || '' });
    setEditingId(c.id);
    setFormOpen(true);
  };
  const cancelForm = () => { setFormOpen(false); setEditingId(null); };

  const submitForm = (e) => {
    if (e) e.preventDefault();
    const name = draft.name.trim(), email = draft.email.trim();
    if (!name || !email) return;
    const fields = { name, email, phone: draft.phone.trim(), type: draft.type, org: draft.org.trim(), website: draft.website.trim() };
    if (editingId) {
      persist(list.map(c => c.id === editingId ? { ...c, ...fields } : c));
    } else {
      persist([{ id: 'u-' + Date.now(), ...fields }, ...list]);
    }
    cancelForm();
  };

  const removeOne = (id) => {
    if (!confirm('Удалить запись?')) return;
    persist(list.filter(c => c.id !== id));
    window.KH_CONTRACTOR_FILES.delete(id);
    if (window.SB) window.SB.remove('kh_contractors', `id=eq.${encodeURIComponent(id)}`).catch(e => console.warn('cloud contractors del:', e));
  };

  React.useEffect(() => {
    if (!window.SB) return;
    let cancelled = false;
    window.SB.selectAll('kh_contractors', 'order=updated_at.desc').then(remote => {
      if (cancelled || !Array.isArray(remote)) return;
      if (remote.length) {
        const mapped = remote.map(c => ({
          id: c.id, name: c.name, email: c.email || '', phone: c.phone || '',
          type: c.type || '', org: c.org || '', website: c.website || '',
          fileName: c.file_name || undefined,
          fileSize: c.file_size == null ? undefined : Number(c.file_size),
          fileTime: c.file_time == null ? undefined : Number(c.file_time),
        }));
        setList(mapped);
        khSaveContractorsLocal(mapped);
      } else {
        const local = khLoadContractors();
        if (local.length) khSaveContractors(local);
      }
    }).catch(e => console.warn('cloud load contractors:', e));
    return () => { cancelled = true; };
  }, []);

  const attachFile = (id) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      window.KH_CONTRACTOR_FILES.set(id, f);
      persist(list.map(c => c.id === id ? { ...c, fileName: f.name, fileSize: f.size, fileTime: Date.now() } : c));
      force();
    };
    input.click();
  };

  const detachFile = (id) => {
    window.KH_CONTRACTOR_FILES.delete(id);
    persist(list.map(c => c.id === id ? { ...c, fileName: undefined, fileSize: undefined, fileTime: undefined } : c));
  };

  const sendRequest = async (c) => {
    if (!c.email) { alert('У подрядчика не указан email'); return; }
    const f = window.KH_CONTRACTOR_FILES.get(c.id);
    const fileLine = (f || c.fileName) ? `\n\nВо вложении: ${f ? f.name : c.fileName}.` : '';
    const body = `Здравствуйте!\n\nПросим прислать коммерческое предложение по приложенной спецификации.${fileLine}\n\nОтвет, пожалуйста, на ${c.email}\n\nС уважением,`;

    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      try {
        try { await navigator.clipboard.writeText(c.email); } catch (_) {}
        await navigator.share({ files: [f], title: 'Запрос КП', text: body });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('Web Share failed, falling back to Mail.ru', err);
      }
    }

    const url = `https://e.mail.ru/compose/?To=${encodeURIComponent(c.email)}&Subject=${encodeURIComponent('Запрос КП')}&Body=${encodeURIComponent(body)}`;

    if (f) {
      const a = document.createElement('a');
      const href = URL.createObjectURL(f);
      a.href = href; a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 8000);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => alert(`Системное «Поделиться» с файлом не поддерживается этим браузером.\n\nОткроется Mail.ru с заполненным письмом для ${c.email}, файл «${f.name}» скачан в «Загрузки» — перетащите его в окно письма.`), 100);
    } else if (c.fileName) {
      alert(`Файл «${c.fileName}» был прикреплён в прошлой сессии и забыт после обновления страницы.\nПрикрепите файл заново и нажмите «Отправить» ещё раз.`);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!data) return <div className="kh-loading">Загрузка…</div>;

  const sizeLabel = (n) => !n ? '' : n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;

  const Tab = ({ id }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 14px', border: 'none', borderBottom: '2px solid ' + (tab === id ? 'var(--ink)' : 'transparent'),
        background: 'transparent', color: tab === id ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: tab === id ? 600 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--sans)',
      }}
    >{id} <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}>· {counts[id]}</span></button>
  );

  return (
    <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        <Tab id="Производители" />
        <Tab id="Подрядчики" />
        {!formOpen && (
          <button className="kh-btn-primary" onClick={startAdd} style={{ marginLeft: 'auto', marginBottom: 6 }}>
            + Добавить {tab === 'Производители' ? 'производителя' : 'подрядчика'}
          </button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={submitForm}
          className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, border: '1px solid var(--moss)', background: 'var(--paper-card)' }}>
          <div style={{ fontWeight: 600 }}>{editingId ? 'Редактировать запись' : 'Новая запись'}</div>
          <input autoFocus placeholder="Название / ФИО" value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })} style={khInputStyle()} />
          <input placeholder="Email" type="email" value={draft.email}
            onChange={e => setDraft({ ...draft, email: e.target.value })} style={khInputStyle()} />
          <input placeholder="Телефон" type="tel" value={draft.phone}
            onChange={e => setDraft({ ...draft, phone: e.target.value })} style={khInputStyle()} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })} style={{ ...khInputStyle(), width: 200 }}>
              <option>Производитель</option><option>Поставщик</option><option>Бригада</option><option>Субподрядчик</option>
            </select>
            <input placeholder="Описание / организация" value={draft.org}
              onChange={e => setDraft({ ...draft, org: e.target.value })} style={{ ...khInputStyle(), flex: 1 }} />
          </div>
          <input placeholder="Сайт (необязательно)" value={draft.website}
            onChange={e => setDraft({ ...draft, website: e.target.value })} style={khInputStyle()} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm" onClick={cancelForm}>Отмена</button>
            <button type="submit" className="kh-btn-primary" disabled={!draft.name.trim() || !draft.email.trim()}>
              {editingId ? 'Сохранить изменения' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 && !formOpen && (
        <div className="kh-empty" style={{ padding: 16 }}>
          {tab === 'Производители' ? 'Производителей нет' : 'Подрядчиков нет'} — нажмите «+ Добавить».
        </div>
      )}

      <div className="kh-list">
        {filtered.map(c => {
          const fileInMem = window.KH_CONTRACTOR_FILES.get(c.id);
          const hasFile = !!(fileInMem || c.fileName);
          return (
            <div key={c.id} className="kh-card kh-card--static" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kh-card__title">{c.name}</div>
                  <div className="kh-card__meta">{c.type}{c.org ? ' · ' + c.org : ''}</div>
                  <div className="kh-card__meta">
                    <a href={`mailto:${c.email}`} style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>{c.email}</a>
                    {c.phone && <>
                      <span style={{ color: 'var(--ink-4)', margin: '0 6px' }}>·</span>
                      <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>{c.phone}</a>
                    </>}
                  </div>
                  {c.website && (
                    <div className="kh-card__meta">
                      <a href={c.website} target="_blank" rel="noopener noreferrer"
                         style={{ color: 'var(--moss)', textDecoration: 'none' }}>
                        {c.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => startEdit(c)} title="Редактировать">✎</button>
                  <button className="btn btn-sm" style={{ color: 'var(--rust)' }} onClick={() => removeOne(c.id)} title="Удалить">×</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: hasFile ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                {fileInMem
                  ? `📎 ${fileInMem.name}${fileInMem.size ? ' · ' + sizeLabel(fileInMem.size) : ''}`
                  : c.fileName
                    ? `📎 ${c.fileName}${c.fileSize ? ' · ' + sizeLabel(c.fileSize) : ''} (нужно прикрепить заново)`
                    : 'Файл не прикреплён'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <button className="btn btn-sm" onClick={() => attachFile(c.id)}>{hasFile ? 'Заменить файл' : 'Прикрепить файл'}</button>
                {hasFile && <button className="btn btn-sm" onClick={() => detachFile(c.id)}>Убрать файл</button>}
                <button className="kh-btn-primary" onClick={() => sendRequest(c)} style={{ marginLeft: 'auto' }}>Отправить запрос КП →</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function khInputStyle() {
  return { border: '1px solid var(--rule)', borderRadius: 6, padding: '8px 10px', outline: 'none',
    background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--sans)' };
}

// ---------- Календарь со встречами (localStorage) ----------
const KH_EVENTS_KEY = 'kh.calendar.events.v1';
const khLoadEvents = () => { try { return JSON.parse(localStorage.getItem(KH_EVENTS_KEY) || '[]'); } catch { return []; } };
const khSaveEventsLocal = (l) => { try { localStorage.setItem(KH_EVENTS_KEY, JSON.stringify(l)); } catch {} };
const khSaveEvents = (l) => {
  khSaveEventsLocal(l);
  if (window.SB) {
    const cleaned = l.map(e => ({
      id: Number(e.id), date: e.date || '', time: e.time || '', title: e.title || '',
    }));
    if (cleaned.length) window.SB.upsert('kh_events', cleaned, 'id').catch(err => console.warn('cloud events:', err));
  }
};
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
  const removeEvent = (id) => {
    persist(events.filter(x => x.id !== id));
    if (window.SB) window.SB.remove('kh_events', `id=eq.${Number(id)}`).catch(e => console.warn('cloud events del:', e));
  };
  const addEvent = () => {
    if (!picked || !draft.title.trim()) return;
    persist([...events, { id: Date.now(), date: picked, time: draft.time, title: draft.title.trim() }]);
    setDraft({ time: draft.time, title: '' });
  };
  React.useEffect(() => {
    if (!window.SB) return;
    let cancelled = false;
    window.SB.selectAll('kh_events', 'order=date.desc,time.asc').then(remote => {
      if (cancelled || !Array.isArray(remote)) return;
      if (remote.length) {
        const mapped = remote.map(e => ({ id: Number(e.id), date: e.date, time: e.time || '', title: e.title || '' }));
        setEvents(mapped);
        khSaveEventsLocal(mapped);
      } else {
        const local = khLoadEvents();
        if (local.length) khSaveEvents(local);
      }
    }).catch(e => console.warn('cloud load events:', e));
    return () => { cancelled = true; };
  }, []);
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
              <button className="kh-event__del" onClick={() => removeEvent(e.id)}>×</button>
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
  estimates:   { title: 'Сметы',       sub: 'Список смет по объектам', comp: KHEstimatesView },
  objects:     { title: 'Объекты',     sub: 'Активные объекты',        comp: KHObjectsView },
  materials:   { title: 'Материалы',   sub: 'Справочник материалов',   comp: KHMaterialsView },
  database:    { title: 'База данных', sub: 'Каталог позиций — поиск, добавление, загрузка', comp: (props) => window.KHDatabaseView ? React.createElement(window.KHDatabaseView, props) : null },
  contractors: { title: 'Подрядчики',  sub: 'Поставщики и бригады',    comp: KHContractorsView },
  calendar:    { title: 'Календарь',   sub: 'События и встречи',       comp: KHCalendarView },
  works:       { title: 'Работы',      sub: 'Расценки',                comp: KHWorksView },
  norms:       { title: 'Нормативы',   sub: 'Разделы сводной сметы',   comp: KHNormsView },
  templates:   { title: 'Шаблоны',     sub: 'Типовые позиции',         comp: KHTemplatesView },
};

function KHModalRoot({ activeId, onClose, est }) {
  const view = activeId ? KH_VIEWS[activeId] : null;
  const C = view ? view.comp : null;
  return (
    <KHModal open={!!activeId} onClose={onClose} title={view?.title} subtitle={view?.sub}>
      {C && <C est={est} />}
    </KHModal>
  );
}

window.KH_VIEWS = KH_VIEWS;
window.KHModalRoot = KHModalRoot;
