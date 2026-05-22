// Workspace.jsx — рабочий стол сметчика, 1:1 с PDF (пустая смета «Сосны»)

const { useState, useMemo, useEffect } = React;

function khOperatorEmail() {
  try {
    const t = window.KHAuth && window.KHAuth.token && window.KHAuth.token();
    if (!t) return null;
    const seg = t.split(".")[1];
    if (!seg) return null;
    const json = atob(seg.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return payload.email || payload.sub || null;
  } catch (_) { return null; }
}

function khFormatSavedAt(ts, now) {
  if (!ts) return "черновик";
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hhmm : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")} ${hhmm}`;
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  const email = useMemo(() => khOperatorEmail(), [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const signOut = () => {
    try { window.KHAuth && window.KHAuth.signOut && window.KHAuth.signOut(); } catch (_) {}
    window.location.reload();
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Аккаунт"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Аккаунт"
        style={{
          width: 32, height: 32, borderRadius: 99, background: "var(--coffee)",
          color: "#FBF5E7", display: "grid", placeItems: "center", border: "none", cursor: "pointer",
          fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".05em"
        }}
      >АМ</button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 200,
          background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,.14)", padding: 6, zIndex: 50
        }}>
          <div className="mono tiny" style={{ padding: "8px 10px", color: "var(--ink-3)", borderBottom: "1px solid var(--rule)", marginBottom: 4, wordBreak: "break-all" }}>
            {email || "Оператор"}
          </div>
          <button role="menuitem" onClick={signOut} className="row center gap-2" style={{
            width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent",
            borderRadius: 8, cursor: "pointer", color: "var(--ink)", font: "inherit"
          }}>
            <Icon name="logout" size={14} /> Выйти
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar({ onTheme, theme, onMenu, onNew, savedAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="row center between kh-topbar" style={{
      padding: "14px 28px", borderBottom: "1px solid var(--rule)",
      background: "var(--paper)", position: "sticky", top: 0, zIndex: 10
    }}>
      <div className="row center gap-6 kh-topbar__brand">
        <button
          onClick={onMenu}
          className="btn btn-icon kh-topbar__burger"
          aria-label="Открыть меню"
          title="Меню"
        >
          <Icon name="menu" size={16} />
        </button>
        <KubLogo size={48} />
      </div>
      <div className="row center gap-3 kh-topbar__actions">
        <button className="btn btn-sm kh-topbar__new" onClick={onNew}><Icon name="plus" size={14} /> Новая смета</button>
        <div className="row center gap-2 mono tiny kh-topbar__autosave" style={{
          padding: "7px 12px", border: "1px solid var(--rule)", borderRadius: 99, color: "var(--ink-3)"
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99, background: "var(--moss)",
            boxShadow: "0 0 0 3px rgba(110,123,79,.2)"
          }} /> Автосохр · {khFormatSavedAt(savedAt, now)}
        </div>
        <button className="btn btn-icon" onClick={onTheme} title="Тема">
          <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
        </button>
        <AccountMenu />
      </div>
    </div>
  );
}

function EstimatesTabs({ index, currentId, onSwitch, onNew, onClose, onCompare }) {
  if (!index || index.length <= 1) return null; // одну смету не показываем
  return (
    <div className="row center kh-esttabs" style={{
      gap: 6, padding: "6px 16px", background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule)", overflowX: "auto", flexShrink: 0,
    }}>
      {index.map(e => {
        const active = e.id === currentId;
        return (
          <div
            key={e.id}
            onClick={() => !active && onSwitch(e.id)}
            className="row center gap-2"
            style={{
              cursor: active ? "default" : "pointer", flexShrink: 0,
              padding: "6px 10px", borderRadius: 8,
              border: "1px solid " + (active ? "var(--ink)" : "var(--rule)"),
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--ink-2)",
              fontSize: 13, maxWidth: 200,
            }}
            title={e.name}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
            {index.length > 1 && (
              <span
                onClick={(ev) => { ev.stopPropagation(); if (window.confirm(`Закрыть смету «${e.name}»? Её данные будут удалены.`)) onClose(e.id); }}
                title="Закрыть смету"
                style={{ display: "inline-flex", opacity: 0.7, padding: "0 2px", borderRadius: 4 }}
              >×</span>
            )}
          </div>
        );
      })}
      <button
        onClick={onNew}
        title="Новая смета"
        className="row center"
        style={{
          flexShrink: 0, width: 30, height: 30, borderRadius: 8, cursor: "pointer",
          border: "1px dashed var(--rule)", background: "transparent", color: "var(--ink-2)",
          justifyContent: "center", fontSize: 18, lineHeight: 1,
        }}
      >+</button>
      <button
        onClick={onCompare}
        title="Сравнить сметы"
        className="row center gap-2"
        style={{
          flexShrink: 0, marginLeft: "auto", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
          border: "1px solid var(--rule)", background: "var(--paper-card)", color: "var(--ink-2)",
          fontSize: 13, whiteSpace: "nowrap",
        }}
      >⇆ Сравнить сметы</button>
    </div>
  );
}

