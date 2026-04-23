const FILES = ['one.json', 'two.json', 'th.json'];
const DDC_URL = 'https://raw.githubusercontent.com/datadrivenconstruction/OpenConstructionEstimate-DDC-CWICR/main/RU___DDC_CWICR/DDC_CWICR_RU_STPETERSBURG_Catalog.csv';
const SKIP_WORDS = ['итого', 'ндс'];
const VAT_RATE = 0.20;
const MAX_RESULTS = 20;
const PRICES_BACKEND = 'https://petrovich-proxy.onrender.com';
const PRICES_CONCURRENCY = 3;
const SOURCE_LABELS = {
    local: 'Своя база',
    ddc: 'DDC база',
    kolorit: 'Колорит',
    krepmast: 'Крепмаст',
    manual: 'Вручную',
    none: '—',
};

const searchInput = document.getElementById('search');
const resultsEl = document.getElementById('results');
const bodyEl = document.getElementById('estimate-body');
const statusEl = document.getElementById('status');
const subtotalEl = document.getElementById('subtotal');
const vatEl = document.getElementById('vat');
const grandEl = document.getElementById('grand');
const exportBtn = document.getElementById('export-btn');
const uploadBtn = document.getElementById('upload-btn');
const koloritBtn = document.getElementById('kolorit-btn');
const fileInput = document.getElementById('file-input');
const uploadSummary = document.getElementById('upload-summary');

let catalog = [];
let ddcCatalog = [];
let estimate = [];
let nextId = 1;

function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
}

function pickName(row) {
    if (row.Column2 != null && String(row.Column2).trim() !== '') return String(row.Column2).trim();
    for (const key of Object.keys(row)) {
        if (key.startsWith('МО') && row[key] != null && String(row[key]).trim() !== '') {
            return String(row[key]).trim();
        }
    }
    return '';
}

function parseJsonLoose(text) {
    try { return JSON.parse(text); } catch (_) {}
    return JSON.parse('[' + text + ']');
}

function extractItems(data) {
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === 'object') {
        for (const v of Object.values(data)) if (Array.isArray(v)) rows = rows.concat(v);
    }
    const result = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const name = pickName(row);
        if (!name) continue;
        const qty = toNumber(row.Column4);
        if (isNaN(qty) || qty === 0) continue;
        const lower = name.toLowerCase();
        if (SKIP_WORDS.some(w => lower.includes(w))) continue;
        const total = toNumber(row.Column8);
        if (isNaN(total) || total === 0) continue;
        const unitPrice = total / qty;
        const unit = row.Column3 != null ? String(row.Column3).trim() : '';
        result.push({ name, unit, unitPrice });
    }
    return result;
}

function tokenize(s) {
    return String(s).toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3);
}

function fuzzyFindIn(qTokens, pool) {
    let best = null;
    let bestHits = 0;
    for (const item of pool) {
        let hits = 0;
        for (const t of qTokens) if (item.tokenSet.has(t)) hits++;
        if (hits > bestHits) {
            bestHits = hits;
            best = item;
        }
    }
    return bestHits >= 2 ? best : null;
}

function fuzzyFind(query) {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return null;
    const local = fuzzyFindIn(qTokens, catalog);
    if (local) return { ...local, source: 'local' };
    const ddc = fuzzyFindIn(qTokens, ddcCatalog);
    if (ddc) return { ...ddc, source: 'ddc' };
    return null;
}

