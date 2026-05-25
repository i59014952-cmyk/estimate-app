// KHSelect — themed dropdown replacing native <select>, so option hover uses the
// site palette instead of the OS-native blue highlight. Popup is positioned with
// fixed coordinates so it never gets clipped by a scrollable modal, and closes on
// outside click, Escape, scroll or resize. Keyboard: Up/Down/Enter/Escape/Space.

function KHSelect({ value, onChange, options = [], title, style, disabled = false, placeholder = "—", menuWidth }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const current = opts.find((o) => o.value === value);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [pos, setPos] = React.useState(null);
  const btnRef = React.useRef(null);
  const listRef = React.useRef(null);

  const place = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const openUp = below < 220 && r.top > below;
    setPos({
      left: r.left,
      width: menuWidth || r.width,
      top: openUp ? null : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : null,
      maxHeight: Math.max(140, (openUp ? r.top : below) - 16),
    });
  }, [menuWidth]);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(opts.findIndex((o) => o.value === value));
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (listRef.current && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (v) => { setOpen(false); if (v !== value) onChange(v); };

  const onTriggerKey = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault(); openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(opts.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (opts[active]) pick(opts[active].value); }
  };

  const triggerStyle = {
    display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    textAlign: "left", font: "inherit", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    ...style,
  };

  return (
    <button
      type="button"
      ref={btnRef}
      title={title}
      disabled={disabled}
      onClick={() => (open ? setOpen(false) : openMenu())}
      onKeyDown={onTriggerKey}
      aria-haspopup="listbox"
      aria-expanded={open}
      style={triggerStyle}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {current ? current.label : placeholder}
      </span>
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}>
        <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open && pos && ReactDOM.createPortal(
        <ul
          ref={listRef}
          role="listbox"
          className="kh-select__menu"
          style={{
            position: "fixed", zIndex: 2000, left: pos.left, width: pos.width,
            top: pos.top != null ? pos.top : undefined,
            bottom: pos.bottom != null ? pos.bottom : undefined,
            maxHeight: pos.maxHeight, overflowY: "auto", margin: 0, padding: 4, listStyle: "none",
            background: "var(--paper-card)", border: "1px solid var(--rule)", borderRadius: 8,
            boxShadow: "0 18px 40px -18px rgba(70,52,30,.45)",
          }}
        >
          {opts.map((o, i) => {
            const selected = o.value === value;
            const hot = i === active;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                style={{
                  padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                  fontSize: 13, lineHeight: 1.3, color: "var(--ink)",
                  fontWeight: selected ? 600 : 400,
                  background: hot ? "rgba(110,123,79,.16)" : selected ? "rgba(110,123,79,.08)" : "transparent",
                }}
              >
                {o.label}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </button>
  );
}

Object.assign(window, { KHSelect });