function CompareEstimatesModal({ open, onClose, index }) {
  const ids = (index || []).map(e => e.id);
  const nameOf = (id) => ((index || []).find(e => e.id === id) || {}).name || id;
  const [aId, setAId] = useState(ids[0] || "");
  const [bId, setBId] = useState(ids[1] || "");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    setTick(t => t + 1); // перечитать localStorage при каждом открытии
    const list = (index || []).map(e => e.id);
    let a = list.includes(aId) ? aId : list[0];
    let b = (list.includes(bId) && bId !== a) ? bId : list.find(x => x !== a);
    if (a !== aId) setAId(a || "");
    if (b !== bId) setBId(b || "");
  }, [open]);

  const readRows = (id) => { try { return JSON.parse(localStorage.getItem("kh-estimate-v1::" + id) || "[]"); } catch (_) { return []; } };
  const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").trim();

  const rows = React.useMemo(() => {
    if (!open || !aId || !bId) return [];
    const A = readRows(aId), B = readRows(bId);
    const map = new Map();
    // Повторяющиеся названия не схлопываем: n-ю позицию в A сопоставляем с n-й в B.
    const seen = { a: {}, b: {} };
    const add = (r, side) => {
      if (!r || !r.name) return;
      const base = norm(r.name) + "|" + norm(r.unit);
      const n = (seen[side][base] = (seen[side][base] || 0) + 1);
      const key = base + "#" + n;
      if (!map.has(key)) map.set(key, { name: r.name, unit: r.unit || "", a: null, b: null });
      map.get(key)[side] = Number(r.unitPrice) || 0;
    };
    A.forEach(r => add(r, "a"));
    B.forEach(r => add(r, "b"));
    // Разная цена — в самый верх, затем «только в одной», затем одинаковые.
    const order = { "diff": 0, "only-a": 1, "only-b": 1, "same": 2 };
    return Array.from(map.values()).map(g => {
      let status;
      if (g.a == null) status = "only-b";
      else if (g.b == null) status = "only-a";
      else if (g.a !== g.b) status = "diff";
      else status = "same";
      return { ...g, status, delta: (g.a != null && g.b != null) ? (g.b - g.a) : null };
    }).sort((x, y) => (order[x.status] - order[y.status]) || String(x.name).localeCompare(String(y.name), "ru"));
  }, [open, aId, bId, tick]);

  const diffCount = rows.filter(r => r.status !== "same").length;
  const selStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", font: "inherit", maxWidth: 220 };
  const cell = { width: 120, textAlign: "right", whiteSpace: "nowrap" };

  if (!window.KHModal) return null;
  const KHM = window.KHModal;
  return (
    <KHM open={open} onClose={onClose} wide title="Сравнение смет" subtitle="Различия в позициях и ценах (себестоимость)">
      <div className="col" style={{ gap: 14 }}>
        <div className="row center" style={{ gap: 10, flexWrap: "wrap" }}>
          <select value={aId} onChange={e => setAId(e.target.value)} style={selStyle}>
            {(index || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span className="mono" style={{ color: "var(--ink-3)" }}>↔</span>
          <select value={bId} onChange={e => setBId(e.target.value)} style={selStyle}>
            {(index || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span className="tiny muted" style={{ marginLeft: "auto" }}>
            {aId === bId ? "Выберите две разные сметы" : `Различий: ${diffCount} из ${rows.length}`}
          </span>
          <button className="btn btn-icon" title="Обновить из смет" onClick={() => setTick(t => t + 1)}><Icon name="refresh" size={14} /></button>
        </div>

        {aId !== bId && (
          <div className="col" style={{ gap: 0, border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden" }}>
            <div className="row center" style={{ gap: 8, padding: "8px 12px", background: "var(--paper-2)", borderBottom: "1px solid var(--rule)", color: "var(--ink-3)" }}>
              <span className="mono tiny" style={{ flex: 1, letterSpacing: ".06em" }}>ПОЗИЦИЯ</span>
              <span className="mono tiny" style={{ width: 60 }}>ЕД.</span>
              <span className="mono tiny" style={cell}>{nameOf(aId)}</span>
              <span className="mono tiny" style={cell}>{nameOf(bId)}</span>
              <span className="mono tiny" style={cell}>Δ</span>
            </div>
            <div className="col" style={{ maxHeight: 460, overflowY: "auto" }}>
              {rows.length === 0 && <div className="tiny muted" style={{ padding: 14 }}>Обе сметы пусты.</div>}
              {rows.map((r, i) => {
                const isDiff = r.status !== "same";
                const tone = r.status === "only-a" ? "rgba(110,123,79,.12)"
                  : r.status === "only-b" ? "rgba(154,68,34,.10)"
                  : r.status === "diff" ? "rgba(194,88,66,.10)" : "transparent";
                return (
                  <div key={i} className="row center" style={{
                    gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--rule)",
                    background: tone, fontWeight: isDiff ? 500 : 400,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span className="mono tiny muted" style={{ width: 60 }}>{r.unit || "—"}</span>
                    <span className="mono" style={{ ...cell, color: r.a == null ? "var(--ink-4)" : "var(--ink)" }}>{r.a == null ? "—" : fmtMoney(r.a)}</span>
                    <span className="mono" style={{ ...cell, color: r.b == null ? "var(--ink-4)" : "var(--ink)" }}>{r.b == null ? "—" : fmtMoney(r.b)}</span>
                    <span className="mono" style={{ ...cell, color: r.delta == null ? "var(--ink-4)" : (r.delta > 0 ? "var(--rust)" : (r.delta < 0 ? "var(--moss, #4f6f52)" : "var(--ink-4)")) }}>
                      {r.status === "only-a" ? "нет в B" : r.status === "only-b" ? "нет в A" : (r.delta === 0 ? "=" : (r.delta > 0 ? "+" : "") + fmtMoney(r.delta))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="row center gap-3 tiny muted" style={{ flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(194,88,66,.5)", marginRight: 4 }} />разная цена</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(110,123,79,.5)", marginRight: 4 }} />только в левой</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(154,68,34,.5)", marginRight: 4 }} />только в правой</span>
        </div>
      </div>
    </KHM>
  );
}

function khReadDynamicCounts() {
  const tryParse = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const objects = tryParse('kh-objects-v1');
  const activeObjects = objects.filter(o => (o.status || 'active') === 'active').length;
  const contractors = tryParse('kh-contractors-v1').length;
  const database = Number(window.KH_DB_COUNT || 0);
  const stores = tryParse('kh-stores-v1').length;
  return { objects: activeObjects, contractors, database, stores };
}

function AdminUsersModal({ open, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("estimator");
  const [busy, setBusy] = useState(false);

  const ROLE_LABELS = { admin: "Администратор", estimator: "Сметчик", viewer: "Наблюдатель" };

  const load = React.useCallback(() => {
    setLoading(true); setError("");
    window.KHAuth.listUsers()
      .then((rows) => setUsers(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message || "Не удалось загрузить список"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const add = async () => {
    setBusy(true); setError("");
    try {
      await window.KHAuth.createUser(email.trim(), password, role);
      setEmail(""); setPassword(""); setRole("estimator");
      load();
    } catch (e) { setError(e.message || "Не удалось создать пользователя"); }
    finally { setBusy(false); }
  };

  const changeRole = async (u, newRole) => {
    try { await window.KHAuth.setUserRole(u.email, newRole); load(); }
    catch (e) { window.alert(e.message || "Не удалось изменить роль"); }
  };

  const resetPwd = async (u) => {
    const np = window.prompt(`Новый пароль для ${u.email} (минимум 6 символов):`);
    if (np == null) return;
    try { await window.KHAuth.setUserPassword(u.email, np); window.alert("Пароль обновлён"); }
    catch (e) { window.alert(e.message || "Не удалось сменить пароль"); }
  };

  const del = async (u) => {
    if (!window.confirm(`Удалить пользователя ${u.email}? Он потеряет доступ к приложению.`)) return;
    try { await window.KHAuth.deleteUser(u.email); load(); }
    catch (e) { window.alert(e.message || "Не удалось удалить пользователя"); }
  };

  const canAdd = email.trim().length > 0 && password.length >= 6 && !busy;

  return (
    <KHModal open={open} onClose={onClose} title="Пользователи" subtitle="Доступ операторов к приложению">
      <div className="col" style={{ gap: 18 }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="eyebrow">Добавить пользователя</div>
          <div className="row gap-3" style={{ flexWrap: "wrap" }}>
            <input
              type="text" placeholder="логин" value={email}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: "1 1 200px", minWidth: 0, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", font: "inherit" }}
            />
            <input
              type="text" placeholder="пароль (мин. 6)" value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canAdd) add(); }}
              style={{ flex: "1 1 160px", minWidth: 0, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", font: "inherit" }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              title="Роль"
              style={{ flex: "0 0 auto", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", font: "inherit" }}
            >
              <option value="estimator">Сметчик</option>
              <option value="viewer">Наблюдатель</option>
              <option value="admin">Администратор</option>
            </select>
            <button className="btn btn-sm" onClick={add} disabled={!canAdd}
              style={{ opacity: canAdd ? 1 : 0.5, cursor: canAdd ? "pointer" : "not-allowed" }}>
              <Icon name="plus" size={14} /> Добавить
            </button>
          </div>
          {error && <div className="tiny" style={{ color: "var(--rust)" }}>{error}</div>}
        </div>

        <div className="col" style={{ gap: 6 }}>
          <div className="eyebrow">Пользователи {users.length ? `· ${users.length}` : ""}</div>
          {loading ? (
            <div className="tiny mono" style={{ color: "var(--ink-3)" }}>Загрузка…</div>
          ) : users.length === 0 ? (
            <div className="tiny mono" style={{ color: "var(--ink-3)" }}>Пока нет пользователей</div>
          ) : (
            <div className="col" style={{ gap: 4 }}>
              {users.map((u) => (
                <div key={u.email} className="row center between" style={{ padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 8, gap: 8 }}>
                  <div className="row center gap-2" style={{ minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                    {u.role_locked && <span className="mono tiny" style={{ padding: "2px 6px", borderRadius: 99, background: "var(--coffee)", color: "#FBF5E7" }} title="Роль задана переменной KH_ADMIN_EMAILS">env</span>}
                  </div>
                  <div className="row center gap-2">
                    <select
                      value={u.role}
                      disabled={u.role_locked}
                      title={u.role_locked ? "Роль задана переменной окружения" : "Роль"}
                      onChange={(e) => changeRole(u, e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", font: "inherit", opacity: u.role_locked ? 0.6 : 1 }}
                    >
                      <option value="estimator">Сметчик</option>
                      <option value="viewer">Наблюдатель</option>
                      <option value="admin">Администратор</option>
                    </select>
                    <button className="btn btn-icon" title="Сменить пароль" onClick={() => resetPwd(u)}><Icon name="refresh" size={14} /></button>
                    <button className="btn btn-icon" title="Удалить" onClick={() => del(u)}><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </KHModal>
  );
}

function AdminPanel() {
  const caps = useCaps();
  const [open, setOpen] = useState(false);
  if (!caps.users) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="row center gap-3 focusable kh-sidebar__admin"
        style={{
          marginTop: 10, width: "100%", padding: "9px 12px", borderRadius: 8,
          background: "transparent", color: "var(--ink-2)", border: "1px solid var(--rule)",
          cursor: "pointer", textAlign: "left", fontSize: 13, fontFamily: "var(--sans)"
        }}
      >
        <Icon name="users" size={15} /><span>Администрирование</span>
      </button>
      <AdminUsersModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Sidebar({ active, onPick, meta, updateMeta, mobileOpen, onClose, onOpenVendorDb, onOpenContractors }) {
  const caps = useCaps();
  const [counts, setCounts] = React.useState(khReadDynamicCounts);
  React.useEffect(() => {
    const refresh = () => setCounts(khReadDynamicCounts());
    window.addEventListener('storage', refresh);
    window.addEventListener('kh-storage', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kh-storage', refresh);
    };
  }, []);
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onClose]);
  const Item = ({ it }) => {
    const dynamic = counts[it.id];
    const count = dynamic != null ? dynamic : it.count;
    return (
      <button
        onClick={() => { onPick && onPick(it.id); onClose && onClose(); }}
        className="row center between focusable"
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 8,
          background: active === it.id ? "var(--ink)" : "transparent",
          color: active === it.id ? "var(--paper)" : "var(--ink-2)",
          border: 0, cursor: "pointer", textAlign: "left",
          fontSize: 13, fontFamily: "var(--sans)"
        }}
      >
        <span className="row center gap-3">
          <Icon name={it.icon} size={15} />
          <span>{it.label}</span>
        </span>
        {count != null && (
          <span className="mono tiny" style={{ opacity: active === it.id ? .7 : .55 }}>
            {fmt(count)}
          </span>
        )}
      </button>
    );
  };
  return (
    <>
      {mobileOpen && (
        <div
          className="kh-sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={"col kh-sidebar" + (mobileOpen ? " kh-sidebar--open" : "")}
        style={{
          width: 232, padding: "20px 16px 18px", gap: 4,
          borderRight: "1px solid var(--rule)", background: "var(--paper-2)",
          minHeight: "100%"
        }}
      >
      <div className="row center between kh-sidebar__head">
        <div className="eyebrow" style={{ padding: "0 12px 8px" }}>Рабочая область</div>
        <button
          onClick={onClose}
          className="btn btn-icon kh-sidebar__close"
          aria-label="Закрыть меню"
          title="Закрыть"
          style={{ width: 28, height: 28, marginBottom: 8 }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      {NAV.filter(it => caps.sections.includes(it.id)).map(it => <Item key={it.id} it={it} />)}
      {NAV2.some(it => caps.sections.includes(it.id)) && (
        <div className="eyebrow" style={{ padding: "16px 12px 8px", marginTop: 12, borderTop: "1px solid var(--rule)" }}>Справочники</div>
      )}
      {NAV2.filter(it => caps.sections.includes(it.id)).map(it => <Item key={it.id} it={it} />)}

      {caps.sections.includes('contractors') && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
          <ContractorsPanel
            onOpenVendorDb={(slug) => { onOpenVendorDb && onOpenVendorDb(slug); onClose && onClose(); }}
            onOpenContractors={() => { onOpenContractors && onOpenContractors(); onClose && onClose(); }}
          />
        </div>
      )}

      <div className="frame" style={{
        marginTop: "auto", padding: "14px 14px 12px", border: "1px solid var(--rule)",
        background: "var(--paper-card)", position: "relative"
      }}>
        <div className="frame-bl" /><div className="frame-br" />
        <div className="eyebrow" style={{ marginBottom: 8 }}>Текущий объект</div>
        <div className="serif-it" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 10, fontStyle: "italic" }}>
          {meta.kind || "Резиденция"} «<Editable value={meta.title} onChange={(v) => updateMeta && updateMeta("title", v)} />»
        </div>
        <div className="col tiny mono" style={{ gap: 5, color: "var(--ink-3)" }}>
          <div><span style={{ color: "var(--ink-4)" }}>Д.</span> <Editable value={meta.location || "Горки, 14 соток"} onChange={(v) => updateMeta && updateMeta("location", v)} /></div>
          <div><span style={{ color: "var(--ink-4)" }}>Площадь</span> <Editable value={meta.areaText || "284 м²"} onChange={(v) => updateMeta && updateMeta("areaText", v)} /></div>
          <div><span style={{ color: "var(--ink-4)" }}>Этап</span> <Editable value={meta.stage || "Смета / R3"} onChange={(v) => updateMeta && updateMeta("stage", v)} /></div>
        </div>
      </div>

      <AdminPanel />
    </aside>
    </>
  );
}

function MobileNav({ active, onPick }) {
  const [counts, setCounts] = React.useState(khReadDynamicCounts);
  React.useEffect(() => {
    const refresh = () => setCounts(khReadDynamicCounts());
    window.addEventListener('storage', refresh);
    window.addEventListener('kh-storage', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kh-storage', refresh);
    };
  }, []);
  const items = [...NAV, ...NAV2];
  return (
    <nav className="kh-mobile-nav" aria-label="Разделы">
      <div className="kh-mobile-nav__scroll">
        {items.map((it) => {
          const dynamic = counts[it.id];
          const count = dynamic != null ? dynamic : it.count;
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onPick && onPick(it.id)}
              className="kh-mobile-nav__chip"
              data-active={isActive ? "true" : "false"}
            >
              <Icon name={it.icon} size={14} />
              <span>{it.label}</span>
              {count != null && (
                <span className="mono kh-mobile-nav__count">{fmt(count)}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HeroBlock({ est, meta, updateMeta, onOpenDatabase }) {
  const caps = useCaps();
  const dbFileRef = React.useRef(null);
  const [dbUpload, setDbUpload] = React.useState(null);

  const onDbFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    let added = 0, updated = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setDbUpload({ kind: "busy", text: `Загрузка ${i + 1}/${files.length}: ${f.name}…` });
      try {
        const r = await est.actions.uploadCatalogFile(f);
        added += r.added; updated += r.updated || 0; skipped += r.skipped;
      } catch (err) {
        errors.push(`${f.name}: ${err.message || err}`);
      }
    }
    const upd = updated ? `, обновлено ${updated}` : '';
    setDbUpload(errors.length
      ? { kind: "error", text: `Ошибки: ${errors.join('; ')}` }
      : { kind: "ok", text: `Файлов: ${files.length}. Новых ${added}${upd}, пропущено ${skipped}` });
    setTimeout(() => setDbUpload(null), 6000);
  };

  return (
    <div className="frame kh-hero" style={{ position: "relative", padding: "30px 40px 28px", borderTop: "1px solid var(--rule-2)", borderBottom: "1px solid var(--rule-2)" }}>
      <div className="frame-bl" /><div className="frame-br" />
      <div className="row between kh-hero__top" style={{ alignItems: "flex-start", gap: 24 }}>
        <div className="col gap-3">
          <div className="serif kh-hero__title" style={{ fontSize: 60, lineHeight: .92, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>
            Смета <span className="serif-it" style={{ fontStyle: "italic" }}>«<Editable value={meta.title} onChange={(v) => updateMeta("title", v)} />»</span>
          </div>
          <div className="mono tiny kh-hero__sub" style={{ color: "var(--ink-3)", letterSpacing: ".08em" }}>
            <b style={{ color: "var(--ink)" }}><Editable value={meta.code} onChange={(v) => updateMeta("code", v)} /></b>
            <span style={{ margin: "0 8px", color: "var(--ink-4)" }}>·</span>
            <Editable value={meta.kind || "Резиденция"} onChange={(v) => updateMeta("kind", v)} />
            <span style={{ margin: "0 8px", color: "var(--ink-4)" }}>·</span>
            <Editable value={meta.construction || "Деревянный каркас"} onChange={(v) => updateMeta("construction", v)} />
            <span style={{ margin: "0 8px", color: "var(--ink-4)" }}>·</span>
            <Editable value={meta.areaText || "284 м²"} onChange={(v) => updateMeta("areaText", v)} />
          </div>
        </div>
        <div className="col mono tiny kh-hero__meta" style={{ alignItems: "flex-end", gap: 4, color: "var(--ink-3)", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
          <div>РЕВИЗИЯ <b style={{ color: "var(--ink)" }}><Editable value={meta.revision} onChange={(v) => updateMeta("revision", v)} /></b></div>
          <div>ДАТА <b style={{ color: "var(--ink)" }}><Editable value={meta.date} onChange={(v) => updateMeta("date", v)} /></b></div>
          <div>СМЕТЧИК <b style={{ color: "var(--ink)" }}><Editable value={meta.estimator} onChange={(v) => updateMeta("estimator", v)} /></b></div>
        </div>
      </div>

      <div className="row between center kh-hero__db" style={{
        marginTop: 24, paddingTop: 20, borderTop: "1px dashed var(--rule)",
        gap: 16, flexWrap: "wrap",
      }}>
        <div className="col gap-2" style={{ minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 26, lineHeight: 1, letterSpacing: "-0.01em", fontWeight: 600, color: "var(--ink)" }}>База данных</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2)" }}>Каталог позиций — загрузка и добавление</div>
        </div>
        {caps.edit && (
          <div className="row center kh-hero__db-actions" style={{ gap: 10, flexWrap: "wrap" }}>
            {dbUpload && (
              <span className="tiny" style={{ color: dbUpload.kind === "error" ? "var(--rust)" : "var(--ink-3)", maxWidth: 320 }}>
                {dbUpload.text}
              </span>
            )}
            <input
              ref={dbFileRef} type="file" multiple
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              style={{ display: "none" }}
              onChange={onDbFiles}
            />
            <button className="kh-btn-primary" onClick={() => dbFileRef.current && dbFileRef.current.click()}>
              ↑ Загрузить XLSX/CSV (можно несколько)
            </button>
            <button className="btn btn-sm" onClick={onOpenDatabase}>
              + Добавить позицию
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Toolbar({ query, onQuery }) {
  return (
    <div className="row between center kh-toolbar-bar" style={{ padding: "16px 32px", gap: 12, flexWrap: "wrap" }}>
      <div className="row center gap-3 kh-toolbar-bar__search" style={{
        flex: 1, minWidth: 280, padding: "9px 14px",
        border: "1px solid var(--rule)", borderRadius: 99, background: "var(--paper-card)"
      }}>
        <Icon name="search" size={15} />
        <input
          value={query} onChange={(e) => onQuery(e.target.value)}
          placeholder="Найти работу, материал или подрядчика…"
          style={{ flex: 1, border: 0, background: "transparent", outline: "none", color: "var(--ink)", fontSize: 13, fontFamily: "var(--sans)" }}
        />
        <span className="mono tiny kh-toolbar-bar__hint" style={{ color: "var(--ink-4)", border: "1px solid var(--rule)", borderRadius: 4, padding: "2px 6px" }}>⌘K</span>
      </div>
    </div>
  );
}

// SVG-домик 1:1 со скрина: 2 этажа, 2 окна 4-панельные, дверь-арка, дерево, лента Ø 14 200 мм
// Вокруг — летают листы бумаги, карандаш, линейка, рулетка
function HouseSketch() {
  const sand = "#EFE5CB";
  const sandRoof = "#DFD0A8";
  const moss = "#8A9A66";
  const ink = "var(--ink-2)";
  const dim = "var(--ink-3)";

  return (
    <div style={{ position: "relative", width: 320, height: 200, margin: "0 auto" }}>
      <svg viewBox="0 0 460 280" width="320" height="200" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <pattern id="kh-paper-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0H0V6" stroke="rgba(80,60,30,.18)" strokeWidth=".4" fill="none"/>
          </pattern>
        </defs>

        {/* Дерево слева */}
        <g stroke={moss} strokeWidth="1.4" fill="none" strokeLinecap="round">
          <circle cx="80" cy="120" r="16" fill={moss} fillOpacity=".25"/>
          <line x1="80" y1="136" x2="80" y2="218"/>
          <path d="M80 158 L70 152 M80 158 L90 152"/>
          <path d="M80 174 L68 167 M80 174 L92 167"/>
          <path d="M80 192 L66 184 M80 192 L94 184"/>
        </g>

        {/* Земля + штриховка */}
        <line x1="20" y1="218" x2="440" y2="218" stroke={ink} strokeWidth="1.2"/>
        <g stroke={ink} strokeWidth=".9" opacity=".75">
          {Array.from({length: 28}).map((_,i) => (
            <line key={i} x1={28 + i*15} y1="220" x2={22 + i*15} y2="232"/>
          ))}
        </g>

        {/* Дом — корпус */}
        <path d="M150 110 L150 218 L330 218 L330 110 Z" fill={sand} stroke={ink} strokeWidth="1.6" strokeLinejoin="round"/>
        {/* Крыша двускатная */}
        <path d="M134 110 L240 30 L346 110 Z" fill={sandRoof} stroke={ink} strokeWidth="1.6" strokeLinejoin="round"/>
        {/* Конёк-линия */}
        <line x1="240" y1="30" x2="240" y2="110" stroke={ink} strokeWidth="1.2" opacity=".5"/>

        {/* Водостоки/вертикальные пунктиры */}
        <line x1="180" y1="115" x2="180" y2="218" stroke={ink} strokeWidth="1" strokeDasharray="3 4" opacity=".55"/>
        <line x1="300" y1="115" x2="300" y2="218" stroke={ink} strokeWidth="1" strokeDasharray="3 4" opacity=".55"/>

        {/* Левое окно 4-панельное */}
        <g stroke={ink} strokeWidth="1.4" fill="white">
          <rect x="170" y="138" width="40" height="44"/>
          <line x1="190" y1="138" x2="190" y2="182"/>
          <line x1="170" y1="160" x2="210" y2="160"/>
        </g>
        {/* Правое окно 4-панельное */}
        <g stroke={ink} strokeWidth="1.4" fill="white">
          <rect x="270" y="138" width="40" height="44"/>
          <line x1="290" y1="138" x2="290" y2="182"/>
          <line x1="270" y1="160" x2="310" y2="160"/>
        </g>

        {/* Дверь-арка */}
        <path d="M222 218 L222 168 Q222 152 240 152 Q258 152 258 168 L258 218 Z" fill={sandRoof} stroke={ink} strokeWidth="1.4"/>
        <circle cx="252" cy="190" r="1.6" fill={ink}/>

        {/* Размерная лента снизу */}
        <g stroke={ink} strokeWidth="1.2" fill="none">
          <line x1="180" y1="240" x2="300" y2="240"/>
          <path d="M180 235 L172 240 L180 245" />
          <path d="M300 235 L308 240 L300 245" />
        </g>
        <text x="240" y="262" fontFamily="JetBrains Mono, monospace" fontSize="13" fill={dim} textAnchor="middle" letterSpacing=".08em">Ø 14 200 мм</text>

        {/* === Летающие объекты === */}
        {/* лист бумаги 1 — большой, в воздухе слева сверху */}
        <g className="kh-fly-1" style={{ transformOrigin: "60px 60px" }}>
          <g transform="translate(28 28) rotate(-18)">
            <rect x="0" y="0" width="46" height="58" fill="white" stroke={ink} strokeWidth="1.1"/>
            <rect x="0" y="0" width="46" height="58" fill="url(#kh-paper-grid)"/>
            <line x1="6" y1="10" x2="40" y2="10" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="6" y1="16" x2="34" y2="16" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <rect x="6" y="24" width="20" height="14" stroke={ink} strokeWidth=".7" fill="none"/>
            <line x1="6" y1="44" x2="40" y2="44" stroke={ink} strokeWidth=".7" opacity=".4"/>
            <line x1="6" y1="50" x2="30" y2="50" stroke={ink} strokeWidth=".7" opacity=".4"/>
          </g>
        </g>

        {/* лист бумаги 2 — справа сверху */}
        <g className="kh-fly-2" style={{ transformOrigin: "400px 50px" }}>
          <g transform="translate(380 22) rotate(14)">
            <rect x="0" y="0" width="40" height="52" fill="white" stroke={ink} strokeWidth="1.1"/>
            <line x1="5" y1="10" x2="32" y2="10" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="5" y1="16" x2="28" y2="16" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="5" y1="22" x2="34" y2="22" stroke={ink} strokeWidth=".7" opacity=".5"/>
            <line x1="5" y1="32" x2="22" y2="32" stroke={ink} strokeWidth=".7" opacity=".4"/>
            <line x1="5" y1="38" x2="32" y2="38" stroke={ink} strokeWidth=".7" opacity=".4"/>
          </g>
        </g>

        {/* лист бумаги 3 — маленький, слева в середине */}
        <g className="kh-fly-3" style={{ transformOrigin: "30px 150px" }}>
          <g transform="translate(8 134) rotate(8)">
            <rect x="0" y="0" width="30" height="38" fill="white" stroke={ink} strokeWidth="1"/>
            <line x1="4" y1="8" x2="24" y2="8" stroke={ink} strokeWidth=".6" opacity=".5"/>
            <line x1="4" y1="14" x2="20" y2="14" stroke={ink} strokeWidth=".6" opacity=".5"/>
            <line x1="4" y1="22" x2="24" y2="22" stroke={ink} strokeWidth=".6" opacity=".4"/>
          </g>
        </g>

        {/* карандаш — справа в середине, наклонён */}
        <g className="kh-fly-4" style={{ transformOrigin: "420px 150px" }}>
          <g transform="translate(394 130) rotate(-32)">
            {/* корпус */}
            <rect x="0" y="0" width="56" height="9" fill="#D8A45C" stroke={ink} strokeWidth=".9"/>
            {/* металлическая обойма */}
            <rect x="56" y="0" width="6" height="9" fill="#B7B7BE" stroke={ink} strokeWidth=".9"/>
            {/* ластик */}
            <rect x="62" y="0" width="6" height="9" fill="#E89B8B" stroke={ink} strokeWidth=".9"/>
            {/* грифель */}
            <path d="M0 0 L-9 4.5 L0 9 Z" fill="#3a3a3a" stroke={ink} strokeWidth=".9"/>
            {/* кончик-ободок */}
            <line x1="-2" y1="2.2" x2="-2" y2="6.8" stroke={ink} strokeWidth=".9"/>
          </g>
        </g>

        {/* линейка-треугольник — внизу слева в воздухе */}
        <g className="kh-fly-5" style={{ transformOrigin: "70px 240px" }}>
          <g transform="translate(36 224) rotate(10)">
            <path d="M0 0 L70 0 L0 38 Z" fill="rgba(212,176,90,.85)" stroke={ink} strokeWidth="1"/>
            {/* деления */}
            {Array.from({length: 13}).map((_,i)=> (
              <line key={i} x1={5+i*5} y1="0" x2={5+i*5} y2={i%5===0?6:3} stroke={ink} strokeWidth=".7"/>
            ))}
          </g>
        </g>

        {/* рулетка — справа внизу */}
        <g className="kh-fly-6" style={{ transformOrigin: "400px 240px" }}>
          <g transform="translate(376 226)">
            <rect x="0" y="0" width="34" height="22" rx="3" fill="#C25842" stroke={ink} strokeWidth="1.1"/>
            <circle cx="11" cy="11" r="6.5" fill="#fff" stroke={ink} strokeWidth=".9"/>
            <circle cx="11" cy="11" r="2" fill={ink}/>
            <rect x="22" y="9" width="22" height="4" fill="#F5E29A" stroke={ink} strokeWidth=".9"/>
            <line x1="26" y1="9" x2="26" y2="13" stroke={ink} strokeWidth=".7"/>
            <line x1="32" y1="9" x2="32" y2="13" stroke={ink} strokeWidth=".7"/>
            <line x1="38" y1="9" x2="38" y2="13" stroke={ink} strokeWidth=".7"/>
          </g>
        </g>

        {/* циркуль — слева внизу */}
        <g className="kh-fly-7" style={{ transformOrigin: "120px 60px" }}>
          <g transform="translate(106 38) rotate(-8)">
            <circle cx="14" cy="0" r="3" fill="#fff" stroke={ink} strokeWidth="1.1"/>
            <line x1="14" y1="2" x2="2" y2="28" stroke={ink} strokeWidth="1.4"/>
            <line x1="14" y1="2" x2="26" y2="28" stroke={ink} strokeWidth="1.4"/>
            <line x1="2" y1="28" x2="0" y2="32" stroke={ink} strokeWidth="1.4"/>
            <line x1="26" y1="28" x2="28" y2="32" stroke={ink} strokeWidth="1.4"/>
          </g>
        </g>

        {/* мини-стикеры/калькулятор */}
        <g className="kh-fly-8" style={{ transformOrigin: "430px 110px" }}>
          <g transform="translate(412 92) rotate(-12)">
            <rect x="0" y="0" width="28" height="34" rx="2" fill="#F2EAD8" stroke={ink} strokeWidth="1"/>
            <rect x="3" y="3" width="22" height="6" fill="#fff" stroke={ink} strokeWidth=".7"/>
            {[0,1,2].map(r => [0,1,2].map(c => (
              <rect key={`${r}-${c}`} x={3+c*8} y={13+r*7} width="6" height="5" fill="#fff" stroke={ink} strokeWidth=".5"/>
            )))}
          </g>
        </g>
      </svg>

      <style>{`
        @keyframes kh-orbit-1 { 0%{transform:translate(0,0) rotate(-18deg)} 50%{transform:translate(8px,-10px) rotate(-12deg)} 100%{transform:translate(0,0) rotate(-18deg)} }
        @keyframes kh-orbit-2 { 0%{transform:translate(0,0) rotate(14deg)} 50%{transform:translate(-10px,8px) rotate(20deg)} 100%{transform:translate(0,0) rotate(14deg)} }
        @keyframes kh-orbit-3 { 0%{transform:translate(0,0) rotate(8deg)} 50%{transform:translate(-6px,-12px) rotate(0deg)} 100%{transform:translate(0,0) rotate(8deg)} }
        @keyframes kh-orbit-4 { 0%{transform:translate(0,0) rotate(-32deg)} 50%{transform:translate(-12px,-6px) rotate(-26deg)} 100%{transform:translate(0,0) rotate(-32deg)} }
        @keyframes kh-orbit-5 { 0%{transform:translate(0,0) rotate(10deg)} 50%{transform:translate(8px,-8px) rotate(4deg)} 100%{transform:translate(0,0) rotate(10deg)} }
        @keyframes kh-orbit-6 { 0%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(-8px,-10px) rotate(-6deg)} 100%{transform:translate(0,0) rotate(0deg)} }
        @keyframes kh-orbit-7 { 0%{transform:translate(0,0) rotate(-8deg)} 50%{transform:translate(10px,8px) rotate(-2deg)} 100%{transform:translate(0,0) rotate(-8deg)} }
        @keyframes kh-orbit-8 { 0%{transform:translate(0,0) rotate(-12deg)} 50%{transform:translate(-6px,10px) rotate(-18deg)} 100%{transform:translate(0,0) rotate(-12deg)} }
        .kh-fly-1{animation:kh-orbit-1 7s ease-in-out infinite}
        .kh-fly-2{animation:kh-orbit-2 8.5s ease-in-out infinite}
        .kh-fly-3{animation:kh-orbit-3 6s ease-in-out infinite .3s}
        .kh-fly-4{animation:kh-orbit-4 9s ease-in-out infinite .6s}
        .kh-fly-5{animation:kh-orbit-5 7.5s ease-in-out infinite .2s}
        .kh-fly-6{animation:kh-orbit-6 8s ease-in-out infinite .9s}
        .kh-fly-7{animation:kh-orbit-7 7.2s ease-in-out infinite .5s}
        .kh-fly-8{animation:kh-orbit-8 9.5s ease-in-out infinite .1s}
        @media (prefers-reduced-motion: reduce){
          .kh-fly-1,.kh-fly-2,.kh-fly-3,.kh-fly-4,.kh-fly-5,.kh-fly-6,.kh-fly-7,.kh-fly-8{animation:none}
        }
      `}</style>
    </div>
  );
}

function EmptyState({ onUpload, onAddRow, catalogReady }) {
  const caps = useCaps();
  return (
    <div className="col center kh-empty" style={{ padding: "40px 32px 44px", alignItems: "center", textAlign: "center" }}>
      <HouseSketch />
      <div className="serif" style={{ fontSize: 28, lineHeight: 1.1, marginTop: 20, marginBottom: 10, letterSpacing:"-0.01em" }}>
        Начните <span className="serif-it" style={{ fontStyle: "italic" }}>с чистого листа</span>
      </div>
      <p style={{ maxWidth: 380, fontSize: 13.5, color: "var(--ink-2)", marginBottom: 20 }}>
        {caps.edit
          ? "Загрузите коммерческое предложение — распознаем позиции, сопоставим с каталогом и рассчитаем смету. Или добавьте материалы из правой панели."
          : "Смета пуста. У вашей роли доступ только для просмотра."}
      </p>
      {caps.edit && (
      <div className="row center gap-3" style={{ marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={onUpload} disabled={!catalogReady}>
          <Icon name="upload" size={13} /> Загрузить КП
        </button>
        <button className="btn" onClick={onAddRow}>
          <Icon name="plus" size={13} /> Добавить строку
        </button>
      </div>
      )}
      <div className="row center gap-2 mono tiny" style={{ color: "var(--ink-4)", letterSpacing: ".08em" }}>
        {["XLSX","PDF","DOCX","CSV"].map(f => (
          <span key={f} style={{ padding: "3px 7px", border: "1px solid var(--rule)", borderRadius: 4 }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

function PositionsHeader({ est, onAddRow }) {
  const caps = useCaps();
  const rowCount = est.state.estimate.length;
  const grand = est.state.totals.grand;
  return (
    <div className="row between kh-positions" style={{ padding: "14px 32px 12px", flexWrap:"wrap", gap:12, alignItems: "flex-end" }}>
      <div className="col gap-2">
        <div className="row center gap-3">
          <span className="serif" style={{ fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Позиции <span className="serif-it" style={{ fontStyle:"italic" }}>сметы</span>
          </span>
          <span className="mono tiny" style={{ color:"var(--ink-4)", padding:"2px 8px", border:"1px solid var(--rule)", borderRadius:99 }}>R3.0</span>
        </div>
        <div className="mono tiny muted" style={{ whiteSpace: "nowrap" }}>
          <b style={{ color:"var(--ink)" }}>{rowCount}</b> строк
          <span style={{ margin: "0 8px", color:"var(--ink-4)" }}>·</span>
          итого <b className="serif" style={{ color:"var(--ink)", fontSize:15 }}>{grand > 0 ? fmtMoney(grand) : "— ₽"}</b>
        </div>
      </div>
      <div className="row gap-2 center kh-positions__actions">
        {caps.edit && (
          <button
            className="btn btn-sm"
            onClick={onAddRow}
            title="Добавить новую строку"
          >
            <Icon name="plus" size={13} /> Добавить строку
          </button>
        )}
        {caps.edit && (
          <button
            className="btn btn-sm"
            onClick={est.actions.fetchPricesForNotFound}
            disabled={!est.state.anyNotFound || est.state.pricesBusy}
          >
            <Icon name="refresh" size={13} /> {est.state.pricesBusy ? "Запрос…" : "Обновить цены"}
          </button>
        )}
        {caps.edit && (
          <button
            className="btn btn-sm"
            onClick={() => {
              if (rowCount === 0) return;
              if (confirm(`Очистить всю смету (${rowCount} строк)? Действие отменить нельзя.`)) {
                est.actions.resetEstimate();
              }
            }}
            disabled={rowCount === 0}
            title="Очистить всю смету"
            style={{ color: rowCount === 0 ? undefined : "var(--rust)" }}
          >
            <Icon name="x" size={13} /> Очистить всю смету
          </button>
        )}
        {caps.edit && caps.cost && (
          <button
            className="btn btn-sm"
            onClick={async () => {
              try {
                const url = await est.actions.createClientLink();
                try { await navigator.clipboard.writeText(url); } catch (_) {}
                window.prompt("Ссылка для клиента (скопирована в буфер):", url);
              } catch (err) {
                alert("Не удалось создать ссылку: " + (err.message || err));
              }
            }}
            disabled={rowCount === 0}
            title="Создать ссылку для клиента: он сможет менять количество и удалять строки, но не цены"
          >
            <Icon name="users" size={13} /> Для клиента
          </button>
        )}
        <button
          className="btn btn-sm"
          onClick={est.actions.exportDoc}
          disabled={rowCount === 0}
        >
          <Icon name="export" size={13} /> Экспорт
        </button>
      </div>
    </div>
  );
}

function EstCategoryFilter({ rows, value, onChange }) {
  if (!rows.length) return null;
  const visible = rows.filter(r => !isHiddenCategory(r.name));
  const counts = {
    all: visible.length,
    work: visible.filter(r => (r.category || 'material') === 'work').length,
    material: visible.filter(r => (r.category || 'material') === 'material').length,
  };
  const opts = [
    { id: 'all', label: 'Все' },
    { id: 'work', label: 'Работы' },
    { id: 'material', label: 'Материалы' },
  ];
  return (
    <div className="row gap-2 center" style={{ padding: "0 32px 12px", flexWrap: "wrap" }}>
      {opts.map(o => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="mono tiny"
            style={{
              cursor: "pointer", padding: "5px 12px", borderRadius: 99,
              border: "1px solid " + (active ? "var(--ink)" : "var(--rule)"),
              background: active ? "var(--ink)" : "var(--paper-card)",
              color: active ? "var(--paper)" : "var(--ink-2)",
              fontWeight: active ? 600 : 400,
            }}
          >{o.label} · {counts[o.id]}</button>
        );
      })}
    </div>
  );
}

function EstimateSearch({ rows }) {
  const [query, setQuery] = React.useState("");
  const matches = React.useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if ((r.name || "").toLowerCase().includes(q)) {
        out.push({ row: r, idx: i });
        if (out.length >= 20) break;
      }
    }
    return out;
  }, [query, rows]);

  if (rows.length === 0) return null;

  const jumpTo = (id) => {
    const el = document.getElementById(`est-row-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("kh-row-highlight");
    void el.offsetWidth;
    el.classList.add("kh-row-highlight");
    setQuery("");
  };

  return (
    <div className="kh-est-search" style={{ position: "relative", padding: "0 32px 12px" }}>
      <div className="row center gap-3" style={{
        padding: "8px 14px",
        border: "1px solid var(--rule)", borderRadius: 99,
        background: "var(--paper-card)",
      }}>
        <Icon name="search" size={14} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={`Найти по ${rows.length} ${rows.length === 1 ? "позиции" : "позициям"} сметы…`}
          style={{ flex: 1, border: 0, background: "transparent", outline: "none",
                   color: "var(--ink)", fontSize: 13, fontFamily: "var(--sans)" }}
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Очистить"
                  style={{ border: 0, background: "transparent", color: "var(--ink-3)",
                           cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}
                  title="Очистить">
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      {query.length >= 2 && (
        <div style={{
          position: "absolute", top: "100%", left: 32, right: 32,
          background: "var(--paper-card)", border: "1px solid var(--rule)",
          borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
          maxHeight: 360, overflowY: "auto", zIndex: 25,
          marginTop: 4,
        }}>
          {matches.length === 0 && (
            <div className="muted tiny" style={{ padding: 14 }}>Ничего не найдено</div>
          )}
          {matches.map(({ row, idx }) => (
            <button
              key={row.id}
              onClick={() => jumpTo(row.id)}
              className="row center"
              style={{
                width: "100%", padding: "10px 14px",
                borderBottom: "1px solid var(--rule)",
                background: "transparent", textAlign: "left", cursor: "pointer",
                gap: 12, color: "var(--ink)",
              }}
            >
              <span className="mono tiny" style={{ width: 44, color: "var(--ink-4)" }}>
                {String(idx + 1).padStart(3, "0")}
              </span>
              <span style={{ flex: 1, fontSize: 13,
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name}
              </span>
              <span className="mono tiny muted" style={{ width: 90, textAlign: "right" }}>
                {row.qty} {row.unit || ""}
              </span>
              <span className="mono tiny" style={{ width: 90, textAlign: "right",
                                                    color: row.notFound ? "var(--rust)" : "var(--ink-3)" }}>
                {row.notFound ? "—" : formatMoney(row.unitPrice * row.qty) + " ₽"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnsHeader() {
  const caps = useCaps();
  return (
    <div className="row kh-cols" style={{ padding: "10px 32px", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", color: "var(--ink-4)", background: "var(--paper-2)" }}>
      <div className="mono tiny" style={{ width: 56, letterSpacing: ".08em" }}>#</div>
      <div className="mono tiny" style={{ width: 38, marginRight: 8, letterSpacing: ".08em" }}>КАТ.</div>
      <div className="mono tiny" style={{ flex: 1, letterSpacing: ".08em" }}>НАИМЕНОВАНИЕ</div>
      <div className="mono tiny" style={{ width: 64, textAlign: "center", letterSpacing: ".08em" }}>ЕД. ИЗМ.</div>
      <div className="mono tiny" style={{ width: 80, textAlign: "right", letterSpacing: ".08em" }}>КОЛ-ВО</div>
      {caps.cost && <div className="mono tiny" style={{ width: 100, textAlign: "right", letterSpacing: ".08em" }}>СЕБЕСТ., ₽</div>}
      {caps.cost && <div className="mono tiny" style={{ width: 60, textAlign: "right", letterSpacing: ".08em" }}>НАЦ. %</div>}
      <div className="mono tiny" style={{ width: 130, textAlign: "right", letterSpacing: ".08em" }}>КЛИЕНТУ, ₽</div>
      <div className="mono tiny" style={{ width: 110, textAlign: "right", letterSpacing: ".08em" }}>ИСТОЧНИК</div>
    </div>
  );
}

function MarkupCard({ est }) {
  const caps = useCaps();
  if (!caps.cost) return null;
  const markup = est.state.markup || { work: 0, material: 0 };
  const field = (cat, label) => (
    <div className="row between center" style={{ gap: 10 }}>
      <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{label}</span>
      <div className="row center" style={{ gap: 4 }}>
        <input
          type="number" min="0" step="1"
          value={markup[cat] === 0 ? "" : markup[cat]}
          placeholder="0"
          onChange={(e) => est.actions.setMarkup(cat, e.target.value)}
          className="mono"
          style={{
            width: 64, textAlign: "right", padding: "4px 6px", fontSize: 13,
            border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)",
          }}
        />
        <span className="mono tiny muted">%</span>
      </div>
    </div>
  );
  return (
    <div className="frame" style={{ padding: "16px 18px", border: "1px solid var(--rule)", background: "var(--paper-card)", position: "relative" }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Наценка к себестоимости</div>
      <div className="col" style={{ gap: 10 }}>
        {field("work", "Работы")}
        {field("material", "Материалы")}
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Клиент видит цены с наценкой. Себестоимость остаётся только у вас.
      </div>
    </div>
  );
}

function BudgetCard({ est }) {
  const caps = useCaps();
  const { cost, margin, subtotal, vat, grand } = est.state.totals;
  const fmtCell = (v) => v > 0 ? fmtMoney(v) : "— ₽";
  const items = [
    ...(caps.cost ? [
      { label: "Себестоимость", value: cost },
      { label: "Наценка (маржа)", value: margin },
    ] : []),
    { label: "Сумма без НДС", value: subtotal },
    { label: "НДС 22%", value: vat },
  ];
  return (
    <div className="frame" style={{ padding:"18px 18px 16px", border:"1px solid var(--rule)", background:"var(--paper-card)", position:"relative" }}>
      <div className="frame-bl" /><div className="frame-br" />
      <div className="eyebrow" style={{ marginBottom:14 }}>Бюджет</div>
      <div className="col" style={{ gap:10 }}>
        {items.map((it,i) => (
          <div key={i} className="row between center" style={{ borderBottom: "1px dashed var(--rule)", paddingBottom:8 }}>
            <span style={{ fontSize:13, color:"var(--ink-2)" }}>{it.label}</span>
            <span className="mono" style={{ fontSize: 13, color: it.value > 0 ? "var(--ink)" : "var(--ink-4)" }}>{fmtCell(it.value)}</span>
          </div>
        ))}
      </div>
      <div className="row between center" style={{ marginTop:16 }}>
        <span className="serif-it" style={{ fontSize: 22, fontStyle:"italic" }}>Итого</span>
        <span className="serif" style={{ fontSize: 28, letterSpacing: "-0.02em", color: grand > 0 ? "var(--ink)" : "var(--ink-4)" }}>
          {grand > 0 ? fmt(Math.round(grand)) : "—"} <span className="mono tiny muted">₽</span>
        </span>
      </div>
    </div>
  );
}

function PopularMaterials({ onAdd }) {
  return (
    <div>
      <div className="row between center" style={{ padding: "0 0 12px" }}>
        <div className="eyebrow">Популярные материалы</div>
        <a className="mono tiny" style={{ color: "var(--ink-3)", letterSpacing: ".06em" }}>открыть каталог →</a>
      </div>
      <div className="col gap-3">
        {POPULAR_MATERIALS.slice(0,4).map((m,i) => (
          <div key={i} className="row center gap-3" style={{
            padding: "8px", border: "1px solid var(--rule)", borderRadius: 10,
            background: "var(--paper-card)"
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 6, background: m.color,
              backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.07) 0 2px, transparent 2px 5px)",
              flexShrink: 0
            }} />
            <div className="col" style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{m.name}</div>
              <div className="mono tiny muted" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {fmt(m.price)} ₽ / {m.unit} <span style={{ color:"var(--ink-4)" }}>·</span> {m.note}
              </div>
            </div>
            <button
              className="btn btn-icon"
              style={{ width: 28, height: 28 }}
              onClick={() => onAdd && onAdd({ name: m.name + (m.note ? `, ${m.note}` : ''), unit: m.unit, unitPrice: m.price, qty: 1, notFound: false, source: 'manual' })}
              title="Добавить в смету"
            >
              <Icon name="plus" size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryFeed() {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 12 }}>История изменений</div>
      <div className="col gap-3">
        {HISTORY.slice(0,3).map((h, i) => (
          <div key={i} className="row gap-3" style={{ position:"relative", paddingLeft: 14 }}>
            <span style={{
              position:"absolute", left:0, top:6,
              width: 6, height: 6, borderRadius: 99,
              background: h.live ? "var(--rust)" : "var(--ink-4)",
              boxShadow: h.live ? "0 0 0 3px rgba(154,68,34,.15)" : "none"
            }} />
            <div className="col" style={{ gap: 2 }}>
              <div style={{ fontSize: 12, lineHeight: 1.4 }}><b>{h.who}</b> {h.what}</div>
              <div className="mono tiny muted">{h.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractorsPanel({ onOpenVendorDb, onOpenContractors }) {
  const caps = useCaps();
  const read = () => { try { return JSON.parse(localStorage.getItem('kh-contractors-v1') || '[]'); } catch (_) { return []; } };
  const [list, setList] = useState(read);
  useEffect(() => {
    const refresh = () => setList(read());
    window.addEventListener('storage', refresh);
    window.addEventListener('kh-storage', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('kh-storage', refresh); };
  }, []);
  if (!caps.sections.includes('contractors')) return null;
  const vendors = (list || []).filter(c => c && c.type !== 'Производитель');
  return (
    <div>
      <div className="row center between" style={{ marginBottom: 10 }}>
        <div className="eyebrow">Подрядчики</div>
        <button className="mono tiny" onClick={onOpenContractors} title="Открыть раздел подрядчиков"
          style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", letterSpacing: ".06em" }}>
          все →
        </button>
      </div>
      {vendors.length === 0 ? (
        <div className="tiny muted">Пока нет подрядчиков. Добавьте в разделе «Подрядчики».</div>
      ) : (
        <div className="col gap-2">
          {vendors.map(c => (
            <button
              key={c.id}
              onClick={() => ((c.slug || c.name) ? onOpenVendorDb(c) : onOpenContractors())}
              className="row center between"
              title={(c.slug || c.name) ? "Открыть прайс этого подрядчика" : "Прайс ещё не запрашивался"}
              style={{
                padding: "9px 12px", border: "1px solid var(--rule)", borderRadius: 10,
                background: "var(--paper-card)", cursor: "pointer", textAlign: "left", gap: 8,
              }}
            >
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "Без названия"}</span>
                {c.type && <span className="mono tiny muted">{c.type}</span>}
              </div>
              <Icon name="chev" size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RightPanel({ est }) {
  return (
    <aside className="col" style={{
      width: 320, padding: "20px 22px 24px", gap: 24,
      borderLeft: "1px solid var(--rule)", background: "var(--paper-2)",
      flexShrink: 0
    }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Бюджет объекта</div>
        <BudgetCard est={est} />
      </div>
      <MarkupCard est={est} />
      <PopularMaterials onAdd={est.actions.addRow} />
      <HistoryFeed />
    </aside>
  );
}

function ErrorToast({ status }) {
  if (!status || status.kind !== "error" || !status.text) return null;
  return (
    <div style={{
      position: "fixed", bottom: 36, left: "50%", transform: "translateX(-50%)",
      padding: "10px 18px", borderRadius: 99,
      background: "rgba(194,88,66,.10)", border: "1px solid var(--rust)", color: "var(--rust)",
      fontSize: 12, fontFamily: "var(--mono)", letterSpacing: ".04em",
      zIndex: 50, maxWidth: "80%",
      boxShadow: "0 4px 12px rgba(0,0,0,.08)",
    }}>
      {status.text}
    </div>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Наверх"
      aria-label="Прокрутить наверх"
      style={{
        position: "fixed", right: 28, bottom: 60,
        width: 44, height: 44, borderRadius: "50%",
        background: "var(--coffee)", color: "#FBF5E7",
        border: "1px solid rgba(0,0,0,.15)", cursor: "pointer",
        display: "grid", placeItems: "center",
        boxShadow: "0 8px 22px -8px rgba(92,58,30,.55)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity .25s ease, transform .25s ease",
        zIndex: 40,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    </button>
  );
}

function StatusBar() {
  return (
    <div className="row between mono tiny kh-statusbar" style={{
      padding: "8px 28px", borderTop: "1px solid var(--rule)",
      color: "var(--ink-3)", letterSpacing: ".08em", background: "var(--paper)"
    }}>
      <div className="row gap-3">
        <span>KUB HOUSE</span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span>СМЕТА</span>
        <span>ОБЪЕКТ <b style={{ color: "var(--ink)" }}>EST-0024</b></span>
        <span>РЕВ <b style={{ color: "var(--ink)" }}>R3</b></span>
        <span>284 М² · ДЕРЕВ. КАРКАС</span>
      </div>
      <div className="row gap-3">
        <span>СОЕДИНЕНИЕ <span style={{ color: "var(--moss)" }}>● АКТИВНО</span></span>
        <span>БИЛД 4.2.1</span>
      </div>
    </div>
  );
}

function Workspace({ embedded = false, onTheme, theme, onNewEstimate, onRename }) {
  const [navActive, setNavActive] = useState("estimates");
  const [khModalTab, setKhModalTab] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [estCatFilter, setEstCatFilter] = useState("all"); // all | work | material
  const [dbAutoAdd, setDbAutoAdd] = useState(false); // открыть Базу сразу с формой добавления
  const [dbVendorFilter, setDbVendorFilter] = useState(null); // открыть Базу с фильтром по подрядчику
  const openVendorDb = (c) => {
    const f = c && c.name ? ("vname:" + c.name) : (c && c.slug ? ("vendor:" + c.slug) : "all");
    setNavActive("database"); setKhModalTab("database"); setDbAutoAdd(false); setDbVendorFilter(f);
  };
  const openContractors = () => { setNavActive("contractors"); setKhModalTab("contractors"); setDbAutoAdd(false); };
  const est = useEstimate();
  const [meta, updateMetaRaw] = useEditableMeta();
  const updateMeta = React.useCallback((key, value) => {
    updateMetaRaw(key, value);
    if (key === "title" && onRename) onRename(value);
  }, [updateMetaRaw, onRename]);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!est.state.pricesBusy) return;
    // Защита от случайного ухода со страницы во время длинного фетча:
    // браузер покажет нативный confirm. Закрытие/перезагрузка/F5/⌘W —
    // всё через него.
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [est.state.pricesBusy]);

  const onUploadClick = () => fileInputRef.current && fileInputRef.current.click();
  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (f) est.actions.handleFile(f);
    e.target.value = '';
  };
  const addRowAndScroll = () => {
    est.actions.addBlankRow();
    requestAnimationFrame(() => {
      const header = document.querySelector('.kh-positions');
      if (header && header.scrollIntoView) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  return (
    <div className="col" style={{
      background: "var(--paper)",
      minHeight: "100vh",
      width: "100%",
    }}>
      <input
        ref={fileInputRef} type="file"
        accept=".xlsx,.xls,.pdf,.docx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,text/csv"
        style={{ display: "none" }}
        onChange={onFileChange}
      />
      <TopBar
        onTheme={onTheme}
        theme={theme}
        savedAt={est.state.savedAt}
        onMenu={() => setNavOpen(true)}
        onNew={() => { if (onNewEstimate) onNewEstimate(); }}
      />
      <MobileNav
        active={navActive}
        onPick={(id) => { setNavActive(id); setKhModalTab(id); setDbAutoAdd(false); }}
      />
      <div className="row" style={{ flex: 1, minHeight: 0 }}>
        <Sidebar
          active={navActive}
          onPick={(id) => { setNavActive(id); setKhModalTab(id); setDbAutoAdd(false); }}
          meta={meta}
          updateMeta={updateMeta}
          mobileOpen={navOpen}
          onClose={() => setNavOpen(false)}
          onOpenVendorDb={openVendorDb}
          onOpenContractors={openContractors}
        />
        <main className="col" style={{ flex: 1, minWidth: 0 }}>
          <HeroBlock est={est} meta={meta} updateMeta={updateMeta} onOpenDatabase={() => { setNavActive("database"); setKhModalTab("database"); setDbAutoAdd(true); }} />
          <div style={{ position: "relative" }}>
            <Toolbar query={est.state.query} onQuery={est.actions.setQuery} />
            <SearchResults
              query={est.state.query}
              results={est.state.searchResults}
              catalogReady={est.state.catalogReady}
              onAdd={(row) => { est.actions.addRow(row); est.actions.setQuery(""); }}
              onClose={() => est.actions.setQuery("")}
            />
          </div>
          <PositionsHeader est={est} onAddRow={addRowAndScroll} />
          <EstimateSearch rows={est.state.estimate} />
          <EstCategoryFilter rows={est.state.estimate} value={estCatFilter} onChange={setEstCatFilter} />
          <ColumnsHeader />
          {est.state.estimate.length === 0 ? (
            <EmptyState
              onUpload={onUploadClick}
              onAddRow={addRowAndScroll}
              catalogReady={est.state.catalogReady}
            />
          ) : (
            <EstimateTable
              rows={est.state.estimate}
              catFilter={estCatFilter}
              markup={est.state.markup}
              onUpdateQty={est.actions.updateQty}
              onUpdateRow={est.actions.updateRow}
              onRemove={est.actions.removeRow}
              onTogglePicker={est.actions.togglePicker}
              onApplyCandidate={est.actions.applyCandidate}
              onApplyManual={est.actions.applyManualPrice}
            />
          )}
        </main>
        <RightPanel est={est} />
      </div>
      <StatusBar />
      <ScrollToTop />
      <ErrorToast status={est.state.status} />
      <KHModalRoot activeId={khModalTab} autoAdd={dbAutoAdd} vendorFilter={dbVendorFilter} onClose={() => { setKhModalTab(null); setDbAutoAdd(false); setDbVendorFilter(null); }} est={est} />
      <PriceFetchOverlay
        visible={est.state.pricesBusy || est.state.busyTickets > 0}
        progress={est.state.pricesProgress}
      />
    </div>
  );
}

// Inline-лоадер «Подбираем лучшие цены». Раньше Loader.jsx висел в отдельном
// React root и управлялся через window-функции — это иногда расходилось с
// pricesBusy и лоадер пропадал на полпути. Теперь видимость напрямую завязана
// на state хука через проп, и сам узел рендерится через портал прямо в
// document.body — никакие CSS-родители (transform/filter/backdrop-filter) не
// могут превратить наш fixed-оверлей в локально-позиционированный.
function PriceFetchOverlay({ visible, progress }) {
  React.useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  // Узел не размонтируем — управляем видимостью через opacity/pointer-events.
  // Так гарантированно нет «дырки» между renders, когда узел уже снят из DOM,
  // а pricesBusy ещё true.

  const total = (progress && progress.total) || 0;
  const done = (progress && progress.done) || 0;
  const filled = (progress && progress.filled) || 0;
  const left = Math.max(total - done, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const C = { paper: '#F4ECE0', ink: '#1F1B16', ink3: '#8A7F73', rust: '#C25842' };

  const overlay = (
    <div
      onClick={(e) => { if (visible) e.stopPropagation(); }}
      onKeyDown={(e) => { if (visible) e.stopPropagation(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647,
        background: 'rgba(20,16,12,.18)',
        backdropFilter: visible ? 'blur(6px)' : 'none',
        WebkitBackdropFilter: visible ? 'blur(6px)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'wait',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity .2s ease',
      }}
    >
      <div style={{
        background: C.paper,
        border: '1px solid rgba(80,60,30,.18)',
        borderRadius: 16,
        padding: '40px 48px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 30px 80px -20px rgba(20,16,12,.45), 0 4px 16px -4px rgba(20,16,12,.18)',
        minWidth: 380,
      }}>
        <div style={{ position: 'relative', width: 280, height: 110 }}>
          <div style={{
            position: 'absolute', left: 0, top: 30, width: 70, height: 60, borderRadius: 10,
            background: C.rust, border: `1.5px solid ${C.ink}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', border: `1.5px solid ${C.ink}` }}/>
          </div>
          <div style={{
            position: 'absolute', left: 70, top: 50, height: 22, width: 200,
            background: '#F5E29A', border: `1.5px solid ${C.ink}`, overflow: 'hidden',
          }}>
            <div className="kh-tape" style={{
              display: 'flex', gap: 22, padding: '0 6px', whiteSpace: 'nowrap',
              height: '100%', alignItems: 'center',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.ink,
            }}>
              <span>28 600 ₽</span><span>14 200 ₽</span><span>9 850 ₽</span>
              <span>32 100 ₽</span><span>6 400 ₽</span><span>18 700 ₽</span>
              <span>2 150 ₽</span><span>41 900 ₽</span><span>11 300 ₽</span>
              <span>28 600 ₽</span><span>14 200 ₽</span><span>9 850 ₽</span>
            </div>
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `repeating-linear-gradient(90deg, ${C.ink} 0 1px, transparent 1px 16px)`,
              opacity: .35,
            }}/>
          </div>
        </div>
        <div style={{
          fontFamily: '"Cormorant Garamond", serif', fontStyle: 'italic',
          fontSize: 26, color: C.ink, marginTop: 22, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>Подбираем лучшие цены</div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.18em',
          textTransform: 'uppercase', color: C.ink3, marginTop: 10,
        }}>замеряем рынок</div>
        {total > 0 && (
          <>
            <div style={{
              width: '100%', height: 2, background: 'rgba(80,60,30,.15)',
              borderRadius: 99, overflow: 'hidden', marginTop: 22,
            }}>
              <div style={{
                width: `${pct}%`, height: '100%', background: C.rust,
                borderRadius: 99, transition: 'width .35s ease-out',
              }} />
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              color: C.ink3, marginTop: 10,
              display: 'flex', justifyContent: 'space-between', width: '100%',
            }}>
              <span>проверено <b style={{ color: C.ink }}>{done}</b> из {total}</span>
              <span>осталось <b style={{ color: C.ink }}>{left}</b></span>
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              color: C.ink3, marginTop: 4,
              display: 'flex', justifyContent: 'space-between', width: '100%',
            }}>
              <span>найдено <b style={{ color: C.ink }}>{filled}</b></span>
              <span>без цены <b style={{ color: C.ink }}>{Math.max(done - filled, 0)}</b></span>
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes kh-tape { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-160px) } }
        .kh-tape { animation: kh-tape 2.6s ease-in-out infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce){ .kh-tape{ animation: none } }
      `}</style>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}

Object.assign(window, { Workspace, EstimatesTabs, CompareEstimatesModal });
