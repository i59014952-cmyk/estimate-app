const FILES = ['one.json', 'two.json', 'th.json'];
const SKIP_WORDS = ['итого', 'ндс'];
const VAT_RATE = 0.20;
const MAX_RESULTS = 20;

const searchInput = document.getElementById('search');
const resultsEl = document.getElementById('results');
const bodyEl = document.getElementById('estimate-body');
const statusEl = document.getElementById('status');
const subtotalEl = document.getElementById('subtotal');
const vatEl = document.getElementById('vat');
const grandEl = document.getElementById('grand');
const exportBtn = document.getElementById('export-btn');
const uploadBtn = document.getElementById('upload-btn');
const templateBtn = document.getElementById('template-btn');
const fileInput = document.getElementById('file-input');
const uploadSummary = document.getElementById('upload-summary');

let catalog = [];
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

function fuzzyFind(query) {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return null;
    let best = null;
    let bestHits = 0;
    let bestScore = 0;
    for (const item of catalog) {
        let hits = 0;
        for (const t of qTokens) if (item.tokenSet.has(t)) hits++;
        const score = hits / qTokens.length;
        if (hits > bestHits || (hits === bestHits && score > bestScore)) {
            bestHits = hits;
            bestScore = score;
            best = item;
        }
    }
    const ok = bestScore >= 1.0 || (bestHits >= 2 && bestScore >= 0.5);
    return ok ? best : null;
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
                addRow({ name: item.name, unit: item.unit, unitPrice: item.unitPrice, qty, notFound: false });
            };
            addBtn.addEventListener('click', add);
            qtyInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') add();
            });
        });
    }
    resultsEl.classList.add('open');
}

