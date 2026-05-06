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

    const title        = meta.title || '';
    const code         = meta.code || '';
    const kind         = meta.kind || '';
    const construction = meta.construction || '';
    const areaText     = meta.areaText || '';
    const location     = meta.location || '';
    const stage        = meta.stage || '';
    const date         = meta.date || '';
    const estimator    = meta.estimator || '';

    const titleHtml = construction
      ? `${esc(construction)} &mdash; <em style="font-style:italic;color:#6b6258;">проект</em> &laquo;${esc(title)}&raquo;`
      : `Смета <em style="font-style:italic;">&laquo;${esc(title)}&raquo;</em>`;

    const subBits = [];
    if (kind && areaText) subBits.push(`${esc(kind)}, ${esc(areaText)}`);
    else if (kind) subBits.push(esc(kind));
    else if (areaText) subBits.push(esc(areaText));
    if (location) subBits.push(esc(location));
    if (stage) subBits.push(esc(stage));
    if (estimator) subBits.push(`менеджер <b>${esc(estimator)}</b>`);
    const subLine = subBits.join(' &middot; ');

    const headLine = ['Коммерческое предложение', code ? `&#8470; ${esc(code)}` : '', date ? esc(date) : '']
      .filter(Boolean).join(' &middot; ');

    const rowsHtml = estimate.map((r, i) => {
      const odd = i % 2 === 1;
      const total = r.notFound ? '—' : num(r.qty * r.unitPrice);
      const price = r.notFound ? '—' : num(r.unitPrice);
      const qtyText = `${qty(r.qty)}${r.unit ? ' ' + esc(r.unit) : ''}`;
      return `<tr style="background:${odd ? '#f5ecdb' : '#fbf5e6'};">
        <td style="padding:14pt 10pt;border-bottom:1pt solid #e0d5be;font-family:Arial,sans-serif;font-size:10pt;color:#8c8378;width:40pt;">${String(i + 1).padStart(2, '0')}</td>
        <td style="padding:14pt 10pt;border-bottom:1pt solid #e0d5be;font-family:Georgia,serif;font-size:11pt;color:#1d1a17;font-weight:600;">${esc(r.name)}</td>
        <td style="padding:14pt 10pt;border-bottom:1pt solid #e0d5be;font-family:Arial,sans-serif;font-size:11pt;color:#1d1a17;text-align:right;">${price}</td>
        <td style="padding:14pt 10pt;border-bottom:1pt solid #e0d5be;font-family:Arial,sans-serif;font-size:11pt;color:#1d1a17;text-align:right;">${qtyText}</td>
        <td style="padding:14pt 10pt;border-bottom:1pt solid #e0d5be;font-family:Arial,sans-serif;font-size:11pt;color:#1d1a17;text-align:right;font-weight:700;">${total}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Смета «${esc(title)}»</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: A4; margin: 0cm; mso-page-orientation: portrait; }
div.WordSection1 { page: WordSection1; }
body { margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; color: #1d1a17; }
</style>
</head>
<body>
<div class="WordSection1">
<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
<tr>
  <!-- DARK SIDEBAR -->
  <td valign="top" style="width:200pt;background:#1d1a17;padding:34pt 22pt 34pt 22pt;color:#f3ebd9;">
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:38pt;border:1.5pt solid #f3ebd9;width:120pt;">
      <tr><td style="padding:18pt 0 6pt 0;text-align:center;font-family:Georgia,serif;font-size:22pt;font-weight:700;letter-spacing:.10em;line-height:1;color:#f3ebd9;">KUB</td></tr>
      <tr><td style="padding:0;border-top:1pt solid #f3ebd9;line-height:0;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:6pt 0 18pt 0;text-align:center;font-family:Georgia,serif;font-size:22pt;font-weight:700;letter-spacing:.10em;line-height:1;color:#f3ebd9;">HOUSE</td></tr>
    </table>
    <div style="font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.14em;line-height:1.6;color:#f3ebd9;">
      KUB HOUSE<br>
      MODERN WOOD<br>
      DEVELOPMENT
    </div>
    <div style="margin-top:28pt;font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.14em;line-height:1.6;color:#f3ebd9;">
      EST. 2014<br>
      MADE IN MOSCOW
    </div>
  </td>
  <!-- CONTENT -->
  <td valign="top" style="background:#f5ecdb;padding:34pt 38pt 38pt 38pt;">
    <div style="font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.18em;color:#6b6258;text-transform:uppercase;">${headLine}</div>
    <h1 style="font-family:Georgia,serif;font-size:24pt;font-weight:600;margin:16pt 0 14pt 0;line-height:1.2;color:#1d1a17;">${titleHtml}</h1>
    ${subLine ? `<div style="font-family:Georgia,serif;font-size:11pt;color:#2b2722;line-height:1.5;">${subLine}</div>` : ''}
    <hr style="border:0;border-top:1px solid #c9b988;margin:24pt 0 22pt 0;">
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:30pt;">
      <tr>
        <td valign="top" style="padding-right:14pt;width:25%;">
          <div style="font-family:Arial,sans-serif;font-size:8pt;letter-spacing:.16em;color:#8c8378;text-transform:uppercase;margin-bottom:6pt;">Телефон</div>
          <div style="font-family:Georgia,serif;font-size:11pt;color:#1d1a17;"><b>+7 (495) 128-41-11</b></div>
        </td>
        <td valign="top" style="padding-right:14pt;width:25%;">
          <div style="font-family:Arial,sans-serif;font-size:8pt;letter-spacing:.16em;color:#8c8378;text-transform:uppercase;margin-bottom:6pt;">Почта &middot; Сайт</div>
          <div style="font-family:Georgia,serif;font-size:11pt;color:#1d1a17;line-height:1.5;"><b>info@kub.team</b><br>kub.house</div>
        </td>
        <td valign="top" style="padding-right:14pt;width:25%;">
          <div style="font-family:Arial,sans-serif;font-size:8pt;letter-spacing:.16em;color:#8c8378;text-transform:uppercase;margin-bottom:6pt;">Офис</div>
          <div style="font-family:Georgia,serif;font-size:11pt;color:#1d1a17;line-height:1.5;"><b>Москва</b>, Малая<br>Ордынка 39 с1</div>
        </td>
        <td valign="top" style="width:25%;">
          <div style="font-family:Arial,sans-serif;font-size:8pt;letter-spacing:.16em;color:#8c8378;text-transform:uppercase;margin-bottom:6pt;">График</div>
          <div style="font-family:Georgia,serif;font-size:11pt;color:#1d1a17;line-height:1.5;">Пн&ndash;Пт 10:00&ndash;18:00<br>Сб&ndash;Вс: выходной</div>
        </td>
      </tr>
    </table>
    <div style="font-family:Arial,sans-serif;font-size:10pt;letter-spacing:.22em;color:#8c8378;text-transform:uppercase;margin-bottom:14pt;">Ориентировочная смета</div>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#1d1a17;color:#f3ebd9;">
          <th style="padding:18pt 10pt;text-align:left;font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.16em;font-weight:600;width:40pt;">&#8470;</th>
          <th style="padding:18pt 10pt;text-align:left;font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.16em;font-weight:600;">Наименование</th>
          <th style="padding:18pt 10pt;text-align:right;font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.16em;font-weight:600;">Цена, &#8381;</th>
          <th style="padding:18pt 10pt;text-align:right;font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.16em;font-weight:600;">Кол-во</th>
          <th style="padding:18pt 10pt;text-align:right;font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.16em;font-weight:600;">Итого, &#8381;</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:18pt;">
      <tr>
        <td style="padding:6pt 10pt;font-family:Georgia,serif;font-size:11pt;color:#4a4239;">Сумма без НДС</td>
        <td style="padding:6pt 10pt;text-align:right;font-family:Arial,sans-serif;font-size:11pt;font-weight:600;color:#1d1a17;">${num(totals.subtotal)} &#8381;</td>
      </tr>
      <tr>
        <td style="padding:6pt 10pt;font-family:Georgia,serif;font-size:11pt;color:#4a4239;">НДС 20%</td>
        <td style="padding:6pt 10pt;text-align:right;font-family:Arial,sans-serif;font-size:11pt;font-weight:600;color:#1d1a17;">${num(totals.vat)} &#8381;</td>
      </tr>
      <tr>
        <td style="padding:14pt 10pt 6pt;border-top:2pt solid #1d1a17;font-family:Georgia,serif;font-size:14pt;font-weight:700;color:#1d1a17;">Итого с НДС</td>
        <td style="padding:14pt 10pt 6pt;border-top:2pt solid #1d1a17;text-align:right;font-family:Arial,sans-serif;font-size:14pt;font-weight:700;color:#1d1a17;">${num(totals.grand)} &#8381;</td>
      </tr>
    </table>
  </td>
</tr>
</table>
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