function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderResults(query) {
    if (!query || query.length < 2) {
        resultsEl.classList.remove('open');
        resultsEl.innerHTML = '';
        return;
    }
    const q = query.toLowerCase();
    const matches = [];
    for (const item of catalog) {
        if (item.name.toLowerCase().includes(q)) {
            matches.push(item);
            if (matches.length >= MAX_RESULTS) break;
        }
    }
    if (matches.length === 0) {
        resultsEl.innerHTML = '<div class="empty-msg">Ничего не найдено</div>';
    } else {
        resultsEl.innerHTML = matches.map((item, idx) => `
            <div class="result-item" data-idx="${idx}">
                <span class="r-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                <span class="r-unit">${escapeHtml(item.unit)}</span>
                <span class="r-price">${formatMoney(item.unitPrice)} ₽</span>
                <input type="number" min="0" step="0.01" value="1" class="r-qty">
                <button type="button" class="r-add">Добавить</button>
            </div>
        `).join('');
        resultsEl.querySelectorAll('.result-item').forEach((el, i) => {
            const item = matches[i];
            const qtyInput = el.querySelector('.r-qty');
            const addBtn = el.querySelector('.r-add');
            const add = () => {
                const qty = parseFloat(qtyInput.value);
                if (!isFinite(qty) || qty <= 0) return;
                addRow({ name: item.name, unit: item.unit, unitPrice: item.unitPrice, qty, notFound: false, source: 'local' });
            };
            addBtn.addEventListener('click', add);
            qtyInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') add();
            });
        });
    }
    resultsEl.classList.add('open');
}

function addRow({ name, unit, unitPrice, qty, notFound, source, url }) {
    estimate.push({
        id: nextId++,
        name,
        unit: unit || '',
        unitPrice: unitPrice || 0,
        qty: qty || 0,
        notFound: !!notFound,
        source: source || (notFound ? 'none' : 'local'),
        url: url || '',
        expanded: false,
        candidates: null,
        candidatesLoading: false,
        candidatesError: null,
    });
    renderEstimate();
}

function removeFromEstimate(id) {
    estimate = estimate.filter(e => e.id !== id);
    renderEstimate();
}

function updateQty(id, qty) {
    const row = estimate.find(e => e.id === id);
    if (!row) return;
    row.qty = isFinite(qty) && qty >= 0 ? qty : 0;
    renderTotals();
    const totalCell = bodyEl.querySelector(`tr[data-id="${id}"] .row-total`);
    if (totalCell) totalCell.textContent = row.notFound ? '—' : formatMoney(row.qty * row.unitPrice);
}

const EMPTY_STATE_HTML = `
    <tr class="empty"><td colspan="7">
        <div class="empty-state">
            <div class="empty-state__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="15" y2="17"/>
                </svg>
            </div>
            <div class="empty-state__title">Смета пуста</div>
            <div class="empty-state__hint">Загрузите коммерческое предложение (CSV, Excel, PDF, Word, JPEG) или начните поиск работы через строку выше.</div>
        </div>
    </td></tr>`;

const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

