// Workspace.jsx — рабочий стол сметчика, 1:1 с PDF (пустая смета «Сосны»)

const { useState, useMemo, useEffect } = React;

function StatCell({ k, v, u, d, dir, live }) {
  return (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      <div className="eyebrow">{live && <span className="dot" />}{k}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
        <span className="serif" style={{ fontSize: 38, lineHeight: .9, letterSpacing: "-0.02em", whiteSpace: "nowrap", fontVariantNumeric: "lining-nums tabular-nums", fontFeatureSettings: '"lnum" 1, "tnum" 1' }}>{v}</span>
        <span className="muted tiny" style={{ paddingBottom: 3 }}>{u}</span>
      </div>
      <div className="row center" style={{ gap: 4 }}>
        {dir === "up" && <span style={{ color: "var(--good)", fontSize: 11 }}>↗</span>}
        {dir === "down" && <span style={{ color: "var(--rust)", fontSize: 11 }}>↘</span>}
        <span className="tiny muted">{d}</span>
      </div>
    </div>
  );
}

function TopBar({ onTheme, theme, onMenu }) {
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
        <div className="row center gap-3 mono kh-topbar__crumbs" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", marginLeft: 8 }}>
          <span>Workspace</span>
          <span style={{ opacity: .5 }}>›</span>
          <span>Сметы</span>
          <span style={{ opacity: .5 }}>›</span>
          <span style={{ color: "var(--ink)" }}>Новый расчёт</span>
        </div>
      </div>
      <div className="row center gap-3 kh-topbar__actions">
        <button className="btn btn-sm kh-topbar__new"><Icon name="plus" size={14} /> Новая смета</button>
        <div className="row center gap-2 mono tiny kh-topbar__autosave" style={{
          padding: "7px 12px", border: "1px solid var(--rule)", borderRadius: 99, color: "var(--ink-3)"
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99, background: "var(--moss)",
            boxShadow: "0 0 0 3px rgba(110,123,79,.2)"
          }} /> Автосохр · 14:32
        </div>
        <button className="btn btn-icon" onClick={onTheme} title="Тема">
          <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
        </button>
        <div style={{
          width: 32, height: 32, borderRadius: 99, background: "var(--coffee)",
          color: "#FBF5E7", display: "grid", placeItems: "center",
          fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".05em"
        }}>АМ</div>
      </div>
    </div>
  );
}

function khReadDynamicCounts() {
  const tryParse = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const objects = tryParse('kh-objects-v1');
  const activeObjects = objects.filter(o => (o.status || 'active') === 'active').length;
  const contractors = tryParse('kh-contractors-v1').length;
  const database = Number(window.KH_DB_COUNT || 0);
  return { objects: activeObjects, contractors, database };
}

