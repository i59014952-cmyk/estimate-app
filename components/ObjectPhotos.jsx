// ObjectPhotos.jsx — фотогалерея объекта: две секции «Визуализация» и
// «Чертежи». Файлы хранятся на сервере (kh_object_files с полем kind),
// фронт берёт их авторизованным запросом и кладёт в blob-URL для <img>
// (нативные <img src> не умеют добавлять Authorization-заголовок).
//
// Клик по миниатюре открывает встроенный лайтбокс KHLightbox с
// клавиатурными стрелками и Esc.

const KH_OP_API = (typeof window !== 'undefined' && window.PRICES_BACKEND) || 'https://api.sme-ta.ru';

function khOpAuthFetch(url, opts) {
  return (window.KHAuth ? window.KHAuth.ensureToken() : Promise.resolve(''))
    .then(tok => fetch(url, {
      ...opts,
      headers: { ...(opts && opts.headers || {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    }));
}

// === Лайтбокс ============================================================
function KHLightbox({ open, items, index, blobUrls, onPrev, onNext, onClose }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onPrev, onNext, onClose]);
  if (!open || !items || !items.length) return null;
  const cur = items[index] || items[0];
  const src = cur && blobUrls[cur.id];
  const navBtn = (extra) => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: 52, height: 52, borderRadius: 999, border: 0,
    background: 'rgba(20,16,12,.55)', color: '#fff', fontSize: 24,
    cursor: 'pointer', display: 'grid', placeItems: 'center',
    ...extra,
  });
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          position: 'absolute', top: 16, right: 20, padding: '8px 14px',
          background: 'rgba(255,255,255,.1)', color: '#fff', border: 0,
          borderRadius: 8, cursor: 'pointer', fontSize: 14,
        }}>✕ Закрыть</button>
      {items.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} style={navBtn({ left: 20 })} title="←">‹</button>
      )}
      {items.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} style={navBtn({ right: 20 })} title="→">›</button>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{
        maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 10,
        alignItems: 'center',
      }}>
        {src ? (
          <img src={src} alt={cur.filename || ''}
            style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }} />
        ) : (
          <div style={{ padding: 30, color: '#fff', background: 'rgba(0,0,0,.4)', borderRadius: 8 }}>Загрузка…</div>
        )}
        <div style={{ color: '#cdbe9d', fontSize: 13, fontFamily: 'monospace', letterSpacing: '.04em' }}>
          {cur.filename} · {index + 1} из {items.length}
        </div>
      </div>
    </div>
  );
}