function renderEstimate() {
    if (estimate.length === 0) {
        bodyEl.innerHTML = EMPTY_STATE_HTML;
    } else {
        bodyEl.innerHTML = estimate.map(r => {
            const nameCell = r.url
                ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="product-link">${escapeHtml(r.name)}${LINK_ICON}</a>`
                : escapeHtml(r.name);
            const hasAlternatives = r.candidates && r.candidates.length > 1;
            let priceCell;
            if (r.notFound) {
                priceCell = `<div class="price-missing">цена не найдена</div>
                   <button type="button" class="btn-link" data-action="picker">${r.expanded ? 'Скрыть' : 'Подобрать / ввести'}</button>`;
            } else {
                priceCell = formatMoney(r.unitPrice);
                if (hasAlternatives) {
                    priceCell += `<div><button type="button" class="btn-link" data-action="picker">${r.expanded ? 'Скрыть варианты' : `Заменить (${r.candidates.length})`}</button></div>`;
                }
            }
            const mainRow = `
                <tr data-id="${r.id}" class="${r.notFound ? 'not-found' : ''}">
                    <td>${nameCell}</td>
                    <td>${escapeHtml(r.unit)}</td>
                    <td><input type="number" class="qty" min="0" step="0.01" value="${r.qty}"></td>
                    <td class="num">${priceCell}</td>
                    <td class="num row-total">${r.notFound ? '—' : formatMoney(r.qty * r.unitPrice)}</td>
                    <td><span class="src-badge ${r.source}">${SOURCE_LABELS[r.source] || '—'}</span></td>
                    <td><button type="button" class="del-btn" aria-label="Удалить">${TRASH_ICON}</button></td>
                </tr>
            `;
            const expandRow = r.expanded ? renderPicker(r) : '';
            return mainRow + expandRow;
        }).join('');
        bodyEl.querySelectorAll('tr[data-id]').forEach(tr => {
            const id = parseInt(tr.dataset.id, 10);
            const qty = tr.querySelector('.qty');
            if (qty) qty.addEventListener('input', e => updateQty(id, parseFloat(e.target.value)));
            const del = tr.querySelector('.del-btn');
            if (del) del.addEventListener('click', () => removeFromEstimate(id));
            const picker = tr.querySelector('[data-action="picker"]');
            if (picker) picker.addEventListener('click', () => togglePicker(id));
        });
        bodyEl.querySelectorAll('tr.expand-row').forEach(tr => {
            const id = parseInt(tr.dataset.parentId, 10);
            tr.querySelectorAll('[data-candidate]').forEach(btn => {
                btn.addEventListener('click', () => applyCandidate(id, parseInt(btn.dataset.candidate, 10)));
            });
            const input = tr.querySelector('[data-manual-input]');
            const apply = tr.querySelector('[data-action="apply-manual"]');
            if (input && apply) {
                apply.addEventListener('click', () => applyManualPrice(id, input.value));
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); applyManualPrice(id, input.value); }
                });
                input.focus();
            }
        });
    }
    renderTotals();
}

function renderPicker(r) {
    let list = '';
    if (r.candidatesLoading) {
        list = '<div class="picker__loading">Поиск вариантов в каталоге Колорит…</div>';
    } else if (r.candidatesError) {
        list = `<div class="picker__error">Ошибка: ${escapeHtml(r.candidatesError)}</div>`;
    } else if (!r.candidates || r.candidates.length === 0) {
        list = '<div class="picker__empty">В каталоге Колорит ничего не нашлось — введите цену вручную ниже.</div>';
    } else {
        list = r.candidates.map((c, i) => {
            const src = c.city === 'krepmast' ? 'krepmast' : 'kolorit';
            return `
            <button type="button" class="picker__item" data-candidate="${i}">
                <span class="picker__item-name">${escapeHtml(c.name || '')}</span>
                <span class="src-badge ${src}">${SOURCE_LABELS[src]}</span>
                <span class="picker__item-price">${c.price ? formatMoney(c.price) + ' ₽' : '—'}</span>
            </button>
        `;
        }).join('');
    }
    return `
        <tr class="expand-row" data-parent-id="${r.id}">
            <td colspan="7">
                <div class="picker">
                    <div class="picker__title">Варианты для «${escapeHtml(r.name)}»</div>
                    <div class="picker__list">${list}</div>
                    <div class="picker__manual">
                        <span>или введите цену вручную:</span>
                        <input type="number" min="0" step="0.01" data-manual-input placeholder="0">
                        <span>₽</span>
                        <button type="button" data-action="apply-manual">Применить</button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

async function togglePicker(id) {
    const row = estimate.find(r => r.id === id);
    if (!row) return;
    row.expanded = !row.expanded;
    const needsFetch = row.expanded && (row.candidates === null || row.candidates.length === 0) && !row.candidatesLoading;
    if (needsFetch) {
        row.candidatesLoading = true;
        row.candidatesError = null;
        renderEstimate();
        try {
            const url = `${PRICES_BACKEND}/prices/search?query=${encodeURIComponent(row.name)}&limit=6`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            row.candidates = (j.results || []).filter(x => x && (x.price || x.name));
            console.log(`[Подбор] "${row.name}" -> ${row.candidates.length} вариантов`);
        } catch (err) {
            row.candidates = [];
            row.candidatesError = err.message;
        } finally {
            row.candidatesLoading = false;
            renderEstimate();
        }
    } else {
        renderEstimate();
    }
}

function applyCandidate(id, idx) {
    const row = estimate.find(r => r.id === id);
    if (!row || !row.candidates || !row.candidates[idx]) return;
    const c = row.candidates[idx];
    if (!c.price) return;
    row.name = c.name || row.name;
    row.unit = c.unit || row.unit || 'шт.';
    row.unitPrice = c.price;
    row.url = c.url || '';
    row.source = c.city === 'krepmast' ? 'krepmast' : 'kolorit';
    row.notFound = false;
    row.expanded = false;
    renderEstimate();
}

function applyManualPrice(id, raw) {
    const row = estimate.find(r => r.id === id);
    if (!row) return;
    const n = parseFloat(String(raw).replace(',', '.'));
    if (!isFinite(n) || n < 0) return;
    row.unitPrice = n;
    row.unit = row.unit || 'шт.';
    row.source = 'manual';
    row.notFound = false;
    row.expanded = false;
    renderEstimate();
}

function renderTotals() {
    const subtotal = estimate.reduce((s, r) => r.notFound ? s : s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    subtotalEl.textContent = formatMoney(subtotal);
    vatEl.textContent = formatMoney(vat);
    grandEl.textContent = formatMoney(subtotal + vat);
    exportBtn.disabled = estimate.length === 0;
    koloritBtn.disabled = estimate.length === 0 || koloritBtn.dataset.busy === '1';
}

function csvCell(value) {
    const s = String(value ?? '');
    if (/[";\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportCsv() {
    if (estimate.length === 0) return;
    const rows = [['Название', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Итого', 'Источник']];
    for (const r of estimate) {
        rows.push([
            r.name,
            r.unit,
            r.qty,
            r.notFound ? 'цена не найдена' : r.unitPrice.toFixed(2),
            r.notFound ? '' : (r.qty * r.unitPrice).toFixed(2),
            SOURCE_LABELS[r.source] || '',
        ]);
    }
    const subtotal = estimate.reduce((s, r) => r.notFound ? s : s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    rows.push([]);
    rows.push(['', '', '', 'Сумма', subtotal.toFixed(2), '']);
    rows.push(['', '', '', 'НДС 20%', vat.toFixed(2), '']);
    rows.push(['', '', '', 'Итого с НДС', (subtotal + vat).toFixed(2), '']);
    downloadCsv(rows, `estimate-${new Date().toISOString().slice(0, 10)}.csv`);
}

function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const semi = (text.match(/;/g) || []).length;
    const comma = (text.match(/,/g) || []).length;
    const tab = (text.match(/\t/g) || []).length;
    let sep = ';';
    if (tab > semi && tab > comma) sep = '\t';
    else if (comma > semi) sep = ',';
    console.log(`[CSV] разделитель: "${sep}" (; ${semi}, , ${comma}, \\t ${tab})`);
    const rows = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === sep) { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else if (c === '\r') { /* skip */ }
            else field += c;
        }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(cell => cell && cell.trim() !== ''));
}

function readXlsx(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

const scriptCache = {};
function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('не удалось загрузить ' + src));
        document.head.appendChild(s);
    });
    return scriptCache[src];
}

async function extractPdfText(arrayBuffer) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let out = '';
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const byLine = new Map();
        for (const it of tc.items) {
            const y = Math.round(it.transform[5]);
            if (!byLine.has(y)) byLine.set(y, []);
            byLine.get(y).push(it.str);
        }
        const lines = Array.from(byLine.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([_, arr]) => arr.join(' '));
        out += lines.join('\n') + '\n';
    }
    return out;
}

async function extractDocxText(arrayBuffer) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    const res = await mammoth.extractRawText({ arrayBuffer });
    return res.value || '';
}

async function extractImageText(file, onProgress) {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    const { data } = await Tesseract.recognize(file, 'rus+eng', {
        logger: m => {
            if (onProgress && m.status && typeof m.progress === 'number') {
                onProgress(m.status, m.progress);
            }
        },
    });
    return data.text || '';
}

function textToRows(text) {
    const rows = [];
    const qtyRx = /(\d+(?:[.,]\d+)?)\s*(шт\.?|м\.?п\.?|м2|м²|м3|кг|т|л|компл\.?|упак\.?)?\s*$/i;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/\s+/g, ' ').trim();
        if (!line) continue;
        const m = line.match(qtyRx);
        if (m) {
            const name = line.slice(0, m.index).trim().replace(/[–—\-·•:;,]+$/u, '').trim();
            const qty = m[1];
            if (name) { rows.push([name, qty]); continue; }
        }
        rows.push([line, '']);
    }
    return rows;
}

