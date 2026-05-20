// useEstimate.jsx — React hook owning estimate state and actions.

const USER_CATALOG_KEY = "kh-user-catalog-v1";
const HIDDEN_CATALOG_KEY = "kh-hidden-catalog-v1";
const ESTIMATE_KEY = "kh-estimate-v1";
const CAT_OVERRIDE_KEY = "kh-cat-override-v1";

const hiddenKey = (name, unit) => `${String(name || "").trim().toLowerCase()}|${String(unit || "").trim().toLowerCase()}`;

function loadCatOverride() {
  try {
    const saved = JSON.parse(localStorage.getItem(CAT_OVERRIDE_KEY) || "{}");
    if (!saved || typeof saved !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(saved)) if (v === "work" || v === "material") out[k] = v;
    return out;
  } catch (_) { return {}; }
}

function saveCatOverride(map) {
  try { localStorage.setItem(CAT_OVERRIDE_KEY, JSON.stringify(map)); } catch (_) {}
}

function loadEstimate() {
  try {
    const saved = localStorage.getItem(ESTIMATE_KEY);
    if (!saved) return [];
    const arr = JSON.parse(saved);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.name === "string").map(x => ({
      id: Number(x.id) || 0,
      name: String(x.name),
      unit: String(x.unit || ""),
      unitPrice: Number(x.unitPrice) || 0,
      qty: Number(x.qty) || 0,
      notFound: !!x.notFound,
      source: String(x.source || "local"),
      // Авто-категория всегда пересчитывается актуальным классификатором;
      // ручную (catManual) сохраняем как есть.
      category: x.catManual === true
        ? (x.category === 'work' ? 'work' : 'material')
        : classifyItem(x.name, x.unit),
      catManual: x.catManual === true,
      url: String(x.url || ""),
      expanded: false,
      candidates: null,
      candidatesLoading: false,
      candidatesError: null,
    }));
  } catch (_) { return []; }
}

function saveEstimate(rows) {
  try {
    const slim = rows.map(r => ({
      id: r.id, name: r.name, unit: r.unit, unitPrice: r.unitPrice,
      qty: r.qty, notFound: !!r.notFound, source: r.source,
      category: r.category || 'material', catManual: r.catManual === true, url: r.url || "",
    }));
    localStorage.setItem(ESTIMATE_KEY, JSON.stringify(slim));
  } catch (_) {}
}

function loadHiddenCatalog() {
  try {
    const saved = localStorage.getItem(HIDDEN_CATALOG_KEY);
    if (!saved) return new Set();
    const arr = JSON.parse(saved);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(x => typeof x === "string"));
  } catch (_) { return new Set(); }
}

function saveHiddenCatalog(set) {
  try {
    const arr = [...set];
    localStorage.setItem(HIDDEN_CATALOG_KEY, JSON.stringify(arr));
    if (window.SB) {
      if (arr.length) window.SB.upsert('kh_hidden', arr.map(k => ({ key: k })), 'key').catch(e => console.warn('cloud hidden:', e));
    }
  } catch (_) {}
}

function loadUserCatalog() {
  try {
    const saved = localStorage.getItem(USER_CATALOG_KEY);
    if (!saved) return [];
    const arr = JSON.parse(saved);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && x.name).map(x => ({
      name: String(x.name),
      unit: String(x.unit || ""),
      unitPrice: Number(x.unitPrice) || 0,
      category: x.category === 'work' ? 'work' : (x.category === 'material' ? 'material' : classifyItem(x.name, x.unit)),
      tokenSet: new Set(tokenize(x.name)),
    }));
  } catch (_) { return []; }
}

function saveUserCatalog(items) {
  try {
    const slim = items.map(({ name, unit, unitPrice, category }) => ({ name, unit, unitPrice, category: category || 'material' }));
    localStorage.setItem(USER_CATALOG_KEY, JSON.stringify(slim));
    if (window.SB) {
      // category пока не отправляем в облако — в таблице kh_user_catalog может
      // не быть такой колонки, и весь upsert упал бы. Локально категория есть.
      const cleaned = slim.map(it => ({ name: it.name, unit: it.unit || '', unit_price: Number(it.unitPrice) || 0 }));
      if (cleaned.length) window.SB.upsert('kh_user_catalog', cleaned, 'name,unit').catch(e => console.warn('cloud user_catalog:', e));
    }
  } catch (_) {}
}

function parseUserCatalogRows(rows) {
  if (!rows || rows.length === 0) return [];
  const norm = (s) => String(s || "").trim().toLowerCase();
  const head = rows[0].map(norm);
  const detect = (...keys) => {
    for (let i = 0; i < head.length; i++) {
      if (keys.some(k => head[i] === k || head[i].includes(k))) return i;
    }
    return -1;
  };
  const nameIdx = detect("name", "наимен", "позиц", "товар", "материал");
  const unitIdx = detect("unit", "ед.", "ед ", "ед изм", "единиц");
  const priceIdx = detect("price", "цена", "стоимост");
  const hasHeader = nameIdx !== -1 && priceIdx !== -1;
  const start = hasHeader ? 1 : 0;
  const out = [];
  let currentSection = null; // 'work' | 'material', контекст раздела файла
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.map(c => String(c == null ? "" : c).trim());
    let name = "", unit = "", price = NaN;
    if (hasHeader) {
      name = cells[nameIdx] || "";
      unit = unitIdx !== -1 ? (cells[unitIdx] || "") : "";
      price = toNumber(cells[priceIdx]);
    } else {
      for (const c of cells) {
        if (!c) continue;
        if (!name && !isPureNumber(c) && c.length >= 3) { name = c; continue; }
        if (!unit && c.length <= 8 && /\p{L}/u.test(c) && !isPureNumber(c) && c !== name) { unit = c; continue; }
        const n = toNumber(c);
        if (!isNaN(n) && n > 0 && isNaN(price)) price = n;
      }
    }
    name = (name || "").trim();
    // Заголовок-раздел (нет цены либо помечен как section) → обновляем контекст.
    if (row._sectionLike || isNaN(price) || price <= 0) {
      const cat = detectSectionCategory(cells.join(' '));
      if (cat) currentSection = cat;
      continue;
    }
    if (!name || name.length < 2) continue;
    out.push({ name, unit: unit.trim(), unitPrice: price, category: classifyCategory(name, unit, currentSection) });
  }
  return out;
}

