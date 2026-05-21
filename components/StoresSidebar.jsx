// Вкладка «Магазины»: карточки источников цен. Пользователь добавляет URL сайта,
// бэкенд (PRICES_BACKEND/auto/detect) эвристически определяет, как парсить цены
// (schema.org → микроразметка → og:meta → текст), и результат сохраняется в карточку.

const KH_STORES_KEY = 'kh-stores-v1';

const khLoadStores = () => {
  try { return JSON.parse(localStorage.getItem(KH_STORES_KEY) || '[]'); } catch { return []; }
};
const khSaveStores = (list) => {
  try {
    localStorage.setItem(KH_STORES_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('kh-storage'));
  } catch {}
};

const khStoreHost = (url) => {
  try { return new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); }
  catch { return url; }
};

// Превращает сырой ответ бэкенда-парсера в понятное пользователю объяснение.
// Бэкенд оборачивает любую ошибку загрузки страницы в HTTP 502 с текстом вида
// "fetch failed: Client error '403 Forbidden' for url '...'", что само по себе
// ни о чём не говорит обычному пользователю.
const khFriendlyParserError = (status, detail) => {
  const d = String(detail || '');
  if (/40[13]|forbidden|unauthorized/i.test(d)) {
    return 'Сайт закрыт от автоматического чтения цен (защита от ботов) или это не каталог магазина. Парсинг для него недоступен.';
  }
  if (/404|not\s*found/i.test(d)) {
    return 'Страница не найдена — проверьте, что ссылка ведёт на работающий каталог магазина.';
  }
  // Холодный старт/недоступность самого сервиса парсинга.
  if (status === 502 || status === 503 || status === 504 || /bad gateway|gateway timeout|service unavailable/i.test(d)) {
    return 'Сервис парсинга сейчас недоступен (возможно, ещё запускается). Попробуйте повторить через 30–60 секунд.';
  }
  if (/timeout|timed out/i.test(d)) {
    return 'Сайт слишком долго не отвечает. Попробуйте позже.';
  }
  return d || `Ошибка ${status}`;
};

const KH_METHOD_LABEL = {
  jsonld: 'schema.org',
  microdata: 'микроразметка',
  meta: 'og:meta',
  text: 'эвристика по тексту',
  none: 'не распознано',
};
// Цвет бейджа по достоверности.
const KH_CONF_STYLE = {
  high:   { background: 'var(--moss, #4f6f52)', color: '#fff' },
  medium: { background: '#b8862b', color: '#fff' },
  low:    { background: 'var(--rule)', color: 'var(--ink-2)' },
  none:   { background: 'var(--rule)', color: 'var(--ink-3)' },
};

function khStoreInputStyle() {
  return {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--rule)', background: 'var(--paper)',
    color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--sans)',
  };
}