const SKIP_PHRASES = [
    'смета', 'объект:', 'адрес:', 'основание:', '№№', 'п/п', 'наименование',
    'итого', 'ндс', 'всего с ндс', 'всего без ндс',
    'примечания:', 'примечание:',
    'заказчик:', 'подрядчик:', 'исполнитель:', 'подпись',
];

function isPureNumber(s) {
    return /^\s*\d+([.,]\d+)?\s*$/.test(s);
}

function extractNameAndQty(row) {
    const cells = row.map(c => String(c ?? '').trim());
    let nameIdx = -1;
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!c) continue;
        if (isPureNumber(c)) continue;
        if (c.length < 3) continue;
        nameIdx = i;
        break;
    }
    if (nameIdx === -1) return { name: '', qty: NaN };
    const name = cells[nameIdx];
    let qty = NaN;
    for (let i = nameIdx + 1; i < cells.length; i++) {
        const n = toNumber(cells[i]);
        if (!isNaN(n) && n > 0) { qty = n; break; }
    }
    return { name, qty };
}

function shouldSkipName(name) {
    if (!name) return true;
    if (!/\p{L}{3,}/u.test(name)) return true;
    const lower = name.toLowerCase();
    for (const phrase of SKIP_PHRASES) if (lower.includes(phrase)) return true;
    return false;
}

