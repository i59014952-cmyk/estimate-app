// ObjectEstimate.jsx — мини-смета привязанная к конкретному объекту (по
// objectId). Хранится в localStorage под ключом kh-object-estimate-v1::<id>.
// Используется панелью под 3D-вьюером (см. IfcViewer.jsx).
//
// Что умеет:
//   • ручное добавление пустых строк, редактирование кол-ва/цены;
//   • импорт всех позиций из выбранного шаблона (kh-templates-v1);
//   • добавление позиции из базы (/db/kh_user_catalog) — с поиском.
// Итоги: суммы работ и материалов отдельно (как в основной смете).

const KH_OBJ_EST_PREFIX = 'kh-object-estimate-v1::';
const KH_OBJ_EST_API    = (typeof window !== 'undefined' && window.PRICES_BACKEND) || 'https://api.sme-ta.ru';

function khObjEstLoad(objectId) {
  try { return JSON.parse(localStorage.getItem(KH_OBJ_EST_PREFIX + objectId) || '[]') || []; }
  catch { return []; }
}
function khObjEstSave(objectId, items) {
  try { localStorage.setItem(KH_OBJ_EST_PREFIX + objectId, JSON.stringify(items)); }
  catch (_) {}
}
function khObjEstUid() {
  return 'oei-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
function khObjEstCat(it) {
  if (it && (it.category === 'work' || it.category === 'material')) return it.category;
  if (typeof window.classifyItem === 'function') return window.classifyItem(it && it.name, it && it.unit);
  return 'material';
}
function khObjEstFmt(n) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.round((Number(n) || 0) * 100) / 100);
}