function addRow({ name, unit, unitPrice, qty, notFound }) {
    estimate.push({
        id: nextId++,
        name,
        unit: unit || '',
        unitPrice: unitPrice || 0,
        qty: qty || 0,
        notFound: !!notFound,
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

function renderEstimate() {
    if (estimate.length === 0) {
        bodyEl.innerHTML = '<tr class="empty"><td colspan="6">Ничего не добавлено</td></tr>';
    } else {
        bodyEl.innerHTML = estimate.map(r => `
            <tr data-id="${r.id}" class="${r.notFound ? 'not-found' : ''}">
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.unit)}</td>
                <td><input type="number" class="qty" min="0" step="0.01" value="${r.qty}"></td>
                <td class="num">${r.notFound ? '<span class="price-missing">цена не найдена</span>' : formatMoney(r.unitPrice)}</td>
                <td class="num row-total">${r.notFound ? '—' : formatMoney(r.qty * r.unitPrice)}</td>
                <td><button type="button" class="del-btn">Удалить</button></td>
            </tr>
        `).join('');
        bodyEl.querySelectorAll('tr[data-id]').forEach(tr => {
            const id = parseInt(tr.dataset.id, 10);
            tr.querySelector('.qty').addEventListener('input', e => {
                updateQty(id, parseFloat(e.target.value));
            });
            tr.querySelector('.del-btn').addEventListener('click', () => removeFromEstimate(id));
        });
    }
    renderTotals();
}

function renderTotals() {
    const subtotal = estimate.reduce((s, r) => r.notFound ? s : s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    subtotalEl.textContent = formatMoney(subtotal);
    vatEl.textContent = formatMoney(vat);
    grandEl.textContent = formatMoney(subtotal + vat);
    exportBtn.disabled = estimate.length === 0;
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
    const rows = [['Название', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Итого']];
    for (const r of estimate) {
        rows.push([
            r.name,
            r.unit,
            r.qty,
            r.notFound ? 'цена не найдена' : r.unitPrice.toFixed(2),
            r.notFound ? '' : (r.qty * r.unitPrice).toFixed(2),
        ]);
    }
    const subtotal = estimate.reduce((s, r) => r.notFound ? s : s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    rows.push([]);
    rows.push(['', '', '', 'Сумма', subtotal.toFixed(2)]);
    rows.push(['', '', '', 'НДС 20%', vat.toFixed(2)]);
    rows.push(['', '', '', 'Итого с НДС', (subtotal + vat).toFixed(2)]);
    downloadCsv(rows, `estimate-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadTemplate() {
    downloadCsv([
        ['# Заполните только реальные наименования работ и количество'],
        ['Наименование', 'Количество'],
    ], 'template.csv');
}

function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const sep = (text.split('\n')[0].match(/;/g) || []).length >
                (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
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

const SKIP_PHRASES = ['смета', 'объект:', 'адрес', 'основание:', '№№', 'п/п'];

function isValidImportRow(name, rawQty) {
    if (!name) return false;
    if (name.startsWith('#')) return false;
    const lower = name.toLowerCase();
    for (const phrase of SKIP_PHRASES) {
        if (lower.includes(phrase)) return false;
    }
    if (/^\s*\d+([.,]\d+)?\s*$/.test(name)) return false;
    if (name.length <= 10) return false;
    if (name.trim().split(/\s+/).length < 2) return false;
    const qtyStr = String(rawQty ?? '').trim();
    if (qtyStr !== '' && isNaN(toNumber(qtyStr))) return false;
    return true;
}

function importRows(rows) {
    let imported = 0;
    let notFoundCount = 0;
    let skipped = 0;
    for (const row of rows) {
        const name = String(row[0] ?? '').trim();
        const rawQty = row[1];
        if (!isValidImportRow(name, rawQty)) {
            if (name) skipped++;
            continue;
        }
        const qty = toNumber(rawQty);
        const q = isFinite(qty) && qty > 0 ? qty : 1;
        const match = fuzzyFind(name);
        if (match) {
            addRow({ name: match.name, unit: match.unit, unitPrice: match.unitPrice, qty: q, notFound: false });
        } else {
            addRow({ name, unit: '', unitPrice: 0, qty: q, notFound: true });
            notFoundCount++;
        }
        imported++;
    }
    return { imported, notFoundCount, skipped };
}

function handleFile(file) {
    uploadSummary.classList.remove('error');
    uploadSummary.textContent = `Обработка файла: ${file.name}…`;
    const ext = file.name.toLowerCase().split('.').pop();
    const reader = new FileReader();
    reader.onerror = () => {
        uploadSummary.textContent = 'Ошибка чтения файла';
        uploadSummary.classList.add('error');
    };
    if (ext === 'xlsx' || ext === 'xls') {
        if (typeof XLSX === 'undefined') {
            uploadSummary.textContent = 'Библиотека XLSX не загружена — используйте CSV';
            uploadSummary.classList.add('error');
            return;
        }
        reader.onload = e => {
            try {
                const rows = readXlsx(new Uint8Array(e.target.result));
                const { imported, notFoundCount, skipped } = importRows(rows);
                uploadSummary.textContent = `Загружено: ${imported}, без цены: ${notFoundCount}, пропущено: ${skipped}`;
            } catch (err) {
                uploadSummary.textContent = `Ошибка разбора: ${err.message}`;
                uploadSummary.classList.add('error');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = e => {
            try {
                const rows = parseCsv(e.target.result);
                const { imported, notFoundCount, skipped } = importRows(rows);
                uploadSummary.textContent = `Загружено: ${imported}, без цены: ${notFoundCount}, пропущено: ${skipped}`;
            } catch (err) {
                uploadSummary.textContent = `Ошибка разбора: ${err.message}`;
                uploadSummary.classList.add('error');
            }
        };
        reader.readAsText(file, 'utf-8');
    }
}

function loadCatalog() {
    statusEl.textContent = 'Загрузка каталога…';
    Promise.all(FILES.map(f => fetch(f).then(r => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`);
        return r.text().then(parseJsonLoose);
    })))
    .then(results => {
        const all = results.flatMap(extractItems);
        const seen = new Map();
        for (const item of all) {
            const key = item.name + '|' + item.unit;
            if (!seen.has(key)) seen.set(key, item);
        }
        catalog = Array.from(seen.values());
        for (const item of catalog) item.tokenSet = new Set(tokenize(item.name));
        statusEl.textContent = `Каталог загружен: ${catalog.length} позиций`;
        searchInput.disabled = false;
        uploadBtn.disabled = false;
        searchInput.focus();
    })
    .catch(err => {
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
templateBtn.addEventListener('click', downloadTemplate);
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
});

renderEstimate();
loadCatalog();