function importRows(rows) {
    console.log(`[Импорт] всего строк после парсинга: ${rows.length}`);
    console.log('[Импорт] первые 10 строк:', rows.slice(0, 10));
    let imported = 0;
    let notFoundCount = 0;
    let skipped = 0;
    for (const row of rows) {
        const { name, qty } = extractNameAndQty(row);
        if (!name || shouldSkipName(name)) { skipped++; continue; }
        const q = isFinite(qty) && qty > 0 ? qty : 1;
        const match = fuzzyFind(name);
        console.log(`[Поиск] "${name}" (qty=${q}) -> ${match ? 'найдено: ' + match.name : 'НЕ найдено'}`);
        if (match) {
            addRow({ name: match.name, unit: match.unit, unitPrice: match.unitPrice, qty: q, notFound: false, source: match.source });
        } else {
            addRow({ name, unit: '', unitPrice: 0, qty: q, notFound: true, source: 'none' });
            notFoundCount++;
        }
        imported++;
    }
    console.log(`[Импорт] итог: загружено=${imported}, без цены=${notFoundCount}, пропущено=${skipped}`);
    return { imported, notFoundCount, skipped };
}

function reportImport(prefix, rows) {
    const { imported, notFoundCount, skipped } = importRows(rows);
    uploadSummary.textContent = `${prefix}: загружено ${imported}, без цены ${notFoundCount}, пропущено ${skipped}`;
}

function handleFile(file) {
    uploadSummary.classList.remove('error');
    uploadSummary.textContent = `Обработка: ${file.name}…`;
    const ext = (file.name.toLowerCase().split('.').pop() || '').trim();
    const mime = (file.type || '').toLowerCase();

    const failAsync = err => {
        console.error('[handleFile]', err);
        uploadSummary.textContent = `Ошибка разбора: ${err.message || err}`;
        uploadSummary.classList.add('error');
    };

    const readBuffer = () => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('не удалось прочитать файл'));
        r.readAsArrayBuffer(file);
    });
    const readText = () => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('не удалось прочитать файл'));
        r.readAsText(file, 'utf-8');
    });

    if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet')) {
        if (typeof XLSX === 'undefined') {
            return failAsync(new Error('XLSX не загружен, откройте интернет'));
        }
        readBuffer()
            .then(buf => reportImport('XLSX', readXlsx(new Uint8Array(buf))))
            .catch(failAsync);
        return;
    }

    if (ext === 'pdf' || mime === 'application/pdf') {
        uploadSummary.textContent = 'PDF: загрузка библиотеки и разбор…';
        readBuffer()
            .then(extractPdfText)
            .then(text => {
                console.log('[PDF] распознано символов:', text.length);
                console.log('[PDF] фрагмент:', text.slice(0, 400));
                reportImport('PDF', textToRows(text));
            })
            .catch(failAsync);
        return;
    }

    if (ext === 'docx' || mime.includes('wordprocessingml')) {
        uploadSummary.textContent = 'DOCX: извлекаю текст…';
        readBuffer()
            .then(extractDocxText)
            .then(text => {
                console.log('[DOCX] распознано символов:', text.length);
                console.log('[DOCX] фрагмент:', text.slice(0, 400));
                reportImport('DOCX', textToRows(text));
            })
            .catch(failAsync);
        return;
    }

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || mime.startsWith('image/')) {
        uploadSummary.textContent = 'Изображение: загружаю OCR (первый раз ~5–10 МБ)…';
        extractImageText(file, (status, progress) => {
            uploadSummary.textContent = `OCR ${status}: ${Math.round(progress * 100)}%`;
        })
            .then(text => {
                console.log('[OCR] распознано символов:', text.length);
                console.log('[OCR] фрагмент:', text.slice(0, 400));
                reportImport('OCR', textToRows(text));
            })
            .catch(failAsync);
        return;
    }

    // default: CSV / plain text
    readText()
        .then(text => reportImport('CSV', parseCsv(text)))
        .catch(failAsync);
}

