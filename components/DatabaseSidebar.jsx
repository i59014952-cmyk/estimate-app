// DatabaseSidebar.jsx — левая колонка «База данных» с поиском, ручным добавлением и загрузкой файла.

function DatabaseSidebar({ est }) {
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", unit: "", unitPrice: "" });
  const [uploadStatus, setUploadStatus] = React.useState(null);
  const fileRef = React.useRef(null);

  const userCatalog = est.state.userCatalog;
  const localCatalog = est.state.catalog;
  const ddcCatalog = est.state.ddcCatalog;

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const merged = [
      ...userCatalog.map(it => ({ ...it, _kind: "user" })),
      ...localCatalog.map(it => ({ ...it, _kind: "local" })),
      ...ddcCatalog.map(it => ({ ...it, _kind: "ddc" })),
    ];
    if (!q) return merged.slice(0, 200);
    const out = [];
    for (const it of merged) {
      if ((it.name || "").toLowerCase().includes(q)) {
        out.push(it);
        if (out.length >= 200) break;
      }
    }
    return out;
  }, [query, userCatalog, localCatalog, ddcCatalog]);

  const totals = {
    user: userCatalog.length,
    local: localCatalog.length,
    ddc: ddcCatalog.length,
  };

  const startAdd = () => {
    setDraft({ name: "", unit: "", unitPrice: "" });
    setAdding(true);
  };
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
  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setUploadStatus({ kind: "busy", text: `Загрузка ${f.name}…` });
    est.actions.uploadCatalogFile(f).then(({ added, skipped }) => {
      setUploadStatus({ kind: "ok", text: `Добавлено ${added}, пропущено ${skipped}` });
      setTimeout(() => setUploadStatus(null), 4000);
    }).catch(err => {
      setUploadStatus({ kind: "error", text: err.message || String(err) });
      setTimeout(() => setUploadStatus(null), 6000);
    });
    e.target.value = "";
  };

  const kindBadge = (kind) => {
    if (kind === "user") return { label: "Моё", color: "var(--moss)" };
    if (kind === "local") return { label: "JSON", color: "var(--ink-4)" };
    return { label: "DDC", color: "var(--ink-4)" };
  };

  return (
    <aside className="col" style={{
      width: 288, padding: "20px 16px 18px", gap: 10,
      borderRight: "1px solid var(--rule)", background: "var(--paper-2)",
      minHeight: "100%",
    }}>
      <input
        ref={fileRef} type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        style={{ display: "none" }}
        onChange={onFileChange}
      />
      <div className="row between center" style={{ padding: "0 4px" }}>
        <div className="row center gap-2">
          <Icon name="cube" size={14} />
          <div className="eyebrow" style={{ padding: 0 }}>База данных</div>
        </div>
        <div className="row center gap-2">
          <button
            className="btn btn-icon"
            title="Добавить позицию"
            onClick={startAdd}
            style={{ width: 28, height: 28 }}
          >
            <Icon name="plus" size={13} />
          </button>
          <button
            className="btn btn-icon"
            title="Загрузить XLSX/CSV"
            onClick={onUploadClick}
            style={{ width: 28, height: 28 }}
          >
            <Icon name="upload" size={13} />
          </button>
        </div>
      </div>

      <div className="mono tiny" style={{ padding: "0 4px", color: "var(--ink-4)", letterSpacing: ".06em" }}>
        <b style={{ color: "var(--ink-2)" }}>{fmt(totals.user)}</b> моё
        <span style={{ margin: "0 6px", color: "var(--ink-4)" }}>·</span>
        <b style={{ color: "var(--ink-2)" }}>{fmt(totals.local)}</b> JSON
        <span style={{ margin: "0 6px", color: "var(--ink-4)" }}>·</span>
        <b style={{ color: "var(--ink-2)" }}>{fmt(totals.ddc)}</b> DDC
      </div>

      {uploadStatus && (
        <div
          className="mono tiny"
          style={{
            padding: "8px 10px", borderRadius: 8,
            border: "1px solid " + (uploadStatus.kind === "error" ? "var(--rust)" : "var(--rule)"),
            background: "var(--paper-card)",
            color: uploadStatus.kind === "error" ? "var(--rust)" : "var(--ink-2)",
          }}
        >
          {uploadStatus.text}
        </div>
      )}

      {adding && (
        <form onSubmit={submitAdd} className="col" style={{
          gap: 6, padding: 10, borderRadius: 10,
          border: "1px solid var(--moss)", background: "var(--paper-card)",
        }}>
          <input
            autoFocus
            placeholder="Название"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            style={inputStyle()}
          />
          <div className="row gap-2">
            <input
              placeholder="Ед."
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              style={{ ...inputStyle(), width: 60 }}
            />
            <input
              placeholder="Цена ₽"
              inputMode="decimal"
              value={draft.unitPrice}
              onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
              style={{ ...inputStyle(), flex: 1 }}
            />
          </div>
          <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-sm" onClick={cancelAdd}>Отмена</button>
            <button type="submit" className="btn btn-sm btn-primary"
              disabled={!draft.name.trim() || !isFinite(parseFloat(String(draft.unitPrice).replace(",", ".")))}>
              <Icon name="check" size={12} /> Сохранить
            </button>
          </div>
        </form>
      )}

      <div className="row center gap-2" style={{
        padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 99,
        background: "var(--paper-card)",
      }}>
        <Icon name="search" size={13} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти в базе…"
          style={{ flex: 1, border: 0, background: "transparent", outline: "none",
                   color: "var(--ink)", fontSize: 12, fontFamily: "var(--sans)" }}
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Очистить"
                  style={{ border: 0, background: "transparent", color: "var(--ink-3)",
                           cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}>
            <Icon name="x" size={11} />
          </button>
        )}
      </div>

      <div className="col" style={{
        flex: 1, minHeight: 0, overflowY: "auto", gap: 4, paddingRight: 2,
      }}>
        {visible.length === 0 && (
          <div className="muted tiny" style={{ padding: 12, textAlign: "center" }}>
            {query ? "Ничего не найдено" : "База пуста — добавьте позиции"}
          </div>
        )}
        {visible.map((it, i) => {
          const badge = kindBadge(it._kind);
          const key = `${it._kind}-${it.name}-${it.unit}-${i}`;
          return (
            <div
              key={key}
              className="row center"
              style={{
                padding: "7px 9px", borderRadius: 8,
                border: "1px solid var(--rule)", background: "var(--paper-card)",
                gap: 6,
              }}
            >
              <div className="col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{
                  fontSize: 12, lineHeight: 1.25, color: "var(--ink)",
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }} title={it.name}>{it.name}</div>
                <div className="mono tiny" style={{ color: "var(--ink-4)", whiteSpace: "nowrap" }}>
                  <span style={{ color: badge.color }}>{badge.label}</span>
                  {it.unit ? <> <span style={{ color: "var(--ink-4)" }}>·</span> {it.unit}</> : null}
                  {it.unitPrice ? <> <span style={{ color: "var(--ink-4)" }}>·</span> {fmt(Math.round(it.unitPrice))} ₽</> : null}
                </div>
              </div>
              <button
                className="btn btn-icon"
                title="Добавить в смету"
                onClick={() => est.actions.addRow({
                  name: it.name, unit: it.unit, unitPrice: it.unitPrice, qty: 1,
                  notFound: false, source: it._kind === "ddc" ? "ddc" : (it._kind === "user" ? "manual" : "local"),
                })}
                style={{ width: 26, height: 26, flexShrink: 0 }}
              >
                <Icon name="plus" size={12} />
              </button>
              {it._kind === "user" && (
                <button
                  className="btn btn-icon"
                  title="Удалить из базы"
                  onClick={() => est.actions.removeCatalogItem(it.name, it.unit)}
                  style={{ width: 26, height: 26, flexShrink: 0, borderColor: "transparent" }}
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function inputStyle() {
  return {
    border: "1px solid var(--rule)", borderRadius: 6,
    padding: "6px 8px", outline: "none",
    background: "var(--paper)", color: "var(--ink)",
    fontSize: 12, fontFamily: "var(--sans)",
  };
}

Object.assign(window, { DatabaseSidebar });
