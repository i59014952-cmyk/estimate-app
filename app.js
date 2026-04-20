const FILES = ['one.json', 'two.json', 'th.json'];
const SKIP_WORDS = ['итого', 'ндс'];
const AREA_UNITS = ['м.', 'м.п.', 'м2'];

const areaInput = document.getElementById('area');
const tbody = document.getElementById('estimate-body');
const statusEl = document.getElementById('status');
const grandTotalEl = document.getElementById('grand-total');

let items = [];

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

function pickFirstNumber(row, keys) {
    for (const key of keys) {
        const n = toNumber(row[key]);
        if (!isNaN(n)) return n;
    }
    return 0;
}

function shouldSkip(name, qty) {
    if (isNaN(qty)) return true;
    const lower = name.toLowerCase();
    return SKIP_WORDS.some(w => lower.includes(w));
}

function extractItems(data) {
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === 'object') {
        for (const v of Object.values(data)) {
            if (Array.isArray(v)) rows = rows.concat(v);
        }
    }
    const result = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const name = pickName(row);
        if (!name) continue;
        const qty = toNumber(row.Column4);
        if (shouldSkip(name, qty)) continue;
        const unit = row.Column3 != null ? String(row.Column3).trim() : '';
        const materialPrice = toNumber(row.Column5) || 0;
        const workPrice = pickFirstNumber(row, ['Column6', 'Column7']);
        const rowTotal = pickFirstNumber(row, ['Column8', 'Column10']);
        const unitPrice = (materialPrice || 0) + (workPrice || 0);
        result.push({ name, unit, qty, unitPrice, rowTotal });
    }
    return result;
}

function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

function isAreaUnit(unit) {
    const u = (unit || '').toLowerCase().replace(/\s/g, '');
    return AREA_UNITS.some(a => u === a.toLowerCase());
}

function calcRowTotal(item, area) {
    if (isAreaUnit(item.unit)) return item.unitPrice * area;
    return item.rowTotal || item.unitPrice * item.qty;
}

function render() {
    const area = parseFloat(areaInput.value) || 0;
    let total = 0;
    tbody.innerHTML = items.map(item => {
        const rowTotal = calcRowTotal(item, area);
        total += rowTotal;
        return `
            <tr>
                <td>${item.name}</td>
                <td>${item.unit}</td>
                <td class="num">${formatNumber(item.qty)}</td>
                <td class="num">${formatNumber(item.unitPrice)}</td>
                <td class="num">${formatNumber(rowTotal)}</td>
            </tr>
        `;
    }).join('');
    grandTotalEl.textContent = formatNumber(total);
}

function parseJsonLoose(text) {
    try { return JSON.parse(text); } catch (_) {}
    return JSON.parse('[' + text + ']');
}

function loadAll() {
    statusEl.textContent = 'Загрузка данных…';
    Promise.all(FILES.map(f => fetch(f).then(r => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`);
        return r.text().then(parseJsonLoose);
    })))
    .then(results => {
        items = results.flatMap(extractItems);
        statusEl.textContent = `Загружено позиций: ${items.length}`;
        render();
    })
    .catch(err => {
        statusEl.textContent = `Ошибка загрузки: ${err.message}`;
        statusEl.classList.add('error');
    });
}

areaInput.addEventListener('input', render);
loadAll();