function extractDdcItems(rows) {
    if (rows.length < 2) return [];
    const header = rows[0].map(h => String(h || '').trim().toLowerCase());
    const nameIdx = header.indexOf('name');
    const unitIdx = header.indexOf('unit');
    const priceIdx = header.indexOf('price_avg');
    const sectionIdx = header.indexOf('parent_section');
    const collectionIdx = header.indexOf('parent_collection');
    if (priceIdx === -1) {
        console.warn('[DDC] не найдена колонка price_avg, заголовок:', header);
        return [];
    }
    const sections = new Map();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const section = sectionIdx !== -1 ? String(row[sectionIdx] || '').trim() : '';
        const resName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
        const displayName = section || resName;
        if (!displayName) continue;
        if (sections.has(displayName)) continue;
        const price = toNumber(row[priceIdx]);
        if (isNaN(price) || price <= 0) continue;
        const unit = unitIdx !== -1 ? String(row[unitIdx] || '').trim() : '';
        const collection = collectionIdx !== -1 ? String(row[collectionIdx] || '').trim() : '';
        sections.set(displayName, {
            name: displayName,
            unit,
            unitPrice: price,
            searchText: `${displayName} ${collection} ${resName}`.trim(),
        });
    }
    return Array.from(sections.values());
}

function loadLocalCatalog() {
    return Promise.all(FILES.map(f => fetch(f).then(r => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`);
        return r.text().then(parseJsonLoose);
    }))).then(results => {
        results.forEach((data, i) => {
            const items = extractItems(data);
            console.log(`[JSON] ${FILES[i]}: распаршено ${items.length} позиций`);
        });
        const all = results.flatMap(extractItems);
        const seen = new Map();
        for (const item of all) {
            const key = item.name + '|' + item.unit;
            if (!seen.has(key)) seen.set(key, item);
        }
        catalog = Array.from(seen.values());
        for (const item of catalog) item.tokenSet = new Set(tokenize(item.name));
        console.log(`[JSON] Загружено ${catalog.length} позиций из JSON (после дедупа)`);
    });
}

function setCatalogStatus() {
    const total = catalog.length + ddcCatalog.length;
    statusEl.textContent = `Каталог: ${total.toLocaleString('ru-RU')} позиций (своя база ${catalog.length}, DDC ${ddcCatalog.length})`;
    statusEl.classList.remove('error');
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const preferred = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', preferred);
    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
}

function loadDdcCatalog() {
    return fetch(DDC_URL).then(r => {
        if (!r.ok) throw new Error(`DDC: ${r.status}`);
        return r.text();
    }).then(text => {
        const rows = parseCsv(text);
        const items = extractDdcItems(rows);
        const seen = new Map();
        for (const item of items) {
            const key = item.name + '|' + item.unit;
            if (!seen.has(key)) seen.set(key, item);
        }
        ddcCatalog = Array.from(seen.values());
        for (const item of ddcCatalog) item.tokenSet = new Set(tokenize(item.searchText || item.name));
        console.log(`[DDC] Загружено ${ddcCatalog.length} позиций из DDC базы`);
        console.log('[DDC] пример первых 3 позиций:', ddcCatalog.slice(0, 3));
    }).catch(err => {
        console.warn('[DDC] Не удалось загрузить DDC базу:', err.message);
        ddcCatalog = [];
    });
}

async function fetchPricesForNotFound() {
    const targets = estimate.slice();
    if (targets.length === 0) return;
    koloritBtn.dataset.busy = '1';
    koloritBtn.disabled = true;
    const prevLabel = koloritBtn.textContent;
    koloritBtn.textContent = 'Запрос цен…';
    uploadSummary.classList.remove('error');
    uploadSummary.textContent = `Поиск вариантов для ${targets.length} позиций…`;
    let filled = 0, done = 0, failed = 0, ambiguous = 0;
    const reportProgress = () => {
        uploadSummary.textContent = `Запрос цен: ${done}/${targets.length} (с вариантами ${ambiguous})`;
    };
    async function searchOne(name) {
        const url = `${PRICES_BACKEND}/prices/search?query=${encodeURIComponent(name)}&limit=6`;
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            console.log(`[Запрос цен] "${name}" -> ${j.results?.length || 0} вариантов`);
            return (j.results || []).filter(x => x && x.price);
        } catch (err) {
            console.warn('[Запрос цен] ошибка', name, err.message);
            failed++;
            return [];
        }
    }
    async function worker(queue) {
        while (queue.length > 0) {
            const row = queue.shift();
            if (!row) return;
            const candidates = await searchOne(row.name);
            done++;
            row.candidates = candidates;
            if (candidates.length > 0) {
                // Only apply as default for rows without a price yet.
                if (row.notFound) {
                    const c = candidates[0];
                    row.name = c.name || row.name;
                    row.unitPrice = c.price;
                    row.unit = c.unit || row.unit || 'шт.';
                    row.source = c.city === 'krepmast' ? 'krepmast' : 'kolorit';
                    row.url = c.url || '';
                    row.notFound = false;
                    filled++;
                }
                // Keep picker collapsed by default — user opens it via "Заменить (N)".
                row.expanded = false;
                if (candidates.length > 1) ambiguous++;
            } else {
                row.expanded = false;
            }
            reportProgress();
        }
    }
    const queue = targets.slice();
    const workers = Array.from({ length: PRICES_CONCURRENCY }, () => worker(queue));
    try {
        await Promise.all(workers);
        uploadSummary.textContent = `Запрос цен: обработано ${done}, новых цен ${filled}, с альтернативами ${ambiguous}, ошибок ${failed}`;
        renderEstimate();
    } catch (err) {
        console.error('[Запрос цен] сбой', err);
        uploadSummary.textContent = `Сервис цен недоступен: ${err.message}`;
        uploadSummary.classList.add('error');
    } finally {
        delete koloritBtn.dataset.busy;
        koloritBtn.textContent = prevLabel;
        renderTotals();
    }
}


function loadCatalog() {
    statusEl.textContent = 'Загрузка каталогов…';
    statusEl.classList.remove('error');
    Promise.all([loadLocalCatalog(), loadDdcCatalog()])
        .then(() => {
            setCatalogStatus();
            searchInput.disabled = false;
            uploadBtn.disabled = false;
            renderTotals();
            searchInput.focus();
        })
        .catch(err => {
            console.error('[Каталог] Ошибка загрузки:', err);
            statusEl.textContent = `Ошибка загрузки: ${err.message}`;
            statusEl.classList.add('error');
        });
}

searchInput.addEventListener('input', e => renderResults(e.target.value));
searchInput.addEventListener('focus', e => {
    if (e.target.value) renderResults(e.target.value);
});
document.addEventListener('click', e => {
    if (!e.target.closest('.search-block')) resultsEl.classList.remove('open');
});
exportBtn.addEventListener('click', exportCsv);
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
});
koloritBtn.addEventListener('click', fetchPricesForNotFound);

initTheme();
renderEstimate();
loadCatalog();
