// useEstimate.jsx — React hook owning estimate state and actions.

const USER_CATALOG_KEY = "kh-user-catalog-v1";
const HIDDEN_CATALOG_KEY = "kh-hidden-catalog-v1";

const hiddenKey = (name, unit) => `${String(name || "").trim().toLowerCase()}|${String(unit || "").trim().toLowerCase()}`;

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
  try { localStorage.setItem(HIDDEN_CATALOG_KEY, JSON.stringify([...set])); } catch (_) {}
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
      tokenSet: new Set(tokenize(x.name)),
    }));
  } catch (_) { return []; }
}

function saveUserCatalog(items) {
  try {
    const slim = items.map(({ name, unit, unitPrice }) => ({ name, unit, unitPrice }));
    localStorage.setItem(USER_CATALOG_KEY, JSON.stringify(slim));
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
    if (!name || name.length < 2) continue;
    if (isNaN(price) || price <= 0) continue;
    out.push({ name, unit: unit.trim(), unitPrice: price });
  }
  return out;
}

function useEstimate() {
  const [catalog, setCatalog] = React.useState([]);
  const [ddcCatalog, setDdcCatalog] = React.useState([]);
  const [userCatalog, setUserCatalog] = React.useState(loadUserCatalog);
  const [hiddenCatalog, setHiddenCatalog] = React.useState(loadHiddenCatalog);
  const [catalogReady, setCatalogReady] = React.useState(false);

  const isHidden = React.useCallback(
    (it) => hiddenCatalog.has(hiddenKey(it.name, it.unit)),
    [hiddenCatalog]
  );
  const visibleUserCatalog = React.useMemo(() => userCatalog.filter(it => !isHidden(it)), [userCatalog, isHidden]);
  const visibleCatalog = React.useMemo(() => catalog.filter(it => !isHidden(it)), [catalog, isHidden]);
  const visibleDdcCatalog = React.useMemo(() => ddcCatalog.filter(it => !isHidden(it)), [ddcCatalog, isHidden]);
  const [estimate, setEstimate] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState({ kind: "idle", text: "" });
  const [pricesBusy, setPricesBusy] = React.useState(false);
  const [pricesProgress, setPricesProgress] = React.useState({ done: 0, total: 0, filled: 0, failed: 0 });
  const nextIdRef = React.useRef(1);
  const estimateRef = React.useRef([]);
  React.useEffect(() => { estimateRef.current = estimate; }, [estimate]);

  React.useEffect(() => {
    const filtered = estimate.filter(r => !isHiddenCategory(r.name));
    if (filtered.length !== estimate.length) setEstimate(filtered);
  }, [estimate]);

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
    setEstimate(prev => [...prev, {
      id: nextIdRef.current++,
      name: row.name,
      unit: row.unit || '',
      unitPrice: row.unitPrice || 0,
      qty: row.qty || 1,
      notFound: !!row.notFound,
      source: row.source || (row.notFound ? 'none' : 'local'),
      url: row.url || '',
      expanded: false,
      candidates: null,
      candidatesLoading: false,
      candidatesError: null,
    }]);
  }, []);

  const removeRow = React.useCallback((id) => {
    setEstimate(prev => prev.filter(r => r.id !== id));
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
        source: KNOWN_SOURCES.has(c.city) ? c.city : 'kolorit',
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
    let imported = 0, notFoundCount = 0, skipped = 0;
    const additions = [];
    for (const row of rows) {
      if (row && (row._colored || row._sectionLike)) { skipped++; continue; }
      const { name, qty } = extractNameAndQty(row);
      const reason = skipReason(name);
      if (reason) { skipped++; continue; }
      const q = isFinite(qty) && qty > 0 ? qty : 1;
      const match = fuzzyFind(name, [...visibleUserCatalog, ...visibleCatalog], visibleDdcCatalog);
      if (match) {
        additions.push({ name: match.name, unit: match.unit, unitPrice: match.unitPrice, qty: q, notFound: false, source: match.source });
      } else {
        additions.push({ name, unit: '', unitPrice: 0, qty: q, notFound: true, source: 'none' });
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
          url: '', expanded: false, candidates: null, candidatesLoading: false, candidatesError: null,
        });
      }
      return out;
    });
    return { imported, notFoundCount, skipped };
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
      const { imported, notFoundCount, skipped } = importRows(rows);
      setStatus({ kind: "done", text: `${prefix}: загружено ${imported}, без цены ${notFoundCount}, пропущено ${skipped}` });
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
    const targetIds = estimateRef.current.filter(r => r.notFound).map(r => r.id);
    if (targetIds.length === 0) return;
    setPricesBusy(true);
    setPricesProgress({ done: 0, total: targetIds.length, filled: 0, failed: 0 });
    let done = 0, filled = 0, failed = 0, ambiguous = 0;
    const queue = targetIds.slice();

    async function worker() {
      while (queue.length > 0) {
        const id = queue.shift();
        const row = estimateRef.current.find(r => r.id === id);
        if (!row) continue;
        const rowName = row.name;
        let candidates = [];
        try {
          const raw = await searchPriceCandidates(rowName);
          candidates = raw.filter(c => c.price).filter(c => isRelevantCandidate(rowName, c));
        } catch (err) {
          failed++;
        }
        done++;
        if (candidates.length > 0) {
          if (candidates.length > 1) ambiguous++;
          const c = candidates[0];
          setEstimate(prev => prev.map(r => {
            if (r.id !== id) return r;
            if (!r.notFound) return { ...r, candidates };
            filled++;
            return {
              ...r,
              candidates,
              name: c.name || r.name,
              unitPrice: c.price,
              unit: c.unit || r.unit || 'шт.',
              source: KNOWN_SOURCES.has(c.city) ? c.city : 'kolorit',
              url: c.url || '',
              notFound: false,
              expanded: false,
            };
          }));
        } else {
          setEstimate(prev => prev.map(r => r.id === id ? { ...r, candidates: [], expanded: false } : r));
        }
        setPricesProgress({ done, total: targetIds.length, filled, failed });
      }
    }
    const workers = Array.from({ length: PRICES_CONCURRENCY }, () => worker());
    try {
      await Promise.all(workers);
    } catch (err) {
      setStatus({ kind: "error", text: `Сервис цен недоступен: ${err.message}` });
    } finally {
      setPricesBusy(false);
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
    rows.push(['', '', '', 'НДС 20%', totals.vat.toFixed(2), '']);
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
    const qty = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

    const title = meta.title || '';
    const code = meta.code || '';
    const kind = meta.kind || '';
    const construction = meta.construction || '';
    const areaText = meta.areaText || '';
    const location = meta.location || '';
    const stage = meta.stage || '';
    const revision = meta.revision || '';
    const date = meta.date || '';
    const estimator = meta.estimator || '';

    const subtitleBits = [code, kind, construction, areaText, location, stage].filter(Boolean);

    const rowsHtml = estimate.map((r, i) => `
      <tr>
        <td>${String(i + 1).padStart(2, '0')}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.unit || '')}</td>
        <td style="text-align:right">${qty(r.qty)}</td>
        <td style="text-align:right">${r.notFound ? '—' : num(r.unitPrice)}</td>
        <td style="text-align:right">${r.notFound ? '—' : num(r.qty * r.unitPrice)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Смета «${esc(title)}»</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2cm; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1d1a17; font-size: 11pt; }
.brand { font-size: 28pt; letter-spacing: .14em; font-weight: 700; font-family: Georgia, serif; }
.tag { font-size: 9pt; color: #6b6258; letter-spacing: .08em; margin-bottom: 18pt; text-transform: uppercase; }
table.head { width: 100%; border-collapse: collapse; margin-bottom: 18pt; }
table.head td { vertical-align: top; padding: 0; border: 0; }
table.head td.r { text-align: right; }
.label { color: #8c8378; font-size: 9pt; letter-spacing: .06em; text-transform: uppercase; }
h1.kp-title { font-size: 18pt; font-weight: 600; margin: 12pt 0 4pt; font-family: Georgia, serif; }
.kp-title em { font-style: italic; }
.client { font-size: 11pt; color: #2b2722; margin-bottom: 14pt; }
table.items { width: 100%; border-collapse: collapse; margin: 14pt 0; font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 10pt; }
table.items th, table.items td { border: 1px solid #d6cfc4; padding: 6pt 8pt; text-align: left; }
table.items th { background: #f0e9dc; font-weight: 600; font-size: 9pt; letter-spacing: .04em; text-transform: uppercase; }
table.totals { width: 100%; border-collapse: collapse; margin-top: 10pt; font-size: 11pt; }
table.totals td { padding: 4pt 0; border: 0; }
table.totals td.v { text-align: right; font-weight: 600; }
table.totals tr.grand td { font-size: 14pt; font-weight: 700; border-top: 2px solid #1d1a17; padding-top: 8pt; }
.footer { margin-top: 24pt; font-size: 10pt; color: #4a4239; line-height: 1.6; border-top: 1px solid #d6cfc4; padding-top: 14pt; }
.footer b { color: #1d1a17; }
</style>
</head>
<body>
<table class="head"><tr>
  <td>
    <div class="brand">KUB·HOUSE</div>
    <div class="tag">Modern Wood Development · Est. 2014 · Made in Moscow</div>
  </td>
  <td class="r">
    ${revision  ? `<div><span class="label">Ревизия</span> <b>${esc(revision)}</b></div>` : ''}
    ${date      ? `<div><span class="label">Дата</span> <b>${esc(date)}</b></div>` : ''}
    ${estimator ? `<div><span class="label">Сметчик</span> <b>${esc(estimator)}</b></div>` : ''}
  </td>
</tr></table>

<h1 class="kp-title">Смета <em>«${esc(title)}»</em></h1>
${subtitleBits.length ? `<div class="client">${esc(subtitleBits.join(' · '))}</div>` : ''}

<table class="items">
<thead><tr>
  <th style="width:30pt">№</th>
  <th>Наименование</th>
  <th style="width:55pt">Ед.</th>
  <th style="width:60pt;text-align:right">Кол-во</th>
  <th style="width:80pt;text-align:right">Цена, ₽</th>
  <th style="width:95pt;text-align:right">Сумма, ₽</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>

<table class="totals">
<tr><td>Сумма без НДС</td><td class="v">${num(totals.subtotal)} ₽</td></tr>
<tr><td>НДС 20%</td><td class="v">${num(totals.vat)} ₽</td></tr>
<tr class="grand"><td>Итого с НДС</td><td class="v">${num(totals.grand)} ₽</td></tr>
</table>

<div class="footer">
<b>Контакты:</b> +7 (495) 128-41-11 · info@kub.team · kub.house<br>
<b>Офис:</b> Москва, Малая Ордынка 39 с1 · пн–пт 10:00–18:00<br>
<b>Гарантия:</b> 10 лет
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
    addRow({ name: 'Новая позиция', unit: '', unitPrice: 0, qty: 1, notFound: true, source: 'none' });
  }, [addRow]);

  const addCatalogItem = React.useCallback(({ name, unit, unitPrice }) => {
    setUserCatalog(prev => {
      const key = (s) => `${s.name}|${s.unit}`;
      const filtered = prev.filter(it => key(it) !== key({ name, unit }));
      const item = {
        name: String(name).trim(),
        unit: String(unit || "").trim(),
        unitPrice: Number(unitPrice) || 0,
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
    setHiddenCatalog(prev => {
      const next = new Set(prev);
      next.delete(hiddenKey(name, unit));
      saveHiddenCatalog(next);
      return next;
    });
  }, []);

  const clearHiddenCatalog = React.useCallback(() => {
    setHiddenCatalog(() => {
      const next = new Set();
      saveHiddenCatalog(next);
      return next;
    });
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
            tokenSet: new Set(tokenize(it.name)),
          });
        }
        const next = Array.from(map.values());
        saveUserCatalog(next);
        return next;
      });
      return { added: items.length, skipped: Math.max(0, rows.length - items.length) };
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
    state: { catalog, ddcCatalog, userCatalog, hiddenCatalog, catalogReady, estimate, query, status, pricesBusy, pricesProgress, searchResults, totals, anyNotFound },
    actions: {
      setQuery, addRow, removeRow, updateQty, updateRow, togglePicker, applyCandidate,
      applyManualPrice, handleFile, fetchPricesForNotFound, exportCsv, exportDoc, addBlankRow,
      addCatalogItem, removeCatalogItem, restoreCatalogItem, clearHiddenCatalog, uploadCatalogFile,
    },
  };
}

Object.assign(window, { useEstimate });
