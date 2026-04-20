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

function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
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
                <span class="r-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span>
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
                addToEstimate(item, qty);
            };
            addBtn.addEventListener('click', add);
            qtyInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') add();
            });
        });
    }
    resultsEl.classList.add('open');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
    return escapeHtml(s);
}

function addToEstimate(item, qty) {
    estimate.push({ id: nextId++, name: item.name, unit: item.unit, unitPrice: item.unitPrice, qty });
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
    if (totalCell) totalCell.textContent = formatMoney(row.qty * row.unitPrice);
}

function renderEstimate() {
    if (estimate.length === 0) {
        bodyEl.innerHTML = '<tr class="empty"><td colspan="6">Ничего не добавлено</td></tr>';
    } else {
        bodyEl.innerHTML = estimate.map(r => `
            <tr data-id="${r.id}">
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.unit)}</td>
                <td><input type="number" class="qty" min="0" step="0.01" value="${r.qty}"></td>
                <td class="num">${formatMoney(r.unitPrice)}</td>
                <td class="num row-total">${formatMoney(r.qty * r.unitPrice)}</td>
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
    const subtotal = estimate.reduce((s, r) => s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    subtotalEl.textContent = formatMoney(subtotal);
    vatEl.textContent = formatMoney(vat);
    grandEl.textContent = formatMoney(subtotal + vat);
    exportBtn.disabled = estimate.length === 0;
}

function exportCsv() {
    if (estimate.length === 0) return;
    const rows = [['Название', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Итого']];
    for (const r of estimate) {
        rows.push([r.name, r.unit, r.qty, r.unitPrice.toFixed(2), (r.qty * r.unitPrice).toFixed(2)]);
    }
    const subtotal = estimate.reduce((s, r) => s + r.qty * r.unitPrice, 0);
    const vat = subtotal * VAT_RATE;
    rows.push([]);
    rows.push(['', '', '', 'Сумма', subtotal.toFixed(2)]);
    rows.push(['', '', '', 'НДС 20%', vat.toFixed(2)]);
    rows.push(['', '', '', 'Итого с НДС', (subtotal + vat).toFixed(2)]);
    const csv = rows.map(r => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function csvCell(value) {
    const s = String(value ?? '');
    if (/[";\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
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
        statusEl.textContent = `Каталог загружен: ${catalog.length} позиций`;
        searchInput.disabled = false;
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

renderEstimate();
loadCatalog();