function Sidebar({ active, onPick, meta, updateMeta, mobileOpen, onClose }) {
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
      {NAV.map(it => <Item key={it.id} it={it} />)}
      <div className="eyebrow" style={{ padding: "16px 12px 8px" }}>Справочники</div>
      {NAV2.map(it => <Item key={it.id} it={it} />)}

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

function HeroBlock({ est, meta, updateMeta }) {
  const stats = React.useMemo(() => {
    const localCount = est.state.catalog.length;
    const ddcCount = est.state.ddcCatalog.length;
    const vendorCount = (est.state.vendorCatalog || []).length;
    const total = localCount + ddcCount + vendorCount;
    return [
      { k: "Каталог", v: fmt(total), u: "позиций", d: est.state.catalogReady ? "Загружено" : "Загрузка…", live: !est.state.catalogReady, dir: "up" },
      { k: "Своя база", v: fmt(localCount), u: "материалов", d: "JSON" },
      { k: "DDC цены", v: fmt(ddcCount), u: "записей", d: "Синх. активна", live: true },
    ];
  }, [est.state.catalog.length, est.state.ddcCatalog.length, (est.state.vendorCatalog || []).length, est.state.catalogReady]);

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

      <div className="row kh-hero__stats" style={{ marginTop: 28, gap: 0 }}>
        {stats.map((s, i) => (
          <div key={i} className="row kh-hero__stat" style={{ flex: 1, paddingRight: 24, borderRight: i < stats.length - 1 ? "1px dashed var(--rule)" : 0, paddingLeft: i ? 24 : 0 }}>
            <StatCell {...s} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Toolbar({ tab, onTab, query, onQuery }) {
  const tabs = [
    { id: "all", label: "Все", icon: "layers" },
    { id: "works", label: "Работы" },
    { id: "materials", label: "Материалы" },
    { id: "tree", label: "Дерево" },
  ];
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
      <div className="row center kh-toolbar-bar__tabs" style={{ gap: 6 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => onTab(t.id)} className="btn btn-sm"
            style={{
              background: tab === t.id ? "var(--ink)" : "transparent",
              color: tab === t.id ? "var(--paper)" : "var(--ink-2)",
              borderColor: tab === t.id ? "var(--ink)" : "var(--rule)"
            }}>
            {t.icon && <Icon name={t.icon} size={12} />}
            {t.label}
          </button>
        ))}
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
  return (
    <div className="col center kh-empty" style={{ padding: "40px 32px 44px", alignItems: "center", textAlign: "center" }}>
      <HouseSketch />
      <div className="serif" style={{ fontSize: 28, lineHeight: 1.1, marginTop: 20, marginBottom: 10, letterSpacing:"-0.01em" }}>
        Начните <span className="serif-it" style={{ fontStyle: "italic" }}>с чистого листа</span>
      </div>
      <p style={{ maxWidth: 380, fontSize: 13.5, color: "var(--ink-2)", marginBottom: 20 }}>
        Загрузите коммерческое предложение — распознаем позиции, сопоставим с каталогом KUB·HOUSE и рассчитаем смету. Или добавьте материалы из правой панели.
      </p>
      <div className="row center gap-3" style={{ marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={onUpload} disabled={!catalogReady}>
          <Icon name="upload" size={13} /> Загрузить КП
        </button>
        <button className="btn" onClick={onAddRow}>
          <Icon name="plus" size={13} /> Добавить строку
        </button>
      </div>
      <div className="row center gap-2 mono tiny" style={{ color: "var(--ink-4)", letterSpacing: ".08em" }}>
        {["XLSX","PDF","DOCX","CSV"].map(f => (
          <span key={f} style={{ padding: "3px 7px", border: "1px solid var(--rule)", borderRadius: 4 }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

function PositionsHeader({ est, onAddRow }) {
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
        <button
          className="btn btn-sm"
          onClick={onAddRow}
          title="Добавить новую строку"
        >
          <Icon name="plus" size={13} /> Добавить строку
        </button>
        <button
          className="btn btn-sm"
          onClick={est.actions.fetchPricesForNotFound}
          disabled={!est.state.anyNotFound || est.state.pricesBusy}
        >
          <Icon name="refresh" size={13} /> {est.state.pricesBusy ? "Запрос…" : "Обновить цены"}
        </button>
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
  return (
    <div className="row kh-cols" style={{ padding: "10px 32px", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", color: "var(--ink-4)", background: "var(--paper-2)" }}>
      <div className="mono tiny" style={{ width: 56, letterSpacing: ".08em" }}>#</div>
      <div className="mono tiny" style={{ flex: 1, letterSpacing: ".08em" }}>НАИМЕНОВАНИЕ</div>
      <div className="mono tiny" style={{ width: 64, textAlign: "center", letterSpacing: ".08em" }}>ЕД. ИЗМ.</div>
      <div className="mono tiny" style={{ width: 80, textAlign: "right", letterSpacing: ".08em" }}>КОЛ-ВО</div>
      <div className="mono tiny" style={{ width: 100, textAlign: "right", letterSpacing: ".08em" }}>ЦЕНА, ₽</div>
      <div className="mono tiny" style={{ width: 130, textAlign: "right", letterSpacing: ".08em" }}>ИТОГО, ₽</div>
      <div className="mono tiny" style={{ width: 110, textAlign: "right", letterSpacing: ".08em" }}>ИСТОЧНИК</div>
    </div>
  );
}

function BudgetCard({ est }) {
  const { subtotal, vat, grand } = est.state.totals;
  const fmtCell = (v) => v > 0 ? fmtMoney(v) : "— ₽";
  const items = [
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

function Workspace({ embedded = false, onTheme, theme }) {
  const [tab, setTab] = useState("all");
  const [navActive, setNavActive] = useState("estimates");
  const [khModalTab, setKhModalTab] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const est = useEstimate();
  const [meta, updateMeta] = useEditableMeta();
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (est.state.pricesBusy) {
      if (window.khShowLoader) window.khShowLoader(60000);
    } else {
      if (window.khHideLoader) window.khHideLoader();
    }
  }, [est.state.pricesBusy]);

  React.useEffect(() => {
    if (est.state.pricesBusy && window.khSetProgress) {
      window.khSetProgress(est.state.pricesProgress);
    }
  }, [est.state.pricesProgress, est.state.pricesBusy]);

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
      <TopBar onTheme={onTheme} theme={theme} onMenu={() => setNavOpen(true)} />
      <MobileNav
        active={navActive}
        onPick={(id) => { setNavActive(id); setKhModalTab(id); }}
      />
      <div className="row" style={{ flex: 1, minHeight: 0 }}>
        <Sidebar
          active={navActive}
          onPick={(id) => { setNavActive(id); setKhModalTab(id); }}
          meta={meta}
          updateMeta={updateMeta}
          mobileOpen={navOpen}
          onClose={() => setNavOpen(false)}
        />
        <main className="col" style={{ flex: 1, minWidth: 0 }}>
          <HeroBlock est={est} meta={meta} updateMeta={updateMeta} />
          <div style={{ position: "relative" }}>
            <Toolbar tab={tab} onTab={setTab} query={est.state.query} onQuery={est.actions.setQuery} />
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
      <KHModalRoot activeId={khModalTab} onClose={() => setKhModalTab(null)} est={est} />
    </div>
  );
}

Object.assign(window, { Workspace });
