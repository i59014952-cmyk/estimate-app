// useEstimate.jsx — React hook owning estimate state and actions.

function useEstimate() {
  const [catalog, setCatalog] = React.useState([]);
  const [ddcCatalog, setDdcCatalog] = React.useState([]);
  const [catalogReady, setCatalogReady] = React.useState(false);
  const [estimate, setEstimate] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState({ kind: "idle", text: "" });
  const [pricesBusy, setPricesBusy] = React.useState(false);
  const nextIdRef = React.useRef(1);
  const estimateRef = React.useRef([]);
  React.useEffect(() => { estimateRef.current = estimate; }, [estimate]);

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
    for (const item of catalog) {
      if (item.name.toLowerCase().includes(q)) {
        out.push(item);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [query, catalog]);

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
      const { name, qty } = extractNameAndQty(row);
      const reason = skipReason(name);
      if (reason) { skipped++; continue; }
      const q = isFinite(qty) && qty > 0 ? qty : 1;
      const match = fuzzyFind(name, catalog, ddcCatalog);
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
  }, [catalog, ddcCatalog]);

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
    setStatus({ kind: "busy", text: `Поиск вариантов для ${targetIds.length} позиций…` });
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
        setStatus({ kind: "busy", text: `Запрос цен: ${done}/${targetIds.length} (с вариантами ${ambiguous})` });
      }
    }
    const workers = Array.from({ length: PRICES_CONCURRENCY }, () => worker());
    try {
      await Promise.all(workers);
      setStatus({ kind: "done", text: `Запрос цен: обработано ${done}, новых цен ${filled}, с альтернативами ${ambiguous}, ошибок ${failed}` });
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

  const addBlankRow = React.useCallback(() => {
    addRow({ name: 'Новая позиция', unit: '', unitPrice: 0, qty: 1, notFound: true, source: 'none' });
  }, [addRow]);

  return {
    state: { catalog, ddcCatalog, catalogReady, estimate, query, status, pricesBusy, searchResults, totals, anyNotFound },
    actions: {
      setQuery, addRow, removeRow, updateQty, updateRow, togglePicker, applyCandidate,
      applyManualPrice, handleFile, fetchPricesForNotFound, exportCsv, addBlankRow,
    },
  };
}

Object.assign(window, { useEstimate });