function KHStoresView() {
  const [list, setList] = React.useState(khLoadStores);
  const [url, setUrl] = React.useState('');
  const [busyId, setBusyId] = React.useState(null); // 'new' при добавлении, иначе id карточки
  const [error, setError] = React.useState('');

  const persist = (next) => { setList(next); khSaveStores(next); };

  // Best-effort облачная синхронизация: таблицы kh_stores может не быть — тихо игнорируем.
  React.useEffect(() => {
    if (!window.SB) return;
    let cancelled = false;
    window.SB.selectAll('kh_stores', 'order=added_at.desc').then(remote => {
      if (cancelled || !Array.isArray(remote) || !remote.length) return;
      const mapped = remote.map(r => ({
        id: r.id, url: r.url, name: r.name, host: r.host || khStoreHost(r.url),
        favicon: r.favicon || null, method: r.method || 'none', currency: r.currency || 'RUB',
        found: r.found || 0, confidence: r.confidence || 'none', note: r.note || '',
        samples: Array.isArray(r.samples) ? r.samples : [],
        active: !!r.active, searchUrl: r.search_url || '',
        addedAt: r.added_at ? Date.parse(r.added_at) : Date.now(),
        lastCheck: r.last_check ? Date.parse(r.last_check) : null,
      }));
      setList(mapped);
      khSaveStores(mapped);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const cloudUpsert = (store) => {
    if (!window.SB) return;
    window.SB.upsert('kh_stores', {
      id: store.id, url: store.url, name: store.name, host: store.host,
      favicon: store.favicon, method: store.method, currency: store.currency,
      found: store.found, confidence: store.confidence, note: store.note,
      samples: store.samples, active: !!store.active, search_url: store.searchUrl || null,
      added_at: new Date(store.addedAt).toISOString(),
      last_check: store.lastCheck ? new Date(store.lastCheck).toISOString() : null,
    }, 'id').catch(() => {});
  };

  // Запрос к бэкенду-детектору. Возвращает объект карточки или бросает ошибку.
  async function detect(rawUrl, id) {
    const backend = window.PRICES_BACKEND;
    if (!backend) throw new Error('Адрес парсера не настроен (PRICES_BACKEND)');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(`${backend}/auto/detect?url=${encodeURIComponent(rawUrl)}`, { signal: ctrl.signal });
      if (!r.ok) {
        let detail = '';
        try { const j = await r.json(); if (j && j.detail) detail = j.detail; } catch {}
        throw new Error(khFriendlyParserError(r.status, detail));
      }
      const d = await r.json();
      return {
        id: id || ('s-' + Date.now()),
        url: d.url || rawUrl,
        name: d.store_name || khStoreHost(rawUrl),
        host: khStoreHost(d.url || rawUrl),
        favicon: d.favicon || null,
        method: d.method || 'none',
        currency: d.currency || 'RUB',
        found: d.found || 0,
        confidence: d.confidence || 'none',
        note: d.note || '',
        samples: Array.isArray(d.samples) ? d.samples : [],
        lastCheck: Date.now(),
      };
    } finally {
      clearTimeout(t);
    }
  }

  const addStore = async (e) => {
    if (e) e.preventDefault();
    const raw = url.trim();
    if (!raw || busyId) return;
    const host = khStoreHost(raw);
    if (list.some(s => s.host === host)) {
      setError('Такой магазин уже добавлен.');
      return;
    }
    setError('');
    setBusyId('new');
    try {
      const store = await detect(raw, null);
      store.addedAt = Date.now();
      store.active = store.found > 0;
      store.searchUrl = '';
      const next = [store, ...list];
      persist(next);
      cloudUpsert(store);
      setUrl('');
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Превышено время ожидания парсера.' : err.message);
    } finally {
      setBusyId(null);
    }
  };

  const recheck = async (store) => {
    if (busyId) return;
    setError('');
    setBusyId(store.id);
    try {
      const fresh = await detect(store.url, store.id);
      fresh.addedAt = store.addedAt;
      fresh.active = store.active;
      fresh.searchUrl = store.searchUrl || '';
      const next = list.map(s => s.id === store.id ? fresh : s);
      persist(next);
      cloudUpsert(fresh);
    } catch (err) {
      setError('Не удалось обновить ' + store.host + ': ' + err.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeStore = (store) => {
    if (!confirm(`Удалить магазин «${store.name}»?`)) return;
    persist(list.filter(s => s.id !== store.id));
    if (window.SB) window.SB.remove('kh_stores', `id=eq.${encodeURIComponent(store.id)}`).catch(() => {});
  };

  const setActive = (store, val) => {
    const next = list.map(s => s.id === store.id ? { ...s, active: val } : s);
    persist(next);
    const u = next.find(s => s.id === store.id);
    if (u) cloudUpsert(u);
  };

  const setSearchUrl = (store, val) => {
    persist(list.map(s => s.id === store.id ? { ...s, searchUrl: val } : s));
  };

  const commitSearchUrl = (store) => {
    const u = list.find(s => s.id === store.id);
    if (u) cloudUpsert(u);
  };

  const money = (n, cur) => {
    if (n == null) return '—';
    const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₽';
    return (window.fmt ? window.fmt(Math.round(n)) : Math.round(n)) + ' ' + sym;
  };

  return (
    <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={addStore} className="col"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, border: '1px solid var(--moss, var(--rule))', background: 'var(--paper-card)' }}>
        <div style={{ fontWeight: 600 }}>Добавить магазин</div>
        <div className="kh-store-add-row" style={{ display: 'flex', gap: 8 }}>
          <input autoFocus placeholder="Ссылка на сайт или страницу товара, напр. https://example.ru/catalog"
            value={url} onChange={e => { setUrl(e.target.value); setError(''); }}
            style={{ ...khStoreInputStyle(), flex: 1, minWidth: 0 }} />
          <button type="submit" className="kh-btn-primary kh-store-add-row__btn" disabled={!url.trim() || busyId === 'new'}
            style={{ whiteSpace: 'nowrap' }}>
            {busyId === 'new' ? 'Подключаю…' : 'Подключить парсер'}
          </button>
        </div>
        <div className="kh-card__meta" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          Парсер сам определит цены через schema.org, микроразметку или текст страницы. Точность зависит от сайта.
        </div>
        {error && <div style={{ fontSize: 12, color: '#b23b3b' }}>{error}</div>}
      </form>

      {list.length === 0 && (
        <div className="kh-empty" style={{ padding: 16 }}>
          Магазинов пока нет — вставьте ссылку на сайт и нажмите «Подключить парсер».
        </div>
      )}

      <div className="kh-list">
        {list.map(s => {
          const conf = KH_CONF_STYLE[s.confidence] || KH_CONF_STYLE.none;
          const busy = busyId === s.id;
          const prices = (s.samples || []).filter(x => x && x.price != null);
          return (
            <div key={s.id} className="kh-card kh-card--static"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {s.favicon
                  ? <img src={s.favicon} alt="" width={28} height={28}
                      style={{ borderRadius: 6, flexShrink: 0, objectFit: 'contain', background: 'var(--paper)' }}
                      onError={e => { e.target.style.display = 'none'; }} />
                  : <span style={{ flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="shop" size={22} /></span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kh-card__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="kh-card__meta" style={{ color: 'var(--ink-3)', textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <Icon name="link" size={12} /> {s.host}
                  </a>
                </div>
                <span style={{ ...conf, fontSize: 11, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', fontFamily: 'var(--sans)' }}>
                  {KH_METHOD_LABEL[s.method] || s.method}
                </span>
              </div>

              <div className="kh-card__meta" style={{ fontSize: 12 }}>
                {s.found > 0
                  ? <>Распознано цен: <b>{s.found}</b>{prices.length ? <> · от {money(Math.min(...prices.map(p => p.price)), s.currency)}</> : null}</>
                  : 'Цены не распознаны'}
                {s.lastCheck ? <> · проверено {new Date(s.lastCheck).toLocaleDateString('ru-RU')}</> : null}
              </div>

              {s.note && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.35 }}>{s.note}</div>
              )}

              {prices.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {prices.slice(0, 4).map((p, i) => (
                    <span key={i} className="mono tiny"
                      style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--paper)', border: '1px solid var(--rule)' }}
                      title={p.name || ''}>
                      {money(p.price, s.currency)}
                    </span>
                  ))}
                </div>
              )}

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, cursor: 'pointer', color: 'var(--ink-2)' }}>
                <input type="checkbox" checked={!!s.active} onChange={e => setActive(s, e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--moss, #4f6f52)' }} />
                Искать в этом магазине при обновлении цен в смете
              </label>

              {s.active && (
                <input placeholder="URL поиска с {q} — если авто-поиск не находит, напр. https://сайт/search/?q={q}"
                  value={s.searchUrl || ''}
                  onChange={e => setSearchUrl(s, e.target.value)}
                  onBlur={() => commitSearchUrl(s)}
                  style={{ ...khStoreInputStyle(), fontSize: 12 }} />
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button className="btn btn-sm" onClick={() => recheck(s)} disabled={!!busyId}
                  style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <Icon name="refresh" size={13} /> {busy ? 'Обновляю…' : 'Обновить'}
                </button>
                <button className="btn btn-sm" onClick={() => removeStore(s)} disabled={!!busyId}
                  style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5, alignItems: 'center', color: '#b23b3b' }}>
                  <Icon name="trash" size={13} /> Удалить
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.KHStoresView = KHStoresView;