function useEstimate() {
  const [catalog, setCatalog] = React.useState([]);
  const [ddcCatalog, setDdcCatalog] = React.useState([]);
  const [userCatalog, setUserCatalog] = React.useState(loadUserCatalog);
  const [vendorCatalog, setVendorCatalog] = React.useState([]);
  const [hiddenCatalog, setHiddenCatalog] = React.useState(loadHiddenCatalog);
  const [catOverride, setCatOverride] = React.useState(loadCatOverride);
  const [catalogReady, setCatalogReady] = React.useState(false);

  const setItemCategory = React.useCallback((name, unit, category) => {
    if (category !== 'work' && category !== 'material') return;
    setCatOverride(prev => {
      const next = { ...prev, [hiddenKey(name, unit)]: category };
      saveCatOverride(next);
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!window.SB) return;
    let cancelled = false;
    window.SB.selectAll('kh_user_catalog', 'order=updated_at.desc').then(remote => {
      if (cancelled || !Array.isArray(remote)) return;
      if (remote.length) {
        const mapped = remote.map(it => ({
          name: String(it.name), unit: String(it.unit || ''),
          unitPrice: Number(it.unit_price) || 0,
          category: it.category === 'work' ? 'work' : (it.category === 'material' ? 'material' : classifyItem(it.name, it.unit)),
          tokenSet: new Set(tokenize(it.name)),
        }));
        setUserCatalog(mapped);
        try { localStorage.setItem(USER_CATALOG_KEY, JSON.stringify(mapped.map(({ name, unit, unitPrice, category }) => ({ name, unit, unitPrice, category })))); } catch (_) {}
      }
    }).catch(e => console.warn('cloud load user_catalog:', e));
    window.SB.selectAll('kh_vendor_prices', 'select=id,name,unit,unit_price').then(remote => {
      if (cancelled || !Array.isArray(remote)) return;
      setVendorCatalog(remote.map(it => ({
        name: String(it.name || ''), unit: String(it.unit || ''),
        unitPrice: Number(it.unit_price) || 0,
        category: classifyItem(it.name, it.unit),
      })));
    }).catch(e => console.warn('cloud load vendor_prices:', e));
    window.SB.selectAll('kh_hidden').then(remote => {
      if (cancelled || !Array.isArray(remote)) return;
      if (remote.length) {
        const set = new Set(remote.map(r => r.key));
        setHiddenCatalog(set);
        try { localStorage.setItem(HIDDEN_CATALOG_KEY, JSON.stringify([...set])); } catch (_) {}
      }
    }).catch(e => console.warn('cloud load hidden:', e));
    return () => { cancelled = true; };
  }, []);

  const isHidden = React.useCallback(
    (it) => hiddenCatalog.has(hiddenKey(it.name, it.unit)),
    [hiddenCatalog]
  );
  const visibleUserCatalog = React.useMemo(() => userCatalog.filter(it => !isHidden(it)), [userCatalog, isHidden]);
  const visibleCatalog = React.useMemo(() => catalog.filter(it => !isHidden(it)), [catalog, isHidden]);
  const visibleDdcCatalog = React.useMemo(() => ddcCatalog.filter(it => !isHidden(it)), [ddcCatalog, isHidden]);
  const visibleVendorCatalog = React.useMemo(() => vendorCatalog.filter(it => !isHidden(it)), [vendorCatalog, isHidden]);

  React.useEffect(() => {
    window.KH_DB_COUNT = visibleUserCatalog.length + visibleVendorCatalog.length + visibleCatalog.length + visibleDdcCatalog.length;
    window.dispatchEvent(new Event('kh-storage'));
  }, [visibleUserCatalog.length, visibleVendorCatalog.length, visibleCatalog.length, visibleDdcCatalog.length]);
  const [estimate, setEstimate] = React.useState(loadEstimate);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState({ kind: "idle", text: "" });
  const [pricesBusy, setPricesBusy] = React.useState(false);
  const [pricesProgress, setPricesProgress] = React.useState({ done: 0, total: 0, filled: 0, failed: 0 });
  // Счётчик активных «жизненных циклов» фетча. Инкрементим в самом начале
  // (синхронно, до любого await), декрементим в самом конце (тоже синхронно,
  // после всех await). Это страховка от React-батчинга / unmount + remount:
  // если pricesBusy по какой-то причине промигнул в false, busyTicketsRef
  // всё равно покажет >0, и лоадер останется на месте.
  const busyTicketsRef = React.useRef(0);
  const [busyTickets, setBusyTickets] = React.useState(0);
  const bumpBusy = (delta) => {
    busyTicketsRef.current = Math.max(0, busyTicketsRef.current + delta);
    setBusyTickets(busyTicketsRef.current);
  };
  const nextIdRef = React.useRef(1);
  const estimateRef = React.useRef([]);
  React.useEffect(() => { estimateRef.current = estimate; }, [estimate]);

  React.useEffect(() => {
    const maxId = estimate.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
    if (nextIdRef.current <= maxId) nextIdRef.current = maxId + 1;
  }, []);

  React.useEffect(() => { saveEstimate(estimate); }, [estimate]);

  React.useEffect(() => {
    const filtered = estimate.filter(r => !isHiddenCategory(r.name));
    if (filtered.length !== estimate.length) setEstimate(filtered);
  }, [estimate]);

  React.useEffect(() => {
    // Warm up the price proxy backend (Render free tier sleeps after 15 min of
    // inactivity and the first request after wake-up exceeds the 15s fetch
    // timeout used by searchPriceCandidates). Fire-and-forget; we don't care
    // about the response, just want the container ready by the time the user
    // clicks "Обновить цены".
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 30000);
      fetch(`${PRICES_BACKEND}/prices/search?query=warmup&limit=1`, { signal: ctrl.signal })
        .catch(() => {});
    } catch (_) {}
  }, []);

  React.useEffect(() => {
    setStatus({ kind: "busy", text: "Загрузка каталогов…" });
    Promise.all([loadLocalCatalog(), loadDdcCatalog()])
      .then(([local, ddc]) => {
        setCatalog(local);
        setDdcCatalog(ddc);
        setCatalogReady(true);
        const total = local.length + ddc.length;
        setStatus({
          kind: "done",
          text: `Каталог: ${total.toLocaleString("ru-RU")} позиций (своя ${local.length}, DDC ${ddc.length})`,
        });
      })
      .catch(err => {
        console.error("[Каталог]", err);
        setStatus({ kind: "error", text: `Ошибка загрузки: ${err.message}` });
      });
  }, []);

  const searchResults = React.useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const out = [];
    for (const item of visibleUserCatalog) {
      if (item.name.toLowerCase().includes(q)) {
        out.push(item);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    if (out.length < MAX_RESULTS) {
      for (const item of visibleCatalog) {
        if (item.name.toLowerCase().includes(q)) {
          out.push(item);
          if (out.length >= MAX_RESULTS) break;
        }
      }
    }
    return out;
  }, [query, visibleCatalog, visibleUserCatalog]);

  const totals = React.useMemo(() => {
    const subtotal = estimate.reduce((s, r) => r.notFound ? s : s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    return { subtotal, vat, grand: subtotal + vat };
  }, [estimate]);

  const anyNotFound = React.useMemo(() => estimate.some(r => r.notFound), [estimate]);

  const addRow = React.useCallback((row) => {
    if (isHiddenCategory(row.name)) return;
    setEstimate(prev => [{
      id: nextIdRef.current++,
      name: row.name,
      unit: row.unit || '',
      unitPrice: row.unitPrice || 0,
      qty: row.qty || 1,
      notFound: !!row.notFound,
      source: row.source || (row.notFound ? 'none' : 'local'),
      category: row.category || classifyItem(row.name, row.unit),
      url: row.url || '',
      expanded: false,
      candidates: null,
      candidatesLoading: false,
      candidatesError: null,
    }, ...prev]);
  }, []);

  const removeRow = React.useCallback((id) => {
    setEstimate(prev => prev.filter(r => r.id !== id));
  }, []);

  const resetEstimate = React.useCallback(() => {
    setEstimate([]);
    nextIdRef.current = 1;
    try { localStorage.removeItem(ESTIMATE_KEY); } catch (_) {}
  }, []);

  const createClientLink = React.useCallback(async () => {
    if (!window.SB) throw new Error("Supabase не подключён");
    const rows = estimateRef.current;
    if (!rows || !rows.length) throw new Error("Смета пуста");
    const buf = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    const token = Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
    const slim = rows.map(r => ({
      id: r.id, name: r.name, unit: r.unit || "",
      unitPrice: Number(r.unitPrice) || 0, qty: Number(r.qty) || 0,
      notFound: !!r.notFound, source: r.source || "local", url: r.url || "",
    }));
    const now = new Date().toISOString();
    await window.SB.upsert("kh_client_estimates", [{
      token, rows: slim, created_at: now, updated_at: now,
    }], "token");
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    return base + "client.html?token=" + token;
  }, []);

  const updateQty = React.useCallback((id, qty) => {
    const n = isFinite(qty) && qty >= 0 ? qty : 0;
    setEstimate(prev => prev.map(r => r.id === id ? { ...r, qty: n } : r));
  }, []);

  const updateRow = React.useCallback((id, patch) => {
    setEstimate(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const togglePicker = React.useCallback(async (id) => {
    let row = null;
    setEstimate(prev => {
      const next = prev.map(r => {
        if (r.id !== id) return r;
        row = { ...r, expanded: !r.expanded };
        return row;
      });
      return next;
    });
    if (!row) return;
    const needsFetch = row.expanded && (row.candidates === null || row.candidates.length === 0) && !row.candidatesLoading;
    if (!needsFetch) return;
    setEstimate(prev => prev.map(r => r.id === id ? { ...r, candidatesLoading: true, candidatesError: null } : r));
    try {
      const raw = await searchPriceCandidates(row.name);
      const candidates = raw.filter(x => isRelevantCandidate(row.name, x));
      setEstimate(prev => prev.map(r => r.id === id
        ? { ...r, candidates, candidatesLoading: false }
        : r));
    } catch (err) {
      setEstimate(prev => prev.map(r => r.id === id
        ? { ...r, candidates: [], candidatesLoading: false, candidatesError: err.message }
        : r));
    }
  }, []);

  const applyCandidate = React.useCallback((id, idx) => {
    setEstimate(prev => prev.map(r => {
      if (r.id !== id) return r;
      const c = r.candidates && r.candidates[idx];
      if (!c || !c.price) return r;
      return {
        ...r,
        name: c.name || r.name,
        unit: c.unit || r.unit || 'шт.',
        unitPrice: c.price,
        url: c.url || '',
        source: c.source === 'store' ? 'store' : (KNOWN_SOURCES.has(c.city) ? c.city : 'kolorit'),
        sourceLabel: c.sourceLabel || null,
        notFound: false,
        expanded: false,
      };
    }));
  }, []);

  const applyManualPrice = React.useCallback((id, raw) => {
    const n = parseFloat(String(raw).replace(',', '.'));
    if (!isFinite(n) || n < 0) return;
    setEstimate(prev => prev.map(r => r.id === id
      ? { ...r, unitPrice: n, unit: r.unit || 'шт.', source: 'manual', notFound: false, expanded: false }
      : r));
  }, []);

  const importRows = React.useCallback((rows) => {
    let imported = 0, notFoundCount = 0, skipped = 0, works = 0, materials = 0;
    const additions = [];
    let currentSection = null; // контекст раздела файла: 'work' | 'material'
    const rowText = (row) => (Array.isArray(row) ? row : []).map(c => String(c == null ? '' : c)).join(' ');
    for (const row of rows) {
      if (row && row._sectionLike) {
        const cat = detectSectionCategory(rowText(row));
        if (cat) currentSection = cat;
        skipped++; continue;
      }
      if (row && row._colored) { skipped++; continue; }
      const { name, qty, unit: rowUnit } = extractNameAndQty(row);
      const reason = skipReason(name);
      if (reason) {
        // Текстовый заголовок-раздел («Работы», «Материалы») тоже обновляет контекст.
        const cat = detectSectionCategory(rowText(row));
        if (cat) currentSection = cat;
        skipped++; continue;
      }
      const q = isFinite(qty) && qty > 0 ? qty : 1;
      const match = fuzzyFind(name, [...visibleUserCatalog, ...visibleCatalog], visibleDdcCatalog);
      const itemName = match ? match.name : name;
      const itemUnit = match ? (match.unit || rowUnit || '') : (rowUnit || '');
      const category = classifyCategory(itemName, itemUnit, currentSection);
      if (category === 'work') works++; else materials++;
      if (match) {
        additions.push({ name: match.name, unit: match.unit, unitPrice: match.unitPrice, qty: q, notFound: false, source: match.source, category });
      } else {
        additions.push({ name, unit: '', unitPrice: 0, qty: q, notFound: true, source: 'none', category });
        notFoundCount++;
      }
      imported++;
    }
    setEstimate(prev => {
      const out = prev.slice();
      for (const a of additions) {
        if (isHiddenCategory(a.name)) continue;
        out.push({
          id: nextIdRef.current++,
          name: a.name, unit: a.unit || '', unitPrice: a.unitPrice || 0, qty: a.qty || 1,
          notFound: !!a.notFound, source: a.source || (a.notFound ? 'none' : 'local'),
          category: a.category || 'material', catManual: false,
          url: '', expanded: false, candidates: null, candidatesLoading: false, candidatesError: null,
        });
      }
      // Stable sort: items without prices float to the top of the estimate.
      return out.map((r, i) => [r, i]).sort((a, b) => {
        const an = a[0].notFound ? 0 : 1;
        const bn = b[0].notFound ? 0 : 1;
        return an !== bn ? an - bn : a[1] - b[1];
      }).map(p => p[0]);
    });
    return { imported, notFoundCount, skipped, works, materials };
  }, [visibleCatalog, visibleDdcCatalog, visibleUserCatalog]);

  const handleFile = React.useCallback((file) => {
    setStatus({ kind: "busy", text: `Обработка: ${file.name}…` });
    const ext = (file.name.toLowerCase().split('.').pop() || '').trim();
    const mime = (file.type || '').toLowerCase();

    const fail = (err) => {
      console.error('[handleFile]', err);
      setStatus({ kind: "error", text: `Ошибка разбора: ${err.message || err}` });
    };

    const readBuffer = () => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('не удалось прочитать файл'));
      r.readAsArrayBuffer(file);
    });

    const report = (prefix) => (rows) => {
      const { imported, notFoundCount, skipped, works, materials } = importRows(rows);
      setStatus({ kind: "done", text: `${prefix}: загружено ${imported} (работ ${works}, материалов ${materials}), без цены ${notFoundCount}, пропущено ${skipped}` });
    };

    if (ext === 'csv' || mime === 'text/csv') {
      const r = new FileReader();
      r.onload = () => {
        try { report('CSV')(parseCsv(r.result)); }
        catch (err) { fail(err); }
      };
      r.onerror = () => fail(new Error('не удалось прочитать файл'));
      r.readAsText(file, 'utf-8');
      return;
    }

    if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet')) {
      if (typeof XLSX === 'undefined') { fail(new Error('XLSX не загружен')); return; }
      readBuffer().then(buf => report('XLSX')(readXlsx(new Uint8Array(buf)))).catch(fail);
      return;
    }
    if (ext === 'pdf' || mime === 'application/pdf') {
      setStatus({ kind: "busy", text: 'PDF: загрузка библиотеки…' });
      readBuffer().then(extractPdfText).then(text => report('PDF')(textToRows(text))).catch(fail);
      return;
    }
    if (ext === 'docx' || mime.includes('wordprocessingml')) {
      setStatus({ kind: "busy", text: 'DOCX: извлекаю текст…' });
      readBuffer().then(extractDocxText).then(text => report('DOCX')(textToRows(text))).catch(fail);
      return;
    }
    fail(new Error('поддерживаются только Excel (.xlsx/.xls), PDF, Word (.docx), CSV'));
  }, [importRows]);

  const fetchPricesForNotFound = React.useCallback(async () => {
    const initialTargets = estimateRef.current
      .filter(r => r.notFound)
      .map(r => ({ id: r.id, name: r.name }));
    if (initialTargets.length === 0) return;
    bumpBusy(+1);
    setPricesBusy(true);
    let totalFilled = 0, totalFailed = 0;

    // Один проход воркеров. progressBase позволяет ретраю продолжать счётчик
    // прогресса с того места, где остановился первый проход, чтобы прогресс
    // в лоадере не «откатывался» к нулю.
    const runPass = async (targets, progressBase, progressTotal) => {
      let done = progressBase, filled = 0, failed = 0;
      const queue = targets.slice();
      setPricesProgress({ done, total: progressTotal, filled: totalFilled, failed: 0 });

      async function worker() {
        while (queue.length > 0) {
          const target = queue.shift();
          if (!target) continue;
          const { id, name: rowName } = target;
          let candidates = [];
          let fetchOk = false;
          try {
            const raw = await searchPriceCandidates(rowName);
            candidates = raw.filter(c => c.price).filter(c => isRelevantCandidate(rowName, c));
            fetchOk = true;
          } catch (err) {
            failed++;
          }
          done++;
          if (candidates.length > 0) {
            const c = candidates[0];
            let applied = false;
            setEstimate(prev => prev.map(r => {
              if (r.id !== id) return r;
              if (!r.notFound) return { ...r, candidates };
              applied = true;
              return {
                ...r,
                candidates,
                name: c.name || r.name,
                unitPrice: c.price,
                unit: c.unit || r.unit || 'шт.',
                source: c.source === 'store' ? 'store' : (KNOWN_SOURCES.has(c.city) ? c.city : 'kolorit'),
                sourceLabel: c.sourceLabel || null,
                url: c.url || '',
                notFound: false,
                expanded: false,
              };
            }));
            if (applied) filled++;
          } else if (fetchOk) {
            setEstimate(prev => prev.map(r => r.id === id ? { ...r, candidates: [], expanded: false } : r));
          }
          setPricesProgress({ done, total: progressTotal, filled: totalFilled + filled, failed });
        }
      }
      const workers = Array.from({ length: PRICES_CONCURRENCY }, () =>
        // .catch на каждом воркере, чтобы один сбой не отклонял Promise.all
        // раньше времени — иначе finally{} убирал бы лоадер, а уцелевшие
        // воркеры продолжали бы дописывать цены уже без видимого индикатора.
        worker().catch(err => { console.error('[prices worker]', err); })
      );
      await Promise.all(workers);
      return { filled, failed };
    };

    try {
      // Первый проход.
      const pass1 = await runPass(initialTargets, 0, initialTargets.length);
      totalFilled += pass1.filled;
      totalFailed = pass1.failed;

      // Авто-ретрай: проходим ещё раз по строкам, где фетч провалился
      // (notFound остался true, candidates === null). Помогает когда первая
      // волна частично таймаутит из-за холодного старта прокси, но повторный
      // запрос уже на прогретом сервисе успевает уложиться в таймаут.
      // Строки с candidates === [] (фетч успешен, но ничего не нашлось)
      // не ретраим — это легитимно «нет соответствия в каталогах».
      const retryTargets = estimateRef.current
        .filter(r => {
          if (!r.notFound) return false;
          if (r.candidates !== null) return false;
          return initialTargets.some(t => t.id === r.id);
        })
        .map(r => ({ id: r.id, name: r.name }));

      if (retryTargets.length > 0) {
        const totalWithRetry = initialTargets.length + retryTargets.length;
        const pass2 = await runPass(retryTargets, initialTargets.length, totalWithRetry);
        totalFilled += pass2.filled;
        totalFailed = pass2.failed;
      }
    } catch (err) {
      setStatus({ kind: "error", text: `Сервис цен недоступен: ${err.message}` });
    } finally {
      setPricesBusy(false);
      bumpBusy(-1);
      if (totalFailed > 0) {
        setStatus({
          kind: totalFailed === initialTargets.length ? "error" : "done",
          text: `Цены: загружено ${totalFilled}, не удалось ${totalFailed} из ${initialTargets.length}${totalFailed === initialTargets.length ? ' — нажмите «Обновить цены» ещё раз' : ''}`,
        });
      }
    }
  }, []);

  const exportCsv = React.useCallback(() => {
    if (estimate.length === 0) return;
    const rows = [['Название', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Итого', 'Источник']];
    for (const r of estimate) {
      rows.push([
        r.name, r.unit, r.qty,
        r.notFound ? 'цена не найдена' : r.unitPrice.toFixed(2),
        r.notFound ? '' : (r.qty * r.unitPrice).toFixed(2),
        SOURCE_LABELS[r.source] || '',
      ]);
    }
    rows.push([]);
    rows.push(['', '', '', 'Сумма', totals.subtotal.toFixed(2), '']);
    rows.push(['', '', '', 'НДС 22%', totals.vat.toFixed(2), '']);
    rows.push(['', '', '', 'Итого с НДС', totals.grand.toFixed(2), '']);
    downloadCsv(rows, `estimate-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [estimate, totals]);

  const exportDoc = React.useCallback(() => {
    if (estimate.length === 0) return;

    let meta = {};
    try { meta = JSON.parse(localStorage.getItem('kh-meta-v1') || '{}'); } catch (_) {}

    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const num = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
    const qtyFmt = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

    const title        = meta.title || '';
    const code         = meta.code || '';
    const construction = meta.construction || '';
    const areaText     = meta.areaText || '';
    const location     = meta.location || '';
    const date         = meta.date || '';
    const estimator    = meta.estimator || '';

    const titleLine = construction
      ? `${esc(construction)}&nbsp;&mdash; <em>проект «${esc(title)}»</em>`
      : `Смета <em>«${esc(title)}»</em>`;

    const recipientBits = [];
    if (location)  recipientBits.push(`<b>${esc(location)}</b>`);
    if (areaText)  recipientBits.push(esc(areaText));
    if (estimator) recipientBits.push(`менеджер&nbsp;<b>${esc(estimator)}</b>`);
    const recipientLine = recipientBits.length
      ? `Подготовлено для&nbsp;${recipientBits.join(' &middot; ')}`
      : '';

    const metaLine = ['Коммерческое предложение',
                      code ? `<span class="num">№&nbsp;${esc(code)}</span>` : '',
                      date ? esc(date) : '']
      .filter(Boolean).join(' <span class="dot">·</span> ');

    const rowsHtml = estimate.map((r, i) => {
      const totalCell = r.notFound ? '&mdash;' : num(r.qty * r.unitPrice);
      const priceCell = r.notFound ? '&mdash;' : num(r.unitPrice);
      const qtyCell   = `${qtyFmt(r.qty)}${r.unit ? '&nbsp;' + esc(r.unit) : ''}`;
      return `<tr>
        <td class="idx">${String(i + 1).padStart(2, '0')}</td>
        <td class="name">${esc(r.name)}</td>
        <td class="right">${priceCell}</td>
        <td class="right">${qtyCell}</td>
        <td class="right">${totalCell}</td>
      </tr>`;
    }).join('');

    const grandTotalStr = num(totals.grand) + '&nbsp;&#8381;';
    const today = new Date();
    const validUntil = new Date(today.getTime() + 14 * 86400000);
    const vu = `${String(validUntil.getDate()).padStart(2,'0')}.${String(validUntil.getMonth()+1).padStart(2,'0')}.${validUntil.getFullYear()}`;

    const html = `<!doctype html>
<html lang="ru" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Смета «${esc(title)}»</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  body{margin:0;padding:0;background:#e8e0cf;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;color:#1f1a15}
  .page{width:100%;max-width:1100px;margin:0 auto;background:#f6f1e9;padding:48px 56px 56px 56px;border-bottom:6px solid #a07a4a;box-sizing:border-box}
  .meta{font-family:'Consolas','Courier New',monospace;font-size:12px;letter-spacing:.16em;color:#5b524a;text-transform:uppercase;line-height:1.6;text-align:center}
  .meta .num{color:#7a5a36;font-weight:600;letter-spacing:.1em}
  .meta .dot{color:#c8b994}
  h1.title{font-family:'Cormorant Garamond','Georgia',serif;font-weight:500;font-size:54pt;line-height:1.05;margin:14px 0 20px;color:#1f1a15}
  h1.title em{font-style:italic;color:#7a5a36;font-weight:500}
  .recipient{font-size:14pt;color:#5b524a;line-height:1.55;padding-bottom:22px;border-bottom:1px solid #d9cdb6}
  .recipient b{color:#1f1a15;font-weight:600}
  table.contacts{width:100%;border-collapse:collapse;margin:0;border-bottom:1px solid #d9cdb6}
  table.contacts td{padding:24px 12px 32px;vertical-align:top;width:33%}
  table.contacts td:first-child{padding-left:0}
  table.contacts td:last-child{padding-right:0}
  .contacts-label{font-family:'Consolas','Courier New',monospace;font-size:10px;font-weight:600;letter-spacing:.22em;color:#7a5a36;margin-bottom:8px;text-transform:uppercase}
  .contacts-val{font-size:13pt;line-height:1.5;color:#5b524a}
  .contacts-val b{color:#1f1a15;font-weight:600}
  .section-eyebrow{font-family:'Consolas','Courier New',monospace;font-size:11px;font-weight:600;letter-spacing:.28em;color:#7a5a36;text-transform:uppercase;margin:36px 0 16px;padding-bottom:14px;border-bottom:1px solid #d9cdb6;text-align:center}
  .estimate-wrap{margin:0 auto;text-align:center;width:100%}
  table.estimate{width:100%;border-collapse:collapse;border:1px solid #d9cdb6;background:#f6f1e9;margin:0;mso-table-lspace:0;mso-table-rspace:0}
  table.estimate th{background:#1f1a15;color:#f3ead8;font-family:'Consolas','Courier New',monospace;font-size:10px;font-weight:400;letter-spacing:.22em;text-transform:uppercase;padding:16px 18px;text-align:center;border:0}
  table.estimate th.left{text-align:left}
  table.estimate td{padding:20px 18px;border-bottom:1px solid #d9cdb6;vertical-align:top;font-size:13pt;color:#5b524a;text-align:center;font-weight:400}
  table.estimate td.idx{color:#8a7f73;font-family:'Consolas','Courier New',monospace;font-weight:400;width:64px;text-align:center}
  table.estimate td.name{text-align:left;color:#1f1a15;font-size:13pt;font-weight:500;font-family:'Manrope','Helvetica Neue',Arial,sans-serif}
  table.estimate td.right{text-align:center;color:#1f1a15;font-weight:500}
  table.estimate tr.total td{background:#efe7d7;border-bottom:0;padding:22px 18px}
  .sum{font-family:'Consolas','Courier New',monospace;font-size:18pt;font-weight:600;color:#7a5a36;letter-spacing:.02em}
  table.sign-row{width:100%;border-collapse:collapse;margin-top:48px}
  table.sign-row td{vertical-align:bottom;padding:0;width:50%}
  table.sign-row td.left{padding-right:20pt}
  table.sign-row td.r{padding-left:20pt}
  .lead{font-size:12pt;color:#5b524a;margin-bottom:6px}
  .sign h3{margin:0 0 6px;font-size:15pt;font-weight:600;color:#1f1a15;font-family:'Manrope','Helvetica Neue',Arial,sans-serif}
  .sign p{margin:0;font-size:12pt;line-height:1.65;color:#5b524a}
  .stamp-cell{border-top:1px solid #c8b994;padding-top:18px;text-align:right;font-family:'Consolas','Courier New',monospace;font-size:10px;letter-spacing:.22em;color:#5b524a;line-height:2}
  .stamp-cell b{color:#1f1a15;font-weight:600;letter-spacing:.16em}
  table.page-foot{width:100%;border-collapse:collapse;margin-top:40px;border-top:1px solid #d9cdb6}
  table.page-foot td{padding:18px 0 0 0;font-family:'Consolas','Courier New',monospace;font-size:10px;letter-spacing:.24em;color:#8a7f73;text-transform:uppercase;vertical-align:middle}
  table.page-foot td.c{text-align:center;width:120pt}
  table.page-foot td.r{text-align:right}
  .accent-bar{width:80px;height:3px;background:#7a5a36;display:inline-block}
</style>
</head>
<body>
<div class="page">
  <div class="meta">${metaLine}</div>
  <h1 class="title">${titleLine}</h1>
  ${recipientLine ? `<div class="recipient">${recipientLine}</div>` : ''}
  <table class="contacts"><tr>
    <td><div class="contacts-label">Телефон</div><div class="contacts-val" style="white-space:nowrap"><b>+7&nbsp;(495)&nbsp;128&#8209;41&#8209;11</b></div></td>
    <td><div class="contacts-label">Почта &middot; Сайт</div><div class="contacts-val"><b>info@kub.team</b><br>kub.house</div></td>
    <td><div class="contacts-label">Офис</div><div class="contacts-val"><b>Москва</b>, Малая Ордынка 39 с1</div></td>
  </tr></table>
  <div class="section-eyebrow">Ориентировочная смета</div>
  <div class="estimate-wrap" align="center">
  <table class="estimate" align="center">
    <thead><tr>
      <th>&#8470;</th>
      <th class="left">Название работ</th>
      <th>Цена,&nbsp;&#8381;</th>
      <th>Кол&#8209;во</th>
      <th>Итого,&nbsp;&#8381;</th>
    </tr></thead>
    <tbody>${rowsHtml}
      <tr class="total">
        <td class="idx"></td>
        <td class="name" style="font-weight:600">Итого по&nbsp;объекту</td>
        <td></td><td></td>
        <td class="right sum">${grandTotalStr}</td>
      </tr>
    </tbody>
  </table>
  </div>
  <table class="sign-row"><tr>
    <td class="left sign">
      <div class="lead">С уважением,</div>
      <h3>${esc(estimator || 'Менеджер проекта')}</h3>
      <p>KUB&nbsp;HOUSE<br>+7 (495) 128&#8209;41&#8209;11 &middot; info@kub.team</p>
    </td>
    <td class="r">
      <div class="stamp-cell">
        <div>Действительно до &middot; <b>${vu}</b></div>
        <div>М.&nbsp;П.</div>
      </div>
    </td>
  </tr></table>
  <table class="page-foot"><tr>
    <td>kub.house</td>
    <td class="c"><span class="accent-bar"></span></td>
    <td class="r">Стр. 01</td>
  </tr></table>
</div>
</body></html>`;

    const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').trim();
    const fileTag = safe(code) || safe(title) || new Date().toISOString().slice(0, 10);
    const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Смета-${fileTag}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }, [estimate, totals]);

  const addBlankRow = React.useCallback(() => {
    setEstimate(prev => [{
      id: nextIdRef.current++,
      name: 'Новая позиция',
      unit: '',
      unitPrice: 0,
      qty: 1,
      notFound: true,
      source: 'none',
      category: 'material',
      url: '',
      expanded: false,
      candidates: null,
      candidatesLoading: false,
      candidatesError: null,
    }, ...prev]);
  }, []);

  const addCatalogItem = React.useCallback(({ name, unit, unitPrice, category }) => {
    setUserCatalog(prev => {
      const key = (s) => `${s.name}|${s.unit}`;
      const filtered = prev.filter(it => key(it) !== key({ name, unit }));
      const item = {
        name: String(name).trim(),
        unit: String(unit || "").trim(),
        unitPrice: Number(unitPrice) || 0,
        category: category === 'work' ? 'work' : (category === 'material' ? 'material' : classifyItem(name, unit)),
        tokenSet: new Set(tokenize(name)),
      };
      const next = [item, ...filtered];
      saveUserCatalog(next);
      return next;
    });
  }, []);

  const removeCatalogItem = React.useCallback((name, unit, kind) => {
    if (kind === "user") {
      setUserCatalog(prev => {
        const next = prev.filter(it => !(it.name === name && (it.unit || "") === (unit || "")));
        saveUserCatalog(next);
        return next;
      });
      if (window.SB) {
        const u = encodeURIComponent;
        window.SB.remove('kh_user_catalog', `name=eq.${u(name)}&unit=eq.${u(unit || '')}`).catch(e => console.warn('cloud user_catalog del:', e));
      }
      return;
    }
    setHiddenCatalog(prev => {
      const next = new Set(prev);
      next.add(hiddenKey(name, unit));
      saveHiddenCatalog(next);
      return next;
    });
  }, []);

  const restoreCatalogItem = React.useCallback((name, unit) => {
    const k = hiddenKey(name, unit);
    setHiddenCatalog(prev => {
      const next = new Set(prev);
      next.delete(k);
      saveHiddenCatalog(next);
      return next;
    });
    if (window.SB) window.SB.remove('kh_hidden', `key=eq.${encodeURIComponent(k)}`).catch(e => console.warn('cloud hidden del:', e));
  }, []);

  const clearHiddenCatalog = React.useCallback(() => {
    setHiddenCatalog(() => {
      const next = new Set();
      saveHiddenCatalog(next);
      return next;
    });
    if (window.SB) window.SB.remove('kh_hidden', 'key=neq.__never__').catch(e => console.warn('cloud hidden clear:', e));
  }, []);

  const unhideKeys = React.useCallback((keys) => {
    if (!keys || !keys.length) return;
    setHiddenCatalog(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const k of keys) if (next.delete(k)) changed = true;
      if (!changed) return prev;
      saveHiddenCatalog(next);
      return next;
    });
    if (window.SB) {
      const list = keys.map(k => `"${k.replace(/"/g, '\\"')}"`).join(',');
      window.SB.remove('kh_hidden', `key=in.(${list})`).catch(e => console.warn('cloud hidden bulk unhide:', e));
    }
  }, []);

  const removeVendorPrice = React.useCallback((id) => {
    if (!id || !window.SB) return Promise.resolve();
    return window.SB.remove('kh_vendor_prices', `id=eq.${encodeURIComponent(id)}`)
      .catch(e => { console.warn('cloud vendor price del:', e); throw e; });
  }, []);

  const updateVendorPrice = React.useCallback((id, unitPrice) => {
    if (!id || !window.SB) return Promise.resolve();
    return window.SB.patch('kh_vendor_prices', `id=eq.${encodeURIComponent(id)}`, {
      unit_price: Number(unitPrice) || 0,
      updated_at: new Date().toISOString(),
    }).catch(e => { console.warn('cloud vendor price patch:', e); throw e; });
  }, []);

  const uploadCatalogFile = React.useCallback((file) => {
    const ext = (file.name.toLowerCase().split('.').pop() || '').trim();
    const mime = (file.type || '').toLowerCase();

    const ingest = (rows) => {
      const items = parseUserCatalogRows(rows);
      if (items.length === 0) {
        return { added: 0, skipped: rows.length };
      }
      setUserCatalog(prev => {
        const map = new Map();
        for (const it of prev) map.set(`${it.name}|${it.unit}`, it);
        for (const it of items) {
          map.set(`${it.name}|${it.unit}`, {
            name: it.name, unit: it.unit, unitPrice: it.unitPrice,
            category: it.category || classifyItem(it.name, it.unit),
            tokenSet: new Set(tokenize(it.name)),
          });
        }
        const next = Array.from(map.values());
        saveUserCatalog(next);
        return next;
      });
      const works = items.filter(it => it.category === 'work').length;
      return { added: items.length, works, materials: items.length - works, skipped: Math.max(0, rows.length - items.length) };
    };

    const readBuffer = () => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('не удалось прочитать файл'));
      r.readAsArrayBuffer(file);
    });

    if (ext === 'csv' || mime === 'text/csv') {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          try { resolve(ingest(parseCsv(r.result))); }
          catch (err) { reject(err); }
        };
        r.onerror = () => reject(new Error('не удалось прочитать файл'));
        r.readAsText(file, 'utf-8');
      });
    }
    if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet')) {
      if (typeof XLSX === 'undefined') return Promise.reject(new Error('XLSX не загружен'));
      return readBuffer().then(buf => ingest(readXlsx(new Uint8Array(buf))));
    }
    return Promise.reject(new Error('поддерживаются только Excel (.xlsx/.xls) и CSV'));
  }, []);

  return {
    state: { catalog, ddcCatalog, userCatalog, vendorCatalog, hiddenCatalog, catOverride, catalogReady, estimate, query, status, pricesBusy, pricesProgress, searchResults, totals, anyNotFound, busyTickets },
    actions: {
      setQuery, addRow, removeRow, resetEstimate, createClientLink, updateQty, updateRow, togglePicker, applyCandidate,
      applyManualPrice, handleFile, fetchPricesForNotFound, exportCsv, exportDoc, addBlankRow,
      addCatalogItem, removeCatalogItem, restoreCatalogItem, clearHiddenCatalog, unhideKeys, removeVendorPrice, updateVendorPrice, uploadCatalogFile, setItemCategory,
    },
  };
}

Object.assign(window, { useEstimate });