function KHObjectEstimate({ objectId }) {
  const [items, setItems] = React.useState(() => khObjEstLoad(objectId));
  const [tplOpen, setTplOpen] = React.useState(false);
  const [dbOpen, setDbOpen]   = React.useState(false);
  const [dbQuery, setDbQuery] = React.useState('');
  const [dbCatalog, setDbCatalog] = React.useState(null);   // null = ещё не грузили
  const [dbLoading, setDbLoading] = React.useState(false);
  const [dbError, setDbError] = React.useState(null);

  // При смене objectId — перечитать смету.
  React.useEffect(() => { setItems(khObjEstLoad(objectId)); }, [objectId]);
  // На каждое изменение — сохранить локально.
  React.useEffect(() => { khObjEstSave(objectId, items); }, [objectId, items]);

  const totals = React.useMemo(() => {
    let work = 0, mat = 0;
    for (const it of items) {
      const sum = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      if (khObjEstCat(it) === 'work') work += sum; else mat += sum;
    }
    const vat = work * 0.22;   // НДС только на работы (как в основной смете)
    return { work, mat, total: work + mat, vat, grand: work + mat + vat };
  }, [items]);

  const addBlank = () => setItems(prev => [...prev, {
    id: khObjEstUid(), name: '', unit: 'шт', qty: 1, unitPrice: 0, category: 'material',
  }]);
  const update = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  const remove = (id) => setItems(prev => prev.filter(it => it.id !== id));

  // ----- импорт из шаблона ---------------------------------------------------
  const tplList = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kh-templates-v1') || '[]') || []; }
    catch { return []; }
  }, [tplOpen]);   // перечитываем при каждом открытии
  const importTpl = (tplId) => {
    const t = tplList.find(x => x.id === tplId);
    if (!t || !Array.isArray(t.items) || !t.items.length) {
      alert('В шаблоне нет позиций.');
      return;
    }
    const added = t.items.map(it => ({
      id: khObjEstUid(),
      name: it.name || '',
      unit: it.unit || 'шт',
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      category: khObjEstCat(it),
    }));
    setItems(prev => [...prev, ...added]);
    setTplOpen(false);
  };

  // ----- импорт из базы ------------------------------------------------------
  const loadDbCatalog = async () => {
    if (dbCatalog !== null) return;
    setDbLoading(true); setDbError(null);
    try {
      const tok = (window.KHAuth && await window.KHAuth.ensureToken()) || '';
      const r = await fetch(`${KH_OBJ_EST_API}/db/kh_user_catalog?select=name,unit,unit_price&order=name`, {
        headers: tok ? { Authorization: 'Bearer ' + tok } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      setDbCatalog(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setDbError(err.message || String(err));
      setDbCatalog([]);
    } finally {
      setDbLoading(false);
    }
  };
  React.useEffect(() => { if (dbOpen) loadDbCatalog(); }, [dbOpen]);
  const dbFiltered = React.useMemo(() => {
    if (!dbCatalog) return [];
    const q = dbQuery.trim().toLowerCase();
    let out = q ? dbCatalog.filter(x => (x.name || '').toLowerCase().includes(q)) : dbCatalog;
    return out.slice(0, 80);
  }, [dbCatalog, dbQuery]);
  const addFromDb = (row) => {
    setItems(prev => [...prev, {
      id: khObjEstUid(),
      name: row.name || '',
      unit: row.unit || 'шт',
      qty: 1,
      unitPrice: Number(row.unit_price) || 0,
      category: typeof window.classifyItem === 'function' ? window.classifyItem(row.name, row.unit) : 'material',
    }]);
  };

  // ----- рендер --------------------------------------------------------------
  const btn = {
    padding: '7px 14px', fontSize: 13, fontWeight: 600,
    border: '1px solid var(--rust)', borderRadius: 6,
    background: 'var(--paper)', color: 'var(--rust)', cursor: 'pointer',
  };
  const cell = { padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 4, background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' };
  // Разделение на «Работы» / «Материалы» с сохранением порядка внутри секций.
  const isWork = (it) => khObjEstCat(it) === 'work';
  const works = items.filter(isWork);
  const mats  = items.filter(it => !isWork(it));
  const sectionSum = (arr) => arr.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const sections = [];
  if (works.length) sections.push({ key: 'work', title: 'РАБОТЫ', items: works, sum: sectionSum(works) });
  if (mats.length)  sections.push({ key: 'material', title: 'МАТЕРИАЛЫ (цены уже с НДС)', items: mats, sum: sectionSum(mats) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ color: 'var(--rust)' }}>Смета объекта</div>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button style={btn} onClick={() => { setDbOpen(false); setTplOpen(v => !v); }}>+ Из шаблона ▾</button>
          {tplOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '110%', minWidth: 280, maxHeight: 280, overflow: 'auto',
              background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,.15)', zIndex: 10, padding: 6,
            }}>
              {tplList.length === 0
                ? <div style={{ padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>Шаблонов нет.</div>
                : tplList.map(t => (
                    <button key={t.id} onClick={() => importTpl(t.id)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 8px', border: 0, background: 'transparent',
                      color: 'var(--ink)', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                    }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(160,122,74,.08)'}
                       onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {t.name} <span className="muted" style={{ marginLeft: 6 }}>· {(t.items || []).length} поз.</span>
                    </button>
                  ))}
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button style={btn} onClick={() => { setTplOpen(false); setDbOpen(v => !v); }}>+ Из базы ▾</button>
          {dbOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '110%', width: 360, maxHeight: 360, overflow: 'hidden',
              background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,.15)', zIndex: 10, padding: 8,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <input autoFocus placeholder="Поиск по базе…" value={dbQuery}
                onChange={e => setDbQuery(e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 6, fontSize: 13, background: 'var(--paper)' }} />
              <div style={{ overflow: 'auto', minHeight: 0 }}>
                {dbLoading ? <div style={{ padding: 8, fontSize: 12, color: 'var(--ink-3)' }}>Загрузка…</div>
                  : dbError ? <div style={{ padding: 8, fontSize: 12, color: 'var(--rust)' }}>Ошибка: {dbError}</div>
                  : dbFiltered.length === 0 ? <div style={{ padding: 8, fontSize: 12, color: 'var(--ink-3)' }}>Ничего не найдено.</div>
                  : dbFiltered.map((row, i) => (
                      <button key={i} onClick={() => addFromDb(row)} style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '6px 8px', border: 0, background: 'transparent',
                        color: 'var(--ink)', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                      }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(160,122,74,.08)'}
                         onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {row.name}
                        <span className="muted" style={{ marginLeft: 6 }}>
                          · {row.unit || 'шт'} · {khObjEstFmt(row.unit_price)} ₽
                        </span>
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>
        <button style={btn} onClick={addBlank}>+ Вручную</button>
      </div>

      <div style={{ overflow: 'visible', border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'var(--paper-2, #f0e6d2)', fontSize: 10, letterSpacing: '.18em', color: 'var(--ink-3)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 100 }}>КАТЕГОРИЯ</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>НАИМЕНОВАНИЕ</th>
              <th style={{ padding: '10px 12px', width: 70, textAlign: 'left' }}>ЕД.</th>
              <th style={{ padding: '10px 12px', width: 90, textAlign: 'right' }}>КОЛ-ВО</th>
              <th style={{ padding: '10px 12px', width: 130, textAlign: 'right' }}>ЦЕНА, ₽</th>
              <th style={{ padding: '10px 12px', width: 160, textAlign: 'right' }}>СУММА, ₽</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
                Смета пуста — добавь позиции кнопками сверху.
              </td></tr>
            )}
            {sections.map((sec, secIdx) => (
              <React.Fragment key={sec.key}>
                <tr style={{ background: 'var(--paper-2, #f0e6d2)' }}>
                  <td colSpan={5} style={{
                    padding: '11px 14px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '.18em', color: 'var(--rust)',
                    borderTop: secIdx === 0 ? 'none' : '1px solid var(--rule)',
                  }}>
                    {sec.title} · {sec.items.length}
                  </td>
                  <td style={{
                    padding: '11px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700,
                    color: 'var(--rust)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                    borderTop: secIdx === 0 ? 'none' : '1px solid var(--rule)',
                  }}>
                    {khObjEstFmt(sec.sum)} ₽
                  </td>
                  <td style={{
                    borderTop: secIdx === 0 ? 'none' : '1px solid var(--rule)',
                  }}></td>
                </tr>
                {sec.items.map((it, rowIdx) => {
                  const sum = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
                  const zebra = rowIdx % 2 === 1 ? 'rgba(160,122,74,.035)' : 'transparent';
                  return (
                    <tr key={it.id} style={{ background: zebra, borderTop: '1px solid var(--rule)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <select value={khObjEstCat(it)} onChange={e => update(it.id, { category: e.target.value })}
                          style={{ ...cell, fontWeight: 600, width: '100%',
                            color: khObjEstCat(it) === 'work' ? '#fff' : 'var(--ink-2)',
                            background: khObjEstCat(it) === 'work' ? 'var(--moss, #4f6f52)' : 'var(--paper)',
                            borderColor: khObjEstCat(it) === 'work' ? 'var(--moss, #4f6f52)' : 'var(--rule)' }}>
                          <option value="work">Работа</option>
                          <option value="material">Материал</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={it.name || ''} placeholder="Наименование"
                          onChange={e => update(it.id, { name: e.target.value })}
                          style={{ ...cell, width: '100%' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={it.unit || ''} placeholder="ед."
                          onChange={e => update(it.id, { unit: e.target.value })}
                          style={{ ...cell, width: '100%' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <input type="number" min="0" step="0.01" value={it.qty ?? 0}
                          onChange={e => update(it.id, { qty: e.target.value })}
                          style={{ ...cell, width: '100%', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <input type="number" min="0" step="0.01" value={it.unitPrice ?? 0}
                          onChange={e => update(it.id, { unitPrice: e.target.value })}
                          style={{ ...cell, width: '100%', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                      </td>
                      <td style={{
                        padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700,
                        color: sum > 0 ? 'var(--ink)' : 'var(--ink-4)',
                      }}>
                        {sum > 0 ? `${khObjEstFmt(sum)} ₽` : '—'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <button onClick={() => remove(it.id)} title="Удалить позицию"
                          style={{ border: 0, background: 'transparent', color: 'var(--rust)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Карточка итогов */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'end',
        padding: '14px 18px', background: 'var(--paper-2, #f0e6d2)',
        border: '1px solid var(--rule)', borderRadius: 10,
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--ink-3)', marginBottom: 4 }}>РАБОТЫ</div>
          <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{khObjEstFmt(totals.work)} ₽</div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--ink-3)', marginBottom: 4 }}>МАТЕРИАЛЫ (С НДС)</div>
          <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{khObjEstFmt(totals.mat)} ₽</div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--ink-3)', marginBottom: 4 }}>НДС 22% (НА РАБОТЫ)</div>
          <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{khObjEstFmt(totals.vat)} ₽</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--rust)', marginBottom: 4 }}>ИТОГО</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
            {khObjEstFmt(totals.grand)} ₽
          </div>
        </div>
      </div>
    </div>
  );
}

window.KHObjectEstimate = KHObjectEstimate;
