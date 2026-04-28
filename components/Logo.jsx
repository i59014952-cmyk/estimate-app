// Logo.jsx — мини-знак Kub-House (квадратик с двумя строками)
function KubLogo({ size = 36, light = false }) {
  const stroke = light ? "currentColor" : "var(--ink)";
  return (
    <div className="row center gap-2" style={{ lineHeight: 1 }}>
      <div style={{
        width: size, height: size, border: `1px solid ${stroke}`,
        display: "grid", placeItems: "center",
        fontFamily: "var(--mono)", fontSize: size * 0.22,
        letterSpacing: ".06em", textAlign: "center", color: stroke,
        flexShrink: 0
      }}>
        <div style={{ display:"flex", flexDirection:"column", lineHeight:1.05 }}>
          <span style={{fontWeight:600}}>KUB</span>
          <span style={{borderTop:`1px solid ${stroke}`, paddingTop:1, marginTop:1, fontWeight:600}}>HOUSE</span>
        </div>
      </div>
      <div className="col" style={{ gap: 2 }}>
        <div className="serif" style={{ fontSize: size * 0.62, lineHeight: .95, color: stroke }}>
          Kub<span style={{opacity:.7}}>·</span>House
        </div>
        <div className="mono" style={{ fontSize: size * 0.24, letterSpacing: ".18em", color: "var(--ink-3)" }}>
          WOOD ARCHITECTURE
        </div>
      </div>
    </div>
  );
}

// Иконки (минималистичные line-icons)
function Icon({ name, size=16 }) {
  const s = size; const sw = 1.4;
  const props = { width:s, height:s, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:sw, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "doc": return <svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>;
    case "house": return <svg {...props}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>;
    case "cube": return <svg {...props}><path d="M12 3l9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v9"/></svg>;
    case "users": return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "cal": return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case "list": return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case "ruler": return <svg {...props}><path d="M21 3l-6 6m6-6l-3 3m-3 3l-3 3m-3 3l-3 3M3 21l18-18"/><path d="M3 21h6v-6"/></svg>;
    case "tpl": return <svg {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>;
    case "refresh": return <svg {...props}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>;
    case "export": return <svg {...props}><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>;
    case "upload": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>;
    case "plus": return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case "minus": return <svg {...props}><path d="M5 12h14"/></svg>;
    case "chev": return <svg {...props}><path d="M9 18l6-6-6-6"/></svg>;
    case "chevd": return <svg {...props}><path d="M6 9l6 6 6-6"/></svg>;
    case "moon": return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case "sun": return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
    case "arr": return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "check": return <svg {...props}><path d="M20 6L9 17l-5-5"/></svg>;
    case "tree": return <svg {...props}><path d="M3 6h4M3 12h6M3 18h8"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>;
    case "x": return <svg {...props}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case "play": return <svg {...props}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case "pause": return <svg {...props}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "wrench": return <svg {...props}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z"/></svg>;
    case "layers": return <svg {...props}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
    case "bell": return <svg {...props}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    case "spark": return <svg {...props}><path d="M12 2l2.5 7L22 11l-7.5 2L12 20l-2.5-7L2 11l7.5-2z"/></svg>;
    default: return null;
  }
}

Object.assign(window, { KubLogo, Icon });
