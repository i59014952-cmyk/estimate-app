// KHDatabaseView — содержимое модалки «База данных»: поиск, ручное добавление,
// загрузка XLSX/CSV, фильтры по источнику, добавление в смету.

function PriceCell({ item, est, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  const editable = item._kind === "user" || item._kind === "vendor";
  const display = item.unitPrice ? fmt(Math.round(item.unitPrice)) + " ₽" : "—";

  const startEdit = () => {
    if (!editable || busy) return;
    setDraft(item.unitPrice ? String(Math.round(item.unitPrice)) : "");
    setEditing(true);
    setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, 0);
  };

  const cancel = () => { setEditing(false); setDraft(""); };

  const commit = async () => {
    const next = parseFloat(String(draft).replace(/\s+/g, "").replace(",", "."));
    if (!isFinite(next) || next < 0) { cancel(); return; }
    if (Math.round(next) === Math.round(item.unitPrice || 0)) { cancel(); return; }
    setBusy(true);
    try {
      if (item._kind === "user") {
        est.actions.addCatalogItem({ name: item.name, unit: item.unit || "", unitPrice: next });
      } else if (item._kind === "vendor") {
        await est.actions.updateVendorPrice(item._id, next);
        if (onSaved) onSaved();
      }
      setEditing(false);
    } catch (err) {
      alert("Не удалось сохранить цену: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  if (!editable) {
    return <span style={{ color: "var(--ink-2)" }}>{display}</span>;
  }

  if (!editing) {
    return (
      <span
        onClick={startEdit}
        title="Нажмите, чтобы изменить цену"
        style={{
          cursor: "pointer",
          borderBottom: "1px dashed var(--rule)",
          padding: "2px 4px",
          display: "inline-block",
          minWidth: 60,
          textAlign: "right",
        }}
      >{display}</span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      disabled={busy}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      style={{
        width: 100, textAlign: "right",
        border: "1px solid var(--moss)", borderRadius: 6,
        padding: "4px 6px", outline: "none",
        background: "var(--paper)", color: "var(--ink)",
        fontSize: 13, fontFamily: "var(--sans)",
      }}
    />
  );
}

function KHDatabaseView({ est, autoAdd, vendorFilter }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState(vendorFilter || "all");
  React.useEffect(() => { if (vendorFilter) setFilter(vendorFilter); }, [vendorFilter]);
  const [catFilter, setCatFilter] = React.useState("all"); // all | work | material
  const [showHidden, setShowHidden] = React.useState(false);
  const [expandedCmp, setExpandedCmp] = React.useState(null); // ключ позиции с раскрытым сравнением
  const [compareMode, setCompareMode] = React.useState(false); // режим колонок-сравнения подрядчиков
  const [compareSlugs, setCompareSlugs] = React.useState([]); // до 3 выбранных подрядчиков
  const [cmpQuery, setCmpQuery] = React.useState("");
  const [adding, setAdding] = React.useState(!!autoAdd);
  const [draft, setDraft] = React.useState({ name: "", unit: "", unitPrice: "", category: "" });
  const [uploadStatus, setUploadStatus] = React.useState(null);
  const [catMenu, setCatMenu] = React.useState(null); // ключ строки с открытым выбором категории
  const [sel, setSel] = React.useState(() => new Set()); // выбранные строки для массового удаления
  const fileRef = React.useRef(null);

  if (!est) return <div className="kh-empty">База недоступна</div>;

  const userCatalog = est.state.userCatalog;
  const localCatalog = est.state.catalog;
  const ddcCatalog = est.state.ddcCatalog;
  const hiddenCatalog = est.state.hiddenCatalog || new Set();

  const [vendorRows, setVendorRows] = React.useState([]);
  const [vendorMap, setVendorMap] = React.useState({});
  const [refreshTick, setRefreshTick] = React.useState(0);
  const refreshVendors = React.useCallback(() => setRefreshTick(t => t + 1), []);
  React.useEffect(() => {
    if (!window.SB) return;
    let cancelled = false;
    Promise.all([
      window.SB.selectAll('kh_vendor_prices', 'order=updated_at.desc&select=*'),
      window.SB.selectAll('kh_contractors', 'select=slug,name'),
    ]).then(([rows, vendors]) => {
      if (cancelled) return;
      const list = Array.isArray(rows) ? rows : [];
      console.log('[KHDatabase] vendor prices loaded:', list.length, 'vendors:', vendors && vendors.length);
      setVendorRows(list);
      const m = {};
      (vendors || []).forEach(v => { if (v.slug) m[v.slug] = v.name || ''; });
      setVendorMap(m);
      const stale = [];
      for (const r of list) {
        const k = hiddenKeyOf({ name: r.name, unit: r.unit });
        if (hiddenCatalog.has(k)) stale.push(k);
      }
      if (stale.length) {
        console.log('[KHDatabase] auto-unhiding', stale.length, 'vendor keys');
        est.actions.unhideKeys(stale);
      }
    }).catch(e => {
      console.error('[KHDatabase] cloud vendor prices error:', e);
      alert('Не удалось загрузить КП подрядчиков:\n' + (e.message || e) + '\n\nЕсли ошибка про токен — выйдите и войдите заново.');
    });
    return () => { cancelled = true; };
  }, [refreshTick]);

  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshVendors(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refreshVendors);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refreshVendors);
    };
  }, [refreshVendors]);

  const hiddenKeyOf = (it) => `${String(it.name || "").trim().toLowerCase()}|${String(it.unit || "").trim().toLowerCase()}`;
  const isHidden = (it) => hiddenCatalog.has(hiddenKeyOf(it));
  const rowKeyOf = (it) => it._kind === "vendor" ? `v:${it._id}` : `${it._kind}:${hiddenKeyOf(it)}`;

  const bulkDelete = () => {
    const items = (showHidden ? hiddenList : activeMerged).filter(it => sel.has(rowKeyOf(it)));
    if (!items.length) return;
    if (!confirm(`Удалить выбранные позиции (${items.length})? Действие нельзя отменить.`)) return;
    const vendorIds = [];
    for (const it of items) {
      if (it._kind === "vendor") { if (it._id) vendorIds.push(it._id); }
      else est.actions.removeCatalogItem(it.name, it.unit, it._kind); // user — удалить, local/ddc — скрыть
    }
    if (vendorIds.length) {
      Promise.all(vendorIds.map(id => est.actions.removeVendorPrice(id).catch(() => {}))).then(() => refreshVendors());
    }
    setSel(new Set());
  };

  const catOverride = est.state.catOverride || {};
  // Ручной оверрайд категории (из localStorage) важнее авто-классификации.
  const catOf = (it) => catOverride[hiddenKeyOf(it)]
    || ((it.category === 'work' || it.category === 'material') ? it.category : classifyItem(it.name, it.unit));
  const merged = React.useMemo(() => [
    ...userCatalog.map(it => ({ ...it, _kind: "user", category: catOf(it) })),
    ...vendorRows.map(it => ({
      name: it.name, unit: it.unit || '',
      unitPrice: Number(it.unit_price) || 0,
      category: catOf({ name: it.name, unit: it.unit || '' }),
      _kind: "vendor",
      _id: it.id,
      _vendorSlug: it.vendor_slug,
      _vendorName: it.vendor_name || vendorMap[it.vendor_slug] || '',
      _sourceFile: it.source_file || '',
      _updated: it.updated_at,
    })),
    ...localCatalog.map(it => ({ ...it, _kind: "local", category: catOf(it) })),
    ...ddcCatalog.map(it => ({ ...it, _kind: "ddc", category: catOf(it) })),
  ], [userCatalog, vendorRows, vendorMap, localCatalog, ddcCatalog, catOverride]);

  const activeMerged = React.useMemo(() => merged.filter(it => !isHidden(it)), [merged, hiddenCatalog]);
  const hiddenList = React.useMemo(() => merged.filter(isHidden), [merged, hiddenCatalog]);

  // Индекс сравнения: позиция (название+ед.) → предложения подрядчиков, по цене.
  const cmpKeyOf = (it) => `${String(it.name || "").trim().toLowerCase().replace(/ё/g, "е")}|${String(it.unit || "").trim().toLowerCase()}`;
  // Значимые слова названия для поиска «похожих» (слова от 3 букв и размеры/числа от 2 символов).
  const sigTokens = (name) => new Set(
    String(name || "").toLowerCase().replace(/ё/g, "е")
      .split(/[^0-9a-zа-я]+/i)
      .filter(w => w.length >= 3 || (/\d/.test(w) && w.length >= 2))
  );
  const vendorNameOf = (r) => r.vendor_name || vendorMap[r.vendor_slug] || ('Подрядчик ' + String(r.vendor_slug || '').slice(0, 4));
  const vendorOffersByItem = React.useMemo(() => {
    const m = new Map();
    for (const it of vendorRows) {
      const price = Number(it.unit_price);
      if (!(price > 0)) continue;
      const key = cmpKeyOf({ name: it.name, unit: it.unit });
      const vendor = it.vendor_name || vendorMap[it.vendor_slug] || ('Подрядчик ' + String(it.vendor_slug || '').slice(0, 4));
      if (!m.has(key)) m.set(key, []);
      const arr = m.get(key);
      const ex = arr.find(o => o.vendor === vendor);
      if (ex) { if (price < ex.price) ex.price = price; }
      else arr.push({ vendor, price });
    }
    for (const arr of m.values()) arr.sort((a, b) => a.price - b.price);
    return m;
  }, [vendorRows, vendorMap]);

  // Различимые позиции подрядчиков с токенами — для поиска похожих названий.
  const vendorItemsList = React.useMemo(() => {
    const m = new Map();
    for (const r of vendorRows) {
      const price = Number(r.unit_price);
      if (!(price > 0)) continue;
      const key = cmpKeyOf({ name: r.name, unit: r.unit });
      if (!m.has(key)) m.set(key, { key, name: r.name, unit: r.unit || '', tokens: sigTokens(r.name), offers: new Map() });
      const it = m.get(key);
      const v = vendorNameOf(r);
      if (!it.offers.has(v) || price < it.offers.get(v)) it.offers.set(v, price);
    }
    return Array.from(m.values());
  }, [vendorRows, vendorMap]);

  // key → похожие предложения других позиций (другие подрядчики/названия), по словам.
  const similarByKey = React.useMemo(() => {
    const res = new Map();
    const arr = vendorItemsList;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.tokens.size === 0) continue;
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const b = arr[j];
        let shared = 0; for (const x of a.tokens) if (b.tokens.has(x)) shared++;
        if (shared < 2) continue;
        if (!res.has(a.key)) res.set(a.key, []);
        const list = res.get(a.key);
        for (const [vendor, price] of b.offers) list.push({ vendor, name: b.name, unit: b.unit, price, shared });
      }
    }
    for (const list of res.values()) list.sort((x, y) => (y.shared - x.shared) || (x.price - y.price));
    return res;
  }, [vendorItemsList]);

  // Все позиции каждого подрядчика (для режима колонок-сравнения).
  const vendorItemsBySlug = React.useMemo(() => {
    const m = new Map();
    for (const r of vendorRows) {
      const price = Number(r.unit_price);
      const slug = r.vendor_slug || '';
      if (!m.has(slug)) m.set(slug, { slug, name: vendorNameOf(r), items: [] });
      m.get(slug).items.push({ name: r.name, unit: r.unit || '', price: price > 0 ? price : null });
    }
    for (const v of m.values()) v.items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
    return m;
  }, [vendorRows, vendorMap]);

  const toggleCompareSlug = (slug) => setCompareSlugs(prev =>
    prev.includes(slug) ? prev.filter(s => s !== slug) : (prev.length >= 10 ? prev : [...prev, slug])
  );

  // Матрица сравнения: позиции (строки) × подрядчики (колонки), цена в ячейке.
  const compareMatrix = React.useMemo(() => {
    if (!compareMode || compareSlugs.length === 0) return [];
    const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").trim();
    const map = new Map();
    compareSlugs.forEach(slug => {
      const v = vendorItemsBySlug.get(slug); if (!v) return;
      v.items.forEach(it => {
        const key = norm(it.name) + "|" + norm(it.unit);
        if (!map.has(key)) map.set(key, { name: it.name, unit: it.unit || "", prices: {} });
        const g = map.get(key);
        if (it.price != null && (g.prices[slug] == null || it.price < g.prices[slug])) g.prices[slug] = it.price;
      });
    });
    let arr = Array.from(map.values());
    const q = cmpQuery.trim().toLowerCase();
    if (q) arr = arr.filter(r => r.name.toLowerCase().includes(q));
    arr.forEach(r => {
      const vals = compareSlugs.map(s => r.prices[s]).filter(v => v != null);
      r.min = vals.length ? Math.min(...vals) : null;
      // cat 0 — сравнимо (2+ подрядчика) и цены расходятся
      // cat 1 — сравнимо и цены совпадают
      // cat 2 — без совпадений (позиция есть лишь у одного подрядчика)
      if (vals.length < 2) r.cat = 2;
      else if (new Set(vals).size > 1) r.cat = 0;
      else r.cat = 1;
      r.differs = r.cat === 0;
    });
    arr.sort((a, b) => (a.cat - b.cat) || a.name.localeCompare(b.name, "ru"));
    return arr;
  }, [compareMode, compareSlugs.join(","), vendorItemsBySlug, cmpQuery]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = showHidden ? hiddenList : activeMerged;
    if (!showHidden && filter !== "all") {
      if (filter.indexOf("vendor:") === 0) {
        const slug = filter.slice(7);
        out = out.filter(it => it._kind === "vendor" && (it._vendorSlug || "") === slug);
      } else if (filter.indexOf("vname:") === 0) {
        const key = filter.slice(6).toLowerCase();
        out = out.filter(it => it._kind === "vendor" && (
          String(it._vendorName || "").toLowerCase() === key ||
          String(it._vendorSlug || "").toLowerCase() === key
        ));
      } else {
        out = out.filter(it => it._kind === filter);
      }
    }
    if (!showHidden && catFilter !== "all") out = out.filter(it => (it.category || 'material') === catFilter);
    if (q) out = out.filter(it => (it.name || "").toLowerCase().includes(q));
    return out.slice(0, 500);
  }, [activeMerged, hiddenList, query, filter, catFilter, showHidden]);

  // По вкладке на каждого подрядчика, загрузившего КП.
  const vendorGroups = React.useMemo(() => {
    const m = new Map();
    for (const it of activeMerged) {
      if (it._kind !== "vendor") continue;
      const slug = it._vendorSlug || "";
      const cur = m.get(slug) || { slug, name: it._vendorName || "", count: 0 };
      cur.count++;
      if (!cur.name && it._vendorName) cur.name = it._vendorName;
      m.set(slug, cur);
    }
    return Array.from(m.values()).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
  }, [activeMerged]);

  const totals = {
    all: activeMerged.length,
    user: userCatalog.filter(it => !isHidden(it)).length,
    vendor: activeMerged.filter(it => it._kind === 'vendor').length,
    local: localCatalog.filter(it => !isHidden(it)).length,
    ddc: ddcCatalog.filter(it => !isHidden(it)).length,
    work: activeMerged.filter(it => (it.category || 'material') === 'work').length,
    material: activeMerged.filter(it => (it.category || 'material') === 'material').length,
    hidden: hiddenList.length,
  };

  const startAdd = () => { setDraft({ name: "", unit: "", unitPrice: "", category: "" }); setAdding(true); };
  const cancelAdd = () => setAdding(false);
  const submitAdd = (e) => {
    if (e) e.preventDefault();
    const name = draft.name.trim();
    const unit = draft.unit.trim();
    const price = parseFloat(String(draft.unitPrice).replace(",", "."));
    if (!name || !isFinite(price) || price < 0) return;
    const category = draft.category || classifyItem(name, unit);
    est.actions.addCatalogItem({ name, unit, unitPrice: price, category });
    setAdding(false);
  };

  // Сменить категорию любой позиции (сохраняется в localStorage-оверрайде).
  const pickItemCat = (it, cat) => {
    est.actions.setItemCategory(it.name, it.unit, cat);
    if (it._kind === 'user') {
      est.actions.addCatalogItem({ name: it.name, unit: it.unit, unitPrice: it.unitPrice, category: cat });
    }
    setCatMenu(null);
  };

  const onUploadClick = () => fileRef.current && fileRef.current.click();
  const onFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    let totalAdded = 0, totalUpdated = 0, totalSkipped = 0;
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadStatus({ kind: "busy", text: `Загрузка ${i + 1}/${files.length}: ${f.name}…` });
      try {
        const { added, updated, skipped } = await est.actions.uploadCatalogFile(f);
        totalAdded += added;
        totalUpdated += updated || 0;
        totalSkipped += skipped;
      } catch (err) {
        errors.push(`${f.name}: ${err.message || err}`);
      }
    }
    if (errors.length) {
      setUploadStatus({ kind: "error", text: `Ошибки: ${errors.join('; ')}` });
      setTimeout(() => setUploadStatus(null), 8000);
    } else {
      const upd = totalUpdated ? `, обновлено ${totalUpdated}` : '';
      setUploadStatus({ kind: "ok", text: `Файлов: ${files.length}. Новых ${totalAdded}${upd}, пропущено ${totalSkipped}` });
      setTimeout(() => setUploadStatus(null), 6000);
    }
  };

  const kindBadge = (kind) => {
    if (kind === "user") return { label: "Моё", color: "var(--moss)" };
    if (kind === "vendor") return { label: "КП", color: "var(--rust)" };
    if (kind === "local") return { label: "JSON", color: "var(--ink-3)" };
    return { label: "DDC", color: "var(--ink-3)" };
  };

  const FilterPill = ({ id, label, count }) => (
    <button
      onClick={() => setFilter(id)}
      className="kh-pill"
      style={{
        cursor: "pointer", border: "1px solid var(--rule)",
        background: filter === id ? "var(--ink)" : "var(--paper-card)",
        color: filter === id ? "var(--paper)" : "var(--ink-2)",
        fontWeight: filter === id ? 600 : 400,
      }}
    >{label} · {count}</button>
  );

  const CatPill = ({ id, label, count }) => (
    <button
      onClick={() => setCatFilter(id)}
      className="kh-pill"
      style={{
        cursor: "pointer", border: "1px solid var(--rule)",
        background: catFilter === id ? "var(--moss, #4f6f52)" : "var(--paper-card)",
        color: catFilter === id ? "#fff" : "var(--ink-2)",
        fontWeight: catFilter === id ? 600 : 400,
      }}
    >{label} · {count}</button>
  );

  return (
    <div className="col" style={{ gap: 14 }}>
      <input
        ref={fileRef} type="file" multiple
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        style={{ display: "none" }}
        onChange={onFileChange}
      />

      <div className="kh-toolbar" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder={`Поиск среди ${totals.all} позиций`}
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button className="kh-btn-primary" onClick={startAdd}>+ Добавить</button>
        <button className="kh-btn-primary" onClick={onUploadClick}>↑ Загрузить XLSX/CSV (можно несколько)</button>
        {sel.size > 0 && (
          <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }} onClick={bulkDelete}>
            🗑 Удалить выбранные ({sel.size})
          </button>
        )}
        <button className="btn btn-sm" onClick={refreshVendors} title="Перечитать КП подрядчиков из облака">⟳ Обновить</button>
        <button
          className="btn btn-sm"
          onClick={() => setCompareMode(v => !v)}
          title="Открыть прайсы подрядчиков колонками для ручного сравнения"
          style={compareMode ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" } : undefined}
        >⇆ Сравнить подрядчиков</button>
      </div>

      {compareMode && (
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow" style={{ marginRight: 2 }}>Выберите до 10 подрядчиков</span>
            {vendorGroups.map(g => {
              const on = compareSlugs.includes(g.slug);
              const disabled = !on && compareSlugs.length >= 10;
              return (
                <button
                  key={g.slug || g.name}
                  onClick={() => toggleCompareSlug(g.slug)}
                  disabled={disabled}
                  className="kh-pill"
                  style={{
                    cursor: disabled ? "not-allowed" : "pointer",
                    border: "1px solid " + (on ? "var(--moss, #4f6f52)" : "var(--rule)"),
                    background: on ? "var(--moss, #4f6f52)" : "var(--paper-card)",
                    color: on ? "#fff" : (disabled ? "var(--ink-4)" : "var(--ink-2)"),
                    opacity: disabled ? 0.6 : 1,
                  }}
                >{on ? "✓ " : ""}{g.name || `Подрядчик ${(g.slug || "").slice(0, 4)}`} · {g.count}</button>
              );
            })}
            <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => { setCompareMode(false); setCompareSlugs([]); setCmpQuery(""); }}>✕ Закрыть сравнение</button>
          </div>

          {compareSlugs.length === 0 ? (
            <div className="kh-empty" style={{ padding: 20, textAlign: "center" }}>Отметьте подрядчиков выше — позиции выстроятся в таблицу для сравнения цен.</div>
          ) : (
            <>
              <input
                placeholder="Фильтр по названию позиции…"
                value={cmpQuery}
                onChange={e => setCmpQuery(e.target.value)}
                style={{ maxWidth: 360 }}
              />
              <div style={{ overflow: "auto", maxHeight: 540, border: "1px solid var(--rule)", borderRadius: 10 }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: "var(--paper-2)", textAlign: "left", padding: "9px 12px", minWidth: 240, borderBottom: "1px solid var(--rule)" }}>Позиция</th>
                      {compareSlugs.map(slug => {
                        const v = vendorItemsBySlug.get(slug) || {};
                        return <th key={slug} title={v.name} style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--paper-2)", padding: "9px 10px", minWidth: 96, maxWidth: 140, textAlign: "right", color: "var(--rust)", borderBottom: "1px solid var(--rule)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name || "—"}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {compareMatrix.length === 0 && (
                      <tr><td colSpan={compareSlugs.length + 1} className="tiny muted" style={{ padding: 14 }}>Нет позиций.</td></tr>
                    )}
                    {compareMatrix.map((r, i) => {
                      const prev = compareMatrix[i - 1];
                      const showHead = !prev || prev.cat !== r.cat;
                      const headLabel = r.cat === 0 ? "Цены расходятся" : r.cat === 1 ? "Цены совпадают" : "Без совпадений (у одного подрядчика)";
                      return (
                      <React.Fragment key={i}>
                      {showHead && (
                        <tr>
                          <td colSpan={compareSlugs.length + 1} className="eyebrow" style={{ position: "sticky", left: 0, background: "var(--paper-2)", padding: "6px 12px", borderBottom: "1px solid var(--rule)", borderTop: "1px solid var(--rule)" }}>{headLabel}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--paper-card)", padding: "7px 12px", borderBottom: "1px solid var(--rule)", minWidth: 240, maxWidth: 360 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                          {r.unit ? <div className="mono tiny muted">{r.unit}</div> : null}
                        </td>
                        {compareSlugs.map(slug => {
                          const p = r.prices[slug];
                          const cheapest = r.differs && p != null && p === r.min;
                          return (
                            <td key={slug} className="mono" style={{
                              textAlign: "right", padding: "7px 10px", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap",
                              background: r.differs ? "rgba(194,88,66,.06)" : "transparent",
                              color: p == null ? "var(--ink-4)" : (cheapest ? "var(--moss, #4f6f52)" : "var(--ink)"),
                              fontWeight: cheapest ? 700 : 400,
                            }}>{p == null ? "—" : fmtMoney(p)}</td>
                          );
                        })}
                      </tr>
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="tiny muted">Зелёным — самая низкая цена в строке · «—» = нет у подрядчика · красноватые ячейки — есть расхождение</div>
            </>
          )}
        </div>
      )}

      {!compareMode && (<>

      {!showHidden && (
        <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterPill id="all" label="Все" count={totals.all} />
          <FilterPill id="user" label="Моё" count={totals.user} />
          {vendorGroups.map(g => (
            <FilterPill key={g.slug || g.name} id={`vendor:${g.slug}`} label={g.name || `Подрядчик ${(g.slug || "").slice(0, 4)}`} count={g.count} />
          ))}
          <FilterPill id="local" label="JSON" count={totals.local} />
          <FilterPill id="ddc" label="DDC" count={totals.ddc} />
          {totals.hidden > 0 && (
            <button
              onClick={() => setShowHidden(true)}
              className="kh-pill"
              style={{
                cursor: "pointer", border: "1px solid var(--rule)",
                background: "var(--paper-card)", color: "var(--ink-3)", marginLeft: "auto",
              }}
              title="Показать скрытые позиции"
            >Скрыто · {totals.hidden}</button>
          )}
        </div>
      )}

      {!showHidden && (
        <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ marginRight: 2 }}>Категория</span>
          <CatPill id="all" label="Все" count={totals.all} />
          <CatPill id="work" label="Работы" count={totals.work} />
          <CatPill id="material" label="Материалы" count={totals.material} />
        </div>
      )}

      {showHidden && (
        <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setShowHidden(false)} className="btn btn-sm">← К активным</button>
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
            Скрытые позиции ({totals.hidden}) — не участвуют в поиске и импорте
          </div>
          {totals.hidden > 0 && (
            <button
              className="btn btn-sm"
              style={{ marginLeft: "auto", color: "var(--rust)" }}
              onClick={() => { if (confirm("Восстановить все скрытые позиции?")) est.actions.clearHiddenCatalog(); }}
            >Восстановить все</button>
          )}
        </div>
      )}

      {uploadStatus && (
        <div
          style={{
            padding: "10px 12px", borderRadius: 8,
            border: "1px solid " + (uploadStatus.kind === "error" ? "var(--rust)" : "var(--rule)"),
            background: "var(--paper-card)",
            color: uploadStatus.kind === "error" ? "var(--rust)" : "var(--ink-2)",
            fontSize: 13,
          }}
        >{uploadStatus.text}</div>
      )}

      {adding && (
        <form onSubmit={submitAdd} className="col" style={{
          gap: 8, padding: 14, borderRadius: 10,
          border: "1px solid var(--moss)", background: "var(--paper-card)",
        }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Новая позиция</div>
          <input
            autoFocus
            placeholder="Название"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            style={inputStyle()}
          />
          <div className="row" style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Ед. (шт, м, м², кг…)"
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              style={{ ...inputStyle(), width: 200 }}
            />
            <input
              placeholder="Цена за единицу, ₽"
              inputMode="decimal"
              value={draft.unitPrice}
              onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
              style={{ ...inputStyle(), flex: 1 }}
            />
          </div>
          {(() => {
            const eff = draft.category || classifyItem(draft.name, draft.unit);
            const opt = (id, label) => (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, category: id })}
                style={{
                  cursor: "pointer", padding: "6px 14px", borderRadius: 8, fontSize: 13,
                  border: "1px solid " + (eff === id ? "var(--moss, #4f6f52)" : "var(--rule)"),
                  background: eff === id ? "var(--moss, #4f6f52)" : "transparent",
                  color: eff === id ? "#fff" : "var(--ink-2)", fontWeight: eff === id ? 600 : 400,
                }}
              >{label}</button>
            );
            return (
              <div className="row center" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="eyebrow" style={{ marginRight: 2 }}>Категория</span>
                {opt('work', 'Работа')}
                {opt('material', 'Материал')}
                {!draft.category && draft.name.trim() && (
                  <span className="tiny muted">авто — можно изменить</span>
                )}
              </div>
            );
          })()}
          <div className="row" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-sm" onClick={cancelAdd}>Отмена</button>
            <button type="submit" className="kh-btn-primary"
              disabled={!draft.name.trim() || !isFinite(parseFloat(String(draft.unitPrice).replace(",", ".")))}>
              Сохранить
            </button>
          </div>
        </form>
      )}

      <table className="kh-table">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: "center" }}>
              <input type="checkbox"
                checked={visible.length > 0 && visible.every(it => sel.has(rowKeyOf(it)))}
                onChange={(e) => {
                  setSel(prev => {
                    const n = new Set(prev);
                    if (e.target.checked) visible.forEach(it => n.add(rowKeyOf(it)));
                    else visible.forEach(it => n.delete(rowKeyOf(it)));
                    return n;
                  });
                }} />
            </th>
            <th style={{ width: 86, whiteSpace: "nowrap" }}>Источник</th>
            <th style={{ width: 168, whiteSpace: "nowrap" }}>Категория</th>
            <th>Наименование</th>
            <th style={{ width: 80 }}>Ед.</th>
            <th className="num" style={{ width: 130 }}>Цена</th>
            <th style={{ width: 150 }}>Подрядчик</th>
            <th style={{ width: showHidden ? 220 : 110 }}></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((it, i) => {
            const badge = kindBadge(it._kind);
            const rk = rowKeyOf(it);
            const cmpKey = cmpKeyOf(it);
            const offers = vendorOffersByItem.get(cmpKey) || [];
            const similar = (it._kind === "vendor" ? (similarByKey.get(cmpKey) || []) : []);
            const hasExact = offers.length > 1;
            const canCompare = it._kind === "vendor" && (hasExact || similar.length > 0);
            const bestPrice = offers.length ? offers[0].price : null;
            const isCheapest = hasExact && Number(it.unitPrice) === bestPrice;
            const overpayPct = (hasExact && bestPrice > 0 && Number(it.unitPrice) > bestPrice)
              ? Math.round(((Number(it.unitPrice) - bestPrice) / bestPrice) * 100) : 0;
            const expanded = canCompare && expandedCmp === cmpKey;
            const rowFrag = (
              <tr>
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={sel.has(rk)}
                    onChange={() => setSel(prev => { const n = new Set(prev); if (n.has(rk)) n.delete(rk); else n.add(rk); return n; })} />
                </td>
                <td><span style={{ color: badge.color, fontSize: 11, fontWeight: 600, letterSpacing: ".04em" }}>{badge.label}</span></td>
                <td>
                  {(() => {
                    const c = (it.category === 'work') ? 'work' : 'material';
                    const rowKey = `${it._kind}-${it.name}-${it.unit}-${i}`;
                    const open = catMenu === rowKey;
                    if (open) {
                      const opt = (id, label) => (
                        <button
                          key={id}
                          onClick={() => pickItemCat(it, id)}
                          style={{
                            cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                            border: "1px solid " + (c === id ? "var(--moss, #4f6f52)" : "var(--rule)"),
                            background: c === id ? "var(--moss, #4f6f52)" : "var(--paper)",
                            color: c === id ? "#fff" : "var(--ink-2)", whiteSpace: "nowrap",
                          }}
                        >{label}</button>
                      );
                      return (
                        <span className="row" style={{ display: "inline-flex", gap: 4 }} onMouseLeave={() => setCatMenu(null)}>
                          {opt('work', 'Работа')}
                          {opt('material', 'Материал')}
                        </span>
                      );
                    }
                    return (
                      <span
                        onClick={() => setCatMenu(rowKey)}
                        title="Нажмите, чтобы сменить категорию"
                        style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                          border: "1px solid " + (c === 'work' ? "var(--moss, #4f6f52)" : "var(--rule)"),
                          background: c === 'work' ? "var(--moss, #4f6f52)" : "transparent",
                          color: c === 'work' ? "#fff" : "var(--ink-3)",
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >{c === 'work' ? 'Работа' : 'Материал'}</span>
                    );
                  })()}
                </td>
                <td>
                  {canCompare ? (
                    <span
                      onClick={() => setExpandedCmp(expanded ? null : cmpKey)}
                      title="Показать цены всех подрядчиков"
                      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                    >
                      <span style={{ borderBottom: "1px dashed var(--ink-3)" }}>{it.name}</span>
                      {isCheapest ? (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "var(--moss, #4f6f52)", color: "#fff", whiteSpace: "nowrap" }}>лучшая цена</span>
                      ) : overpayPct > 0 ? (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, border: "1px solid var(--rust)", color: "var(--rust)", whiteSpace: "nowrap" }}>+{overpayPct}%</span>
                      ) : null}
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, border: "1px solid var(--rule)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                        {hasExact ? `${offers.length} цен` : "похожие"} {expanded ? "▲" : "▼"}
                      </span>
                    </span>
                  ) : it.name}
                </td>
                <td>{it.unit || "—"}</td>
                <td className="num">
                  <PriceCell item={it} est={est} onSaved={refreshVendors} />
                </td>
                <td>
                  {it._kind === "vendor" && it._vendorName ? (
                    <span
                      title={it._sourceFile ? `Файл: ${it._sourceFile}` : ''}
                      style={{
                        display: "inline-block",
                        fontSize: 11, fontWeight: 600, letterSpacing: ".02em",
                        color: "var(--rust)",
                        border: "1px solid var(--rust)",
                        padding: "2px 8px", borderRadius: 999,
                        whiteSpace: "nowrap", maxWidth: "100%",
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}
                    >{it._vendorName}</span>
                  ) : (
                    <span style={{ color: "var(--ink-3)" }}>—</span>
                  )}
                </td>
                <td>
                  <div className="row" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {!showHidden && (
                      <button
                        className="btn btn-sm"
                        title="Добавить в смету"
                        onClick={() => est.actions.addRow({
                          name: it.name, unit: it.unit, unitPrice: it.unitPrice, qty: 1,
                          notFound: false, source: it._kind === "ddc" ? "ddc" : (it._kind === "user" ? "manual" : "local"),
                          category: it.category,
                        })}
                      >+ В смету</button>
                    )}
                    {showHidden ? (
                      <>
                        <button
                          className="btn btn-sm"
                          title="Восстановить"
                          onClick={() => est.actions.restoreCatalogItem(it.name, it.unit)}
                        >↺ Восстановить</button>
                        {(it._kind === "user" || it._kind === "vendor") && (
                          <button
                            className="btn btn-sm"
                            style={{ color: "var(--rust)" }}
                            title={it._kind === "user" ? "Удалить из своей базы навсегда" : "Удалить из прайса подрядчика навсегда"}
                            onClick={() => {
                              const msg = it._kind === "user"
                                ? `Удалить «${it.name}» из своей базы навсегда?`
                                : `Удалить «${it.name}» из прайса подрядчика навсегда? Подрядчик увидит, что строки нет.`;
                              if (!confirm(msg)) return;
                              const key = hiddenKeyOf(it);
                              if (it._kind === "vendor") {
                                est.actions.removeVendorPrice(it._id)
                                  .then(() => { est.actions.unhideKeys([key]); refreshVendors(); })
                                  .catch(err => alert('Не удалось удалить из облака: ' + (err.message || err)));
                              } else {
                                est.actions.removeCatalogItem(it.name, it.unit, "user");
                                est.actions.unhideKeys([key]);
                              }
                            }}
                          >× Удалить</button>
                        )}
                      </>
                    ) : (
                      <button
                        className="btn btn-sm"
                        title={
                          it._kind === "user" ? "Удалить из базы" :
                          it._kind === "vendor" ? "Удалить позицию подрядчика из облака" :
                          "Скрыть из базы (можно восстановить)"
                        }
                        onClick={() => {
                          if (it._kind === "vendor") {
                            if (!confirm(`Удалить «${it.name}» из прайса подрядчика? Действие необратимо — подрядчик увидит, что строки нет.`)) return;
                            est.actions.removeVendorPrice(it._id)
                              .then(() => refreshVendors())
                              .catch(err => alert('Не удалось удалить из облака: ' + (err.message || err)));
                            return;
                          }
                          const msg = it._kind === "user"
                            ? `Удалить «${it.name}» из своей базы?`
                            : `Скрыть «${it.name}» из базы? Позицию можно будет восстановить.`;
                          if (confirm(msg)) est.actions.removeCatalogItem(it.name, it.unit, it._kind);
                        }}
                        style={{ color: "var(--rust)" }}
                      >×</button>
                    )}
                  </div>
                </td>
              </tr>
            );
            return (
              <React.Fragment key={`${it._kind}-${it.name}-${it.unit}-${i}`}>
                {rowFrag}
                {expanded && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, background: "var(--paper-2)" }}>
                      <div className="col" style={{ gap: 4, padding: "10px 14px 12px 48px" }}>
                        {hasExact && (
                          <>
                            <div className="mono tiny muted" style={{ marginBottom: 2 }}>Цены подрядчиков · «{it.name}»</div>
                            {offers.map((o, oi) => {
                              const cheapest = o.price === bestPrice;
                              const diff = o.price - bestPrice;
                              const pct = bestPrice > 0 ? Math.round((diff / bestPrice) * 100) : 0;
                              return (
                                <div key={oi} style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                                  padding: "7px 10px", borderRadius: 8,
                                  border: "1px solid " + (cheapest ? "var(--moss, #4f6f52)" : "var(--rule)"),
                                  background: cheapest ? "rgba(110,123,79,.10)" : "var(--paper)",
                                }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.vendor}</span>
                                    {cheapest && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "var(--moss, #4f6f52)", color: "#fff", whiteSpace: "nowrap" }}>лучшая цена</span>}
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                                    {!cheapest && diff > 0 && <span className="mono tiny" style={{ color: "var(--rust)" }}>+{fmtMoney(diff)}{pct ? ` (+${pct}%)` : ""}</span>}
                                    <span className="mono" style={{ fontWeight: cheapest ? 600 : 400 }}>{fmtMoney(o.price)}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </>
                        )}
                        {similar.length > 0 && (
                          <div className="col" style={{ gap: 4, marginTop: hasExact ? 8 : 0 }}>
                            <div className="mono tiny muted">Похожие у других подрядчиков (по ключевым словам)</div>
                            {similar.slice(0, 8).map((s, si) => (
                              <div key={si} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                                padding: "7px 10px", borderRadius: 8, border: "1px dashed var(--rule)", background: "transparent",
                              }}>
                                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}{s.unit ? <span className="muted"> · {s.unit}</span> : null}</span>
                                  <span className="mono tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.vendor}</span>
                                </span>
                                <span className="mono" style={{ whiteSpace: "nowrap" }}>{fmtMoney(s.price)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {visible.length === 0 && (
        <div className="kh-empty" style={{ padding: 24, textAlign: "center" }}>
          {query ? "Ничего не найдено" : "База пуста — добавьте позиции"}
        </div>
      )}
      </>)}
    </div>
  );
}

function inputStyle() {
  return {
    border: "1px solid var(--rule)", borderRadius: 6,
    padding: "8px 10px", outline: "none",
    background: "var(--paper)", color: "var(--ink)",
    fontSize: 13, fontFamily: "var(--sans)",
  };
}

Object.assign(window, { KHDatabaseView });
