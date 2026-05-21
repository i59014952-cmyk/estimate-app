// SearchResults.jsx — dropdown shown under the toolbar search input.

function SearchResults({ query, results, catalogReady, onAdd, onClose }) {
  // Hooks must run on every render (Rules of Hooks): keep them above any early
  // return, otherwise the hook count changes between renders and React throws
  // "Internal React error: Expected static flag was missing".
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const isSearchInput = e.target.tagName === 'INPUT' && e.target.placeholder && e.target.placeholder.includes('Найти');
        if (!isSearchInput) onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!query || query.length < 2) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute", top: "100%", left: 32, right: 32, marginTop: 4,
        background: "var(--paper-card)", border: "1px solid var(--rule)",
        borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
        maxHeight: 360, overflowY: "auto", zIndex: 20,
      }}
    >
      {!catalogReady && (
        <div className="muted tiny" style={{ padding: 14 }}>Каталог ещё загружается…</div>
      )}
      {catalogReady && results.length === 0 && (
        <div className="muted tiny" style={{ padding: 14 }}>Ничего не найдено</div>
      )}
      {results.map((item, idx) => (
        <ResultItem key={idx} item={item} onAdd={onAdd} />
      ))}
    </div>
  );
}

function ResultItem({ item, onAdd }) {
  const [qty, setQty] = React.useState("1");
  const handleAdd = () => {
    const n = parseFloat(qty);
    if (!isFinite(n) || n <= 0) return;
    onAdd({ name: item.name, unit: item.unit, unitPrice: item.unitPrice, qty: n, notFound: false, source: 'local' });
    setQty("1");
  };
  return (
    <div className="row center" style={{
      padding: "10px 14px", borderBottom: "1px solid var(--rule)", gap: 12,
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={item.name}>
        {item.name}
      </span>
      <span className="mono tiny muted" style={{ width: 50, textAlign: "center" }}>{item.unit || "—"}</span>
      <span className="mono" style={{ width: 90, textAlign: "right", fontSize: 12 }}>
        {formatMoney(item.unitPrice)} ₽
      </span>
      <input
        type="number" min="0" step="0.01" value={qty}
        onChange={(e) => setQty(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
        className="mono"
        style={{ width: 60, textAlign: "right", padding: "4px 6px", border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }}
      />
      <button onClick={handleAdd} className="btn btn-sm btn-primary">Добавить</button>
    </div>
  );
}

Object.assign(window, { SearchResults });