// === Секция-галерея =====================================================
function KHPhotoSection({ title, kind, objectId, files, refreshKind, onOpen, uploadingKind, setUploadingKind, blobUrls, removeFile }) {
  const inputRef = React.useRef(null);
  const onPick = () => inputRef.current && inputRef.current.click();
  const onFiles = async (e) => {
    const fs = Array.from(e.target.files || []);
    e.target.value = '';
    if (!fs.length) return;
    setUploadingKind(kind);
    try {
      for (const f of fs) {
        const form = new FormData();
        form.append('upload', f);
        form.append('kind', kind);
        const r = await khOpAuthFetch(`${KH_OP_API}/objects/${encodeURIComponent(objectId)}/files`, {
          method: 'POST', body: form,
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}${t ? ': ' + t.slice(0, 140) : ''}`);
        }
      }
      await refreshKind(kind);
    } catch (err) {
      alert(`Не удалось загрузить: ${err.message || err}`);
    } finally {
      setUploadingKind(null);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="eyebrow" style={{ color: 'var(--rust)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {files.length}</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" disabled={uploadingKind === kind}
          onClick={onPick}>
          {uploadingKind === kind ? '⏳ Загрузка…' : '+ Загрузить фото'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFiles} />
      </div>
      {files.length === 0 ? (
        <div style={{
          padding: '14px 18px', fontSize: 12, color: 'var(--ink-4)',
          border: '1px dashed var(--rule)', borderRadius: 8, background: 'rgba(160,122,74,.04)',
        }}>
          Нет фото — нажми «+ Загрузить фото».
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {files.map((f, i) => {
            const src = blobUrls[f.id];
            return (
              <div key={f.id} style={{
                position: 'relative', width: 132, height: 96,
                borderRadius: 8, overflow: 'hidden',
                border: '1px solid var(--rule)', background: 'var(--paper-2, #efe6d2)',
              }}>
                {src ? (
                  <img src={src} alt={f.filename || ''} loading="lazy"
                    onClick={() => onOpen(kind, i)} title={f.filename}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block',
                    }} />
                ) : (
                  <div title={f.filename} style={{
                    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                    color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.1em',
                  }}>
                    <span className="kh-spinner" />
                    <span>ЗАГРУЗКА</span>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(f.id, f.filename, kind); }}
                  title="Удалить" aria-label="Удалить"
                  style={{
                    position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                    borderRadius: 999, border: 0, background: 'rgba(20,16,12,.55)',
                    color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
                    display: 'grid', placeItems: 'center',
                  }}
                >×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// === Главный компонент: две секции + лайтбокс ============================
function KHObjectPhotos({ objectId }) {
  const [viz, setViz] = React.useState([]);
  const [bps, setBps] = React.useState([]);
  const [blobUrls, setBlobUrls] = React.useState({});   // id → blob:URL
  const [uploadingKind, setUploadingKind] = React.useState(null);
  const [lbOpen, setLbOpen] = React.useState(false);
  const [lbKind, setLbKind] = React.useState(null);
  const [lbIdx, setLbIdx] = React.useState(0);

  const refreshKind = React.useCallback(async (kind) => {
    try {
      const r = await khOpAuthFetch(`${KH_OP_API}/objects/${encodeURIComponent(objectId)}/files?kind=${encodeURIComponent(kind)}`, {});
      if (!r.ok) return;
      const items = await r.json();
      if (kind === 'viz') setViz(items || []);
      else if (kind === 'blueprint') setBps(items || []);
    } catch (_) { /* офлайн — пропускаем */ }
  }, [objectId]);

  React.useEffect(() => { refreshKind('viz'); refreshKind('blueprint'); }, [refreshKind]);

  // Подгружаем blob-URL ПАРАЛЛЕЛЬНО — каждый файл сам себя добавляет в state
  // как только пришёл, плитки не ждут друг друга. На 10+ фото разница ощутима.
  React.useEffect(() => {
    const all = [...viz, ...bps];
    const toLoad = all.filter(f => !blobUrls[f.id]);
    if (!toLoad.length) return;
    let cancelled = false;
    toLoad.forEach(async (f) => {
      try {
        const r = await khOpAuthFetch(`${KH_OP_API}/object_files/${encodeURIComponent(f.id)}`, {});
        if (!r.ok) { console.warn('[ObjectPhotos] fetch failed', f.id, r.status); return; }
        const blob = await r.blob();
        if (!blob || blob.size === 0) { console.warn('[ObjectPhotos] empty blob', f.id); return; }
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrls(prev => prev[f.id] ? prev : ({ ...prev, [f.id]: url }));
      } catch (err) {
        console.warn('[ObjectPhotos] fetch error', f.id, err);
      }
    });
    return () => { cancelled = true; };
  }, [viz, bps]);   // намеренно без blobUrls, чтобы не зациклить

  // Освободить blob-URL при размонтировании.
  React.useEffect(() => () => {
    Object.values(blobUrls).forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
  }, []);   // не зависит от blobUrls — только финальный cleanup

  const removeFile = async (fileId, filename, kind) => {
    if (!confirm(`Удалить «${filename}»?`)) return;
    try {
      const r = await khOpAuthFetch(`${KH_OP_API}/object_files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      const url = blobUrls[fileId];
      if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
      setBlobUrls(prev => { const n = { ...prev }; delete n[fileId]; return n; });
      await refreshKind(kind);
    } catch (err) {
      alert('Не удалось удалить: ' + (err.message || err));
    }
  };

  const lbItems = lbKind === 'viz' ? viz : (lbKind === 'blueprint' ? bps : []);
  const openLb = (kind, idx) => { setLbKind(kind); setLbIdx(idx); setLbOpen(true); };
  const prev = () => setLbIdx(i => (i - 1 + lbItems.length) % lbItems.length);
  const next = () => setLbIdx(i => (i + 1) % lbItems.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KHPhotoSection title="ВИЗУАЛИЗАЦИЯ" kind="viz" objectId={objectId}
        files={viz} refreshKind={refreshKind} onOpen={openLb}
        uploadingKind={uploadingKind} setUploadingKind={setUploadingKind}
        blobUrls={blobUrls} removeFile={removeFile} />
      <KHPhotoSection title="ЧЕРТЕЖИ" kind="blueprint" objectId={objectId}
        files={bps} refreshKind={refreshKind} onOpen={openLb}
        uploadingKind={uploadingKind} setUploadingKind={setUploadingKind}
        blobUrls={blobUrls} removeFile={removeFile} />
      <KHLightbox open={lbOpen} items={lbItems} index={lbIdx} blobUrls={blobUrls}
        onPrev={prev} onNext={next} onClose={() => setLbOpen(false)} />
    </div>
  );
}

window.KHObjectPhotos = KHObjectPhotos;
