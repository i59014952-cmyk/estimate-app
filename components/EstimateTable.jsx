// EstimateTable.jsx — list of estimate rows with qty edit, picker, delete.

function EstimateTable({ rows, onUpdateQty, onUpdateRow, onRemove, onTogglePicker, onApplyCandidate, onApplyManual }) {
  return (
    <div className="col">
      {rows.map((r, i) => (
        <EstimateRow
          key={r.id}
          row={r}
          index={i + 1}
          onUpdateQty={onUpdateQty}
          onUpdateRow={onUpdateRow}
          onRemove={onRemove}
          onTogglePicker={onTogglePicker}
          onApplyCandidate={onApplyCandidate}
          onApplyManual={onApplyManual}
        />
      ))}
    </div>
  );
}

function EstimateRow({ row, index, onUpdateQty, onUpdateRow, onRemove, onTogglePicker, onApplyCandidate, onApplyManual }) {
  const total = row.notFound ? null : row.qty * row.unitPrice;
  const hasAlternatives = row.candidates && row.candidates.length > 1;
  const sourceLabel = SOURCE_LABELS[row.source] || '—';

  const updateName = (v) => onUpdateRow && onUpdateRow(row.id, { name: v });
  const updateUnit = (v) => onUpdateRow && onUpdateRow(row.id, { unit: v });
  const updatePrice = (raw) => {
    const n = parseFloat(String(raw).replace(',', '.').replace(/\s/g, ''));
    if (!isFinite(n) || n < 0) return;
    if (!onUpdateRow) return;
    if (n > 0) {
      onUpdateRow(row.id, { unitPrice: n, notFound: false, source: row.source === 'none' ? 'manual' : row.source });
    } else {
      onUpdateRow(row.id, { unitPrice: 0, notFound: true, source: 'none' });
    }
  };

  return (
    <div style={{ borderBottom: "1px solid var(--rule)" }}>
      <div className="row" style={{
        padding: "12px 32px",
        alignItems: "center",
        background: row.notFound ? "rgba(194,88,66,0.04)" : "transparent",
      }}>
        <div className="mono tiny" style={{ width: 56, color: "var(--ink-4)" }}>
          {String(index).padStart(2, "0")}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 12, color: "var(--ink)" }}>
          <Editable value={row.name} onChange={updateName} placeholder="Название позиции" />
          {row.url && (
            <a href={row.url} target="_blank" rel="noopener noreferrer"
               style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-3)", textDecoration: "none" }} title="Открыть источник">↗</a>
          )}
        </div>
        <div className="mono tiny" style={{ width: 64, textAlign: "center", color: "var(--ink-3)" }}>
          <Editable value={row.unit} onChange={updateUnit} placeholder="ед." />
        </div>
        <div style={{ width: 80, textAlign: "right" }}>
          <input
            type="number" min="0" step="0.01" value={row.qty}
            onChange={(e) => onUpdateQty(row.id, parseFloat(e.target.value))}
            className="mono"
            style={{
              width: 72, textAlign: "right", padding: "4px 6px",
              border: "1px solid var(--rule)", borderRadius: 4,
              background: "var(--paper)", color: "var(--ink)", fontSize: 12,
            }}
          />
        </div>
        <div className="mono" style={{ width: 100, textAlign: "right", color: row.notFound ? "var(--rust)" : "var(--ink)", fontSize: 12 }}>
          <Editable
            value={row.unitPrice > 0 ? formatMoney(row.unitPrice) : ""}
            onChange={updatePrice}
            placeholder="0"
          />
          {row.notFound && (
            <div>
              <button onClick={() => onTogglePicker(row.id)} className="btn btn-sm" style={{ padding: "2px 6px", fontSize: 10, marginTop: 2 }}>
                {row.expanded ? "Скрыть" : "Подобрать"}
              </button>
            </div>
          )}
          {!row.notFound && hasAlternatives && (
            <div>
              <button onClick={() => onTogglePicker(row.id)} className="btn btn-sm" style={{ padding: "2px 6px", fontSize: 10, marginTop: 2 }}>
                {row.expanded ? "Скрыть" : `Заменить (${row.candidates.length})`}
              </button>
            </div>
          )}
        </div>
        <div className="mono serif" style={{ width: 130, textAlign: "right", fontSize: 14 }}>
          {total === null ? "—" : formatMoney(total)}
        </div>
        <div style={{ width: 110, textAlign: "right" }}>
          <span className="mono tiny" style={{
            padding: "2px 8px", borderRadius: 99,
            border: "1px solid var(--rule)",
            color: row.notFound ? "var(--rust)" : "var(--ink-3)",
          }}>
            {sourceLabel}
          </span>
        </div>
        <button
          onClick={() => onRemove(row.id)}
          className="btn btn-icon"
          style={{ width: 28, height: 28, marginLeft: 8 }}
          title="Удалить"
          aria-label="Удалить"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      {row.expanded && (
        <Picker
          row={row}
          onApplyCandidate={onApplyCandidate}
          onApplyManual={onApplyManual}
        />
      )}
    </div>
  );
}

function Picker({ row, onApplyCandidate, onApplyManual }) {
  const [manual, setManual] = React.useState("");
  const apply = () => onApplyManual(row.id, manual);

  let list;
  if (row.candidatesLoading) {
    list = <div className="muted tiny" style={{ padding: 12 }}>Поиск вариантов в каталоге Колорит…</div>;
  } else if (row.candidatesError) {
    list = <div className="tiny" style={{ padding: 12, color: "var(--rust)" }}>Ошибка: {row.candidatesError}</div>;
  } else if (!row.candidates || row.candidates.length === 0) {
    list = <div className="muted tiny" style={{ padding: 12 }}>В каталоге Колорит ничего не нашлось — введите цену вручную.</div>;
  } else {
    list = (
      <div className="col gap-2" style={{ padding: 12 }}>
        {row.candidates.map((c, i) => {
          const src = KNOWN_SOURCES.has(c.city) ? c.city : 'kolorit';
          return (
            <button
              key={i}
              onClick={() => onApplyCandidate(row.id, i)}
              className="row center between"
              style={{
                padding: "8px 12px", border: "1px solid var(--rule)", borderRadius: 6,
                background: "var(--paper)", textAlign: "left", cursor: "pointer", gap: 12,
              }}
            >
              <span style={{ flex: 1, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name || ''}
              </span>
              <span className="mono tiny" style={{ padding: "2px 6px", border: "1px solid var(--rule)", borderRadius: 99 }}>
                {SOURCE_LABELS[src]}
              </span>
              <span className="mono" style={{ width: 90, textAlign: "right", fontSize: 12 }}>
                {c.price ? formatMoney(c.price) + " ₽" : "—"}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--paper-2)",
      borderTop: "1px dashed var(--rule)",
      padding: "8px 32px 14px",
    }}>
      <div className="eyebrow" style={{ padding: "6px 0" }}>
        Варианты для «{row.name}»
      </div>
      {list}
      <div className="row center gap-2" style={{ padding: "8px 12px 0" }}>
        <span className="tiny muted">или цена вручную:</span>
        <input
          type="number" min="0" step="0.01" value={manual} placeholder="0"
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          className="mono"
          style={{ width: 100, padding: "4px 6px", border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }}
        />
        <span className="mono tiny">₽</span>
        <button onClick={apply} className="btn btn-sm">Применить</button>
      </div>
    </div>
  );
}

Object.assign(window, { EstimateTable });
