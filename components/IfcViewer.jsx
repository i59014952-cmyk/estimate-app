// IfcViewer.jsx — модалка с 3D-просмотром IFC-моделей.
//
// Грузит файл с бэкенда по авторизованному GET /object_files/{fileId} (без
// "Скачать как…", только просмотр). Подключает three.js + web-ifc (WASM) с
// CDN при первом открытии — экономим первую загрузку для тех, кто 3D не
// использует.
//
// Большие IFC (50+ МБ) требуют 30-90 сек на парсинг и много RAM — это норма
// для браузерного BIM-вьюера. Показываем прогресс на каждом шаге.

const KH_IFC_THREE_URL    = 'https://esm.sh/three@0.160.0';
const KH_IFC_ORBIT_URL    = 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
const KH_IFC_WEBIFC_URL   = 'https://esm.sh/web-ifc@0.0.55';
const KH_IFC_WASM_PATH    = 'https://unpkg.com/web-ifc@0.0.55/';
const KH_IFC_BACKEND_BASE = (typeof window !== 'undefined' && window.PRICES_BACKEND) || 'https://api.sme-ta.ru';

function KHIfcViewer({ open, fileId, fileUrl, fileName, onClose }) {
  const containerRef = React.useRef(null);
  const cleanupRef   = React.useRef(() => {});
  const [stage, setStage]       = React.useState('');           // текущий шаг
  const [progress, setProgress] = React.useState(0);            // % загрузки файла
  const [error, setError]       = React.useState(null);

  React.useEffect(() => {
    if (!open || (!fileId && !fileUrl)) return;
    let cancelled = false;
    setStage('Загрузка модели с сервера…'); setProgress(0); setError(null);
    cleanupRef.current = () => {};

    (async () => {
      try {
        // 1. Авторизованный fetch файла. fileUrl (для демо/каталога) приоритетнее
        // fileId (загруженный пользователем файл). Используем reader для прогресса.
        const url = fileUrl
          ? (fileUrl.startsWith('http') ? fileUrl : `${KH_IFC_BACKEND_BASE}${fileUrl}`)
          : `${KH_IFC_BACKEND_BASE}/object_files/${encodeURIComponent(fileId)}`;
        const tok = (window.KHAuth && await window.KHAuth.ensureToken()) || '';
        const resp = await fetch(url, {
          headers: tok ? { Authorization: 'Bearer ' + tok } : {},
        });
        if (!resp.ok) throw new Error(`Не удалось получить файл (${resp.status})`);
        const total = Number(resp.headers.get('Content-Length')) || 0;
        const reader = resp.body.getReader();
        const chunks = []; let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); received += value.length;
          if (total) setProgress(Math.round(received / total * 100));
          if (cancelled) return;
        }
        const bytes = new Uint8Array(received); let off = 0;
        for (const c of chunks) { bytes.set(c, off); off += c.length; }
        if (cancelled) return;

        // 2. Подключаем 3D-библиотеки с CDN (один раз — три кеша CDN кеширует).
        setStage('Подключение 3D-библиотеки…');
        const [THREE, OrbitMod, WebIFC] = await Promise.all([
          import(/* webpackIgnore: true */ KH_IFC_THREE_URL),
          import(/* webpackIgnore: true */ KH_IFC_ORBIT_URL),
          import(/* webpackIgnore: true */ KH_IFC_WEBIFC_URL),
        ]);
        if (cancelled) return;
        const { OrbitControls } = OrbitMod;

        // 3. IFC API + парсинг файла (тяжёлая операция, может занять ~минуту).
        setStage('Парсинг IFC (это может занять до минуты)…');
        const ifcAPI = new WebIFC.IfcAPI();
        ifcAPI.SetWasmPath(KH_IFC_WASM_PATH);
        await ifcAPI.Init();
        if (cancelled) return;
        const modelID = ifcAPI.OpenModel(bytes);
        if (cancelled) { try { ifcAPI.CloseModel(modelID); } catch (_) {} return; }

        // 4. Сцена three.js.
        setStage('Сборка сцены…');
        const container = containerRef.current;
        if (!container) { try { ifcAPI.CloseModel(modelID); } catch (_) {} return; }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xefe6d2);
        const rect = container.getBoundingClientRect();
        const camera = new THREE.PerspectiveCamera(50, rect.width / Math.max(rect.height, 1), 0.1, 100000);
        camera.position.set(30, 30, 30);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(rect.width, rect.height);
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x9d8f72, 0.9));
        const dl = new THREE.DirectionalLight(0xffffff, 0.55);
        dl.position.set(50, 80, 30);
        scene.add(dl);

        // 5. Достаём геометрии из IFC и собираем меши.
        const meshGroup = new THREE.Group();
        const flatMeshes = ifcAPI.LoadAllGeometry(modelID);
        for (let i = 0; i < flatMeshes.size(); i++) {
          if (cancelled) break;
          const flatMesh = flatMeshes.get(i);
          const placed = flatMesh.geometries;
          for (let g = 0; g < placed.size(); g++) {
            const pg = placed.get(g);
            const geom = ifcAPI.GetGeometry(modelID, pg.geometryExpressID);
            const verts = ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
            const idx   = ifcAPI.GetIndexArray(geom.GetIndexData(),  geom.GetIndexDataSize());
            // verts — interleaved (pos.x, pos.y, pos.z, n.x, n.y, n.z), 6 floats/vertex
            const vCount = verts.length / 6;
            const positions = new Float32Array(vCount * 3);
            const normals   = new Float32Array(vCount * 3);
            for (let v = 0, p = 0; v < verts.length; v += 6, p += 3) {
              positions[p]     = verts[v];     positions[p + 1] = verts[v + 1]; positions[p + 2] = verts[v + 2];
              normals[p]       = verts[v + 3]; normals[p + 1]   = verts[v + 4]; normals[p + 2]   = verts[v + 5];
            }
            const bg = new THREE.BufferGeometry();
            bg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            bg.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
            bg.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
            const color = new THREE.Color(pg.color.x, pg.color.y, pg.color.z);
            const alpha = pg.color.w == null ? 1 : pg.color.w;
            const mat = new THREE.MeshLambertMaterial({
              color, transparent: alpha < 1, opacity: alpha, side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(bg, mat);
            const m = pg.flatTransformation;
            mesh.applyMatrix4(new THREE.Matrix4().fromArray(m));
            meshGroup.add(mesh);
            // освободим WASM-копии
            geom.delete && geom.delete();
          }
        }
        if (cancelled) { try { ifcAPI.CloseModel(modelID); } catch (_) {} return; }
        scene.add(meshGroup);

        // 6. Подгоним камеру под bounding box модели.
        const box = new THREE.Box3().setFromObject(meshGroup);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size   = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          camera.position.set(center.x + maxDim, center.y + maxDim * 0.8, center.z + maxDim);
          camera.near = maxDim / 1000;
          camera.far  = maxDim * 50;
          camera.updateProjectionMatrix();
          controls.target.copy(center);
        }

        // 7. Цикл рендеринга + resize.
        let raf = 0;
        const animate = () => {
          if (cancelled) return;
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(animate);
        };
        animate();
        const onResize = () => {
          if (!container) return;
          const r = container.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          camera.aspect = r.width / r.height;
          camera.updateProjectionMatrix();
          renderer.setSize(r.width, r.height);
        };
        window.addEventListener('resize', onResize);

        setStage(''); setProgress(0);

        cleanupRef.current = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
          try { renderer.dispose(); } catch (_) {}
          try { ifcAPI.CloseModel(modelID); } catch (_) {}
          meshGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
          });
          if (container) container.innerHTML = '';
        };
      } catch (err) {
        if (!cancelled) {
          console.error('[IfcViewer]', err);
          setError(err.message || String(err));
          setStage('');
        }
      }
    })();

    return () => {
      cancelled = true;
      try { cleanupRef.current(); } catch (_) {}
    };
  }, [open, fileId, fileUrl]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(96vw, 1400px)', height: 'min(92vh, 900px)',
        background: 'var(--paper, #f4ecdc)', borderRadius: 14, boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)',
        padding: 14, display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--ink)',
      }}>
        <div className="row between center" style={{ padding: '4px 6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="eyebrow" style={{ color: 'var(--rust)' }}>3D-модель</div>
            <div style={{ fontWeight: 600 }}>{fileName || 'IFC'}</div>
          </div>
          <button className="btn" onClick={onClose} title="Закрыть">✕ Закрыть</button>
        </div>
        <div ref={containerRef} style={{
          flex: 1, minHeight: 0, background: '#efe6d2', borderRadius: 10,
          position: 'relative', overflow: 'hidden', border: '1px solid var(--rule)',
        }}>
          {(stage || error) && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              padding: '14px 20px', background: 'rgba(255,255,255,.92)', borderRadius: 10,
              maxWidth: '80%', textAlign: 'center', color: error ? 'var(--rust)' : 'var(--ink)',
              fontSize: 13, boxShadow: '0 6px 24px rgba(0,0,0,.12)',
            }}>
              {error ? `Ошибка: ${error}` : `${stage}${progress > 0 ? ` ${progress}%` : ''}`}
              {error && (
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  Если файл очень большой, попробуй сетевое соединение получше и подожди до минуты.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="tiny muted" style={{ padding: '0 6px' }}>
          Левая кнопка мыши — вращать · правая — двигать · колесо — приближать
        </div>
      </div>
    </div>
  );
}

window.KHIfcViewer = KHIfcViewer;
