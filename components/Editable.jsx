// Editable.jsx — inline-editable text. Click to edit, Enter/blur to save, Esc to cancel.

function Editable({ value, onChange, placeholder, style, className }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || "");
  const inputRef = React.useRef(null);

  React.useEffect(() => { setDraft(value || ""); }, [value]);
  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        className={`kh-editable kh-editable--editing ${className || ""}`}
        style={{
          font: "inherit", color: "inherit", letterSpacing: "inherit",
          background: "rgba(110,123,79,.10)",
          border: "1px solid var(--moss)",
          borderRadius: 4,
          padding: "0 6px", margin: "0 -6px",
          outline: "none", width: `${Math.max(String(draft).length + 1, 4)}ch`,
          minWidth: 60,
          ...style,
        }}
      />
    );
  }

  const empty = !value;
  return (
    <span
      className={`kh-editable ${className || ""}`}
      onClick={() => setEditing(true)}
      title="Клик — редактировать"
      style={{
        cursor: "text",
        borderRadius: 4,
        padding: "0 2px",
        margin: "0 -2px",
        ...style,
        opacity: empty ? .45 : 1,
      }}
    >
      {value || placeholder || "—"}
    </span>
  );
}

function useEditableMeta() {
  const KEY = "kh-meta-v1";
  const defaults = (typeof ESTIMATE !== "undefined") ? ESTIMATE : {};
  const [meta, setMeta] = React.useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch (_) {}
    return defaults;
  });
  const update = React.useCallback((key, value) => {
    setMeta(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);
  return [meta, update];
}

Object.assign(window, { Editable, useEditableMeta });
