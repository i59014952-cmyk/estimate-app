// KHDatabaseView — содержимое модалки «База данных»: поиск, ручное добавление,
// загрузка XLSX/CSV, фильтры по источнику, добавление в смету.

function KHDatabaseView({ est }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [showHidden, setShowHidden] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", unit: "", unitPrice: "" });
  const [uploadStatus, setUploadStatus] = React.useState(null);
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
      window.SB.selectAll('kh_vendor_prices', 'order=updated_at.desc&select=id,vendor_slug,name,unit,unit_price,source_file,updated_at'),
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
      alert('Не удалось загрузить КП подрядчиков:\n' + (e.message || e) + '\n\nПроверьте, что SQL-скрипт прогнан в Supabase.');
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

  const merged = React.useMemo(() => [
    ...userCatalog.map(it => ({ ...it, _kind: "user" })),
    ...vendorRows.map(it => ({
      name: it.name, unit: it.unit || '',
      unitPrice: Number(it.unit_price) || 0,
      _kind: "vendor",
      _id: it.id,
      _vendorSlug: it.vendor_slug,
      _vendorName: vendorMap[it.vendor_slug] || '',
      _sourceFile: it.source_file || '',
      _updated: it.updated_at,
    })),
    ...localCatalog.map(it => ({ ...it, _kind: "local" })),
    ...ddcCatalog.map(it => ({ ...it, _kind: "ddc" })),
  ], [userCatalog, vendorRows, vendorMap, localCatalog, ddcCatalog]);

  const activeMerged = React.useMemo(() => merged.filter(it => !isHidden(it)), [merged, hiddenCatalog]);
  const hiddenList = React.useMemo(() => merged.filter(isHidden), [merged, hiddenCatalog]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = showHidden ? hiddenList : activeMerged;
    if (!showHidden && filter !== "all") out = out.filter(it => it._kind === filter);
    if (q) out = out.filter(it => (it.name || "").toLowerCase().includes(q));
    return out.slice(0, 500);
  }, [activeMerged, hiddenList, query, filter, showHidden]);

  const totals = {
    all: activeMerged.length,
    user: userCatalog.filter(it => !isHidden(it)).length,
    vendor: activeMerged.filter(it => it._kind === 'vendor').length,
    local: localCatalog.filter(it => !isHidden(it)).length,
    ddc: ddcCatalog.filter(it => !isHidden(it)).length,
    hidden: hiddenList.length,
  };

  const startAdd = () => { setDraft({ name: "", unit: "", unitPrice: "" }); setAdding(true); };
  const cancelAdd = () => setAdding(false);
  const submitAdd = (e) => {
    if (e) e.preventDefault();
    const name = draft.name.trim();
    const unit = draft.unit.trim();
    const price = parseFloat(String(draft.unitPrice).replace(",", "."));
    if (!name || !isFinite(price) || price < 0) return;
    est.actions.addCatalogItem({ name, unit, unitPrice: price });
    setAdding(false);
  };

  const onUploadClick = () => fileRef.current && fileRef.current.click();
  const onFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    let totalAdded = 0, totalSkipped = 0;
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadStatus({ kind: "busy", text: `Загрузка ${i + 1}/${files.length}: ${f.name}…` });
      try {
        const { added, skipped } = await est.actions.uploadCatalogFile(f);
        totalAdded += added;
        totalSkipped += skipped;
      } catch (err) {
        errors.push(`${f.name}: ${err.message || err}`);
      }
    }
    if (errors.length) {
      setUploadStatus({ kind: "error", text: `Ошибки: ${errors.join('; ')}` });
      setTimeout(() => setUploadStatus(null), 8000);
    } else {
      setUploadStatus({ kind: "ok", text: `Файлов: ${files.length}. Добавлено ${totalAdded}, пропущено ${totalSkipped}` });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const kindBadge = (kind, vendorName) => {
    if (kind === "user") return { label: "Моё", color: "var(--moss)" };
    if (kind === "vendor") return { label: vendorName ? `КП · ${vendorName}` : "КП подрядчика", color: "var(--rust)" };
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
        <button className="btn btn-sm" onClick={refreshVendors} title="Перечитать КП подрядчиков из облака">⟳ Обновить</button>
      </div>

      {!showHidden && (
        <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterPill id="all" label="Все" count={totals.all} />
          <FilterPill id="user" label="Моё" count={totals.user} />
          <FilterPill id="vendor" label="КП подрядчиков" count={totals.vendor} />
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
            <th style={{ width: 70 }}>Источник</th>
            <th>Наименование</th>
            <th style={{ width: 80 }}>Ед.</th>
            <th className="num" style={{ width: 130 }}>Цена</th>
            <th style={{ width: 110 }}></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((it, i) => {
            const badge = kindBadge(it._kind, it._vendorName);
            return (
              <tr key={`${it._kind}-${it.name}-${it.unit}-${i}`}>
                <td><span style={{ color: badge.color, fontSize: 11, fontWeight: 600, letterSpacing: ".04em" }}>{badge.label}</span></td>
                <td>{it.name}</td>
                <td>{it.unit || "—"}</td>
                <td className="num">{it.unitPrice ? fmt(Math.round(it.unitPrice)) + " ₽" : "—"}</td>
                <td>
                  <div className="row" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {!showHidden && (
                      <button
                        className="btn btn-sm"
                        title="Добавить в смету"
                        onClick={() => est.actions.addRow({
                          name: it.name, unit: it.unit, unitPrice: it.unitPrice, qty: 1,
                          notFound: false, source: it._kind === "ddc" ? "ddc" : (it._kind === "user" ? "manual" : "local"),
                        })}
                      >+ В смету</button>
                    )}
                    {showHidden ? (
                      <button
                        className="btn btn-sm"
                        title="Восстановить"
                        onClick={() => est.actions.restoreCatalogItem(it.name, it.unit)}
                      >↺ Восстановить</button>
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
          })}
        </tbody>
      </table>

      {visible.length === 0 && (
        <div className="kh-empty" style={{ padding: 24, textAlign: "center" }}>
          {query ? "Ничего не найдено" : "База пуста — добавьте позиции"}
        </div>
      )}
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
