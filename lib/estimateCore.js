// estimateCore.js — pure logic extracted from app.js, no DOM access.
// Exposed via window.* so JSX modules can read them.

const APP_VERSION = 'v2026-04-28-kub-house';
console.log(`%c Kub·House ${APP_VERSION} `, 'background:#5b5bf1;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px');

const FILES = ['one.json', 'two.json', 'th.json'];
const DDC_URL = 'https://raw.githubusercontent.com/datadrivenconstruction/OpenConstructionEstimate-DDC-CWICR/main/RU___DDC_CWICR/DDC_CWICR_RU_STPETERSBURG_Catalog.csv';
const SKIP_WORDS = ['итого', 'ндс'];
const HIDDEN_CATEGORIES = new Set([
    'электроснабжение и освещение',
    'индивидуальный тепловой пункт (тм)',
    'кондиционирование',
    'вентиляция',
    'напольное отопление',
    'радиаторное отопление',
    'канализация',
    'водоснабжение',
    'прочие работы',
    'прочие',
    'механизмы и спецтехника',
]);
const VAT_RATE = 0.20;
const MAX_RESULTS = 20;
const PRICES_BACKEND = 'https://petrovich-proxy.onrender.com';
const PRICES_CONCURRENCY = 3;
const SOURCE_LABELS = {
    local: 'Своя база',
    ddc: 'DDC база',
    kolorit: 'Колорит',
    krepmast: 'Крепмаст',
    voltkin: 'Вольткин',
    manual: 'Вручную',
    none: '—',
};
const KNOWN_SOURCES = new Set(['kolorit', 'krepmast', 'voltkin']);

function isHiddenCategory(name) {
    const normalized = String(name)
        .toLowerCase()
        .replace(/ /g, ' ')
        .replace(/ё/g, 'е')
        .replace(/^[\s\d.,:;\-–—№()]+/u, '')
        .replace(/[\s.,:;\-–—()]+$/u, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (HIDDEN_CATEGORIES.has(normalized)) return true;
    for (const entry of HIDDEN_CATEGORIES) {
        if (normalized === entry) return true;
        if (normalized.startsWith(entry + ' ')) return true;
        if (normalized.startsWith(entry + ':')) return true;
    }
    return false;
}

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
        if (isHiddenCategory(name)) continue;
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

function stemToken(t) {
    if (t.length <= 4) return t;
    if (t.length === 5) return t.slice(0, 4);
    return t.slice(0, Math.min(t.length - 1, 6));
}

function normalizeYo(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е');
}

const CONNECTOR_WORDS = new Set([
    'с', 'со', 'для', 'из', 'на', 'под', 'над', 'без', 'в', 'во',
    'и', 'а', 'но', 'к', 'ко', 'по', 'о', 'об', 'за', 'при',
]);

const ADJECTIVE_ENDING = /(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ыми|ими|ых|их|ую|юю)$/u;

function isRelevantCandidate(query, candidate) {
    const qTokens = tokenize(normalizeYo(query));
    if (qTokens.length === 0) return true;
    const cName = normalizeYo(candidate && candidate.name || '');
    if (!cName) return false;
    const allTokens = cName.match(/\p{L}+/gu) || [];
    if (allTokens.length === 0) return false;
    const qStems = qTokens.map(stemToken);
    let matchIdx = -1;
    for (let i = 0; i < allTokens.length; i++) {
        if (qStems.some(s => allTokens[i].startsWith(s))) { matchIdx = i; break; }
    }
    if (matchIdx === -1) return false;
    if (ADJECTIVE_ENDING.test(allTokens[matchIdx])) return false;
    for (let i = 0; i < matchIdx; i++) {
        const t = allTokens[i];
        if (CONNECTOR_WORDS.has(t)) return false;
        if (!ADJECTIVE_ENDING.test(t)) return false;
    }
    return true;
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

function fuzzyFind(query, catalog, ddcCatalog) {
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

function csvCell(value) {
    const s = String(value ?? '');
    if (/[";\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const semi = (text.match(/;/g) || []).length;
    const comma = (text.match(/,/g) || []).length;
    const tab = (text.match(/\t/g) || []).length;
    let sep = ';';
    if (tab > semi && tab > comma) sep = '\t';
    else if (comma > semi) sep = ',';
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
    if (typeof XLSX === 'undefined') throw new Error('XLSX не загружен');
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet || !sheet['!ref']) return [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows = [];
    for (let R = range.s.r; R <= range.e.r; R++) {
        const row = [];
        let isColored = false;
        let firstTextBold = null; // true / false / null (no text yet)
        let endsColon = false;
        let textCellsCount = 0;
        let numericCellsCount = 0;
        for (let C = range.s.c; C <= range.e.c; C++) {
            const ref = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[ref];
            if (cell) {
                const v = cell.v != null ? String(cell.v) : (cell.w != null ? String(cell.w) : '');
                row.push(v);
                if (!isColored && isColoredFill(cell)) isColored = true;
                if (v.trim()) {
                    if (cell.t === 'n' || /^-?\d+([.,]\d+)?$/.test(v.trim())) {
                        numericCellsCount++;
                    } else {
                        textCellsCount++;
                        if (firstTextBold === null) {
                            firstTextBold = !!(cell.s && cell.s.font && cell.s.font.bold);
                        }
                        if (/[:：]\s*$/.test(v)) endsColon = true;
                    }
                }
            } else {
                row.push('');
            }
        }
        row._colored = isColored;
        // Section header heuristic: bold first text cell AND no detail columns (≤1 numeric value),
        // OR a text cell ending with colon — both common in Excel estimates.
        row._sectionLike = (firstTextBold === true && numericCellsCount <= 1) || endsColon;
        rows.push(row);
    }
    return rows;
}

function isColoredFill(cell) {
    if (!cell || !cell.s || !cell.s.fill) return false;
    const fill = cell.s.fill;
    if (fill.patternType === 'none' || !fill.patternType) return false;
    const color = fill.fgColor || fill.bgColor;
    if (!color) return false;
    if (color.rgb) {
        const upper = String(color.rgb).toUpperCase().replace(/^FF/, '');
        if (upper === 'FFFFFF' || upper === '') return false;
        return true;
    }
    if (color.theme != null) return true;
    if (color.indexed != null && color.indexed !== 64 && color.indexed !== 65) return true;
    if (fill.patternType && fill.patternType !== 'solid' && fill.patternType !== 'none') return true;
    return false;
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
    const Y_TOLERANCE = 2;
    let out = '';
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const items = tc.items
            .filter(it => it && typeof it.str === 'string')
            .map(it => ({
                x: it.transform[4],
                y: it.transform[5],
                str: it.str,
                width: it.width || 0,
            }))
            .sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        for (const it of items) {
            const prev = lines[lines.length - 1];
            if (prev && Math.abs(prev.y - it.y) <= Y_TOLERANCE) {
                prev.items.push(it);
            } else {
                lines.push({ y: it.y, items: [it] });
            }
        }
        for (const line of lines) {
            line.items.sort((a, b) => a.x - b.x);
            let text = '';
            let lastEnd = -Infinity;
            for (const it of line.items) {
                if (it.str === '') continue;
                const gap = it.x - lastEnd;
                if (text && gap > 1 && !text.endsWith(' ') && !it.str.startsWith(' ')) {
                    text += ' ';
                }
                text += it.str;
                lastEnd = it.x + it.width;
            }
            text = text.replace(/\s+/g, ' ').trim();
            if (text) out += text + '\n';
        }
    }
    return out;
}

async function extractDocxText(arrayBuffer) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    const res = await mammoth.extractRawText({ arrayBuffer });
    return res.value || '';
}

function cleanName(s) {
    return String(s)
        .replace(/\s+/g, ' ')
        .replace(/^[\s\d.,:;\-–—№)(]+/u, '')
        .replace(/[\s.,:;\-–—·•]+$/u, '')
        .replace(/\.{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function textToRows(text) {
    const rows = [];
    const qtyRx = /\s(\d+(?:[.,]\d+)?)(?:\s+(шт\.?|м\.?п\.?|п\.?м\.?|м2|м²|м3|м³|мм|см|м|кг|т|л|компл\.?|упак\.?|пог\.?м?\.?))?\s*$/i;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/\s+/g, ' ').trim();
        if (!line) continue;
        const m = line.match(qtyRx);
        if (m) {
            const name = cleanName(line.slice(0, m.index));
            const qty = m[1];
            if (name) { rows.push([name, qty]); continue; }
        }
        rows.push([cleanName(line), '']);
    }
    return rows;
}

const SKIP_PHRASES = [
    '№№', 'п/п',
    'всего с ндс', 'всего без ндс', 'итого с ндс', 'итого без ндс',
    'примечания:', 'примечание:',
    'заказчик:', 'подрядчик:', 'исполнитель:',
    'инн ', 'огрн', 'кпп ', 'бик ', 'окпо', 'окато', 'окогу', 'оквэд', 'р/с',
    'тел.', 'тел:', 'тел ', 'факс', 'e-mail', 'email:',
    'рассчитывается отдельно', 'считается отдельно', 'оплачивается отдельно',
    'согласовывается отдельно', 'по согласованию', 'по факту',
    'не входит в смету', 'не входит в стоимость', 'в стоимость не входит',
    'оплата производится', 'условия оплаты', 'условия поставки', 'условия доставки',
    'срок поставки', 'срок изготовления', 'гарантийный срок',
    'предоплата', 'постоплата',
    'данное предложение', 'настоящее предложение', 'коммерческое предложение действительно',
    'цены указаны', 'цены действительны', 'действительно до',
    'ст-ть мат', 'ст-сть мат', 'стоимость мат', 'стоимость работ',
    'мат-ла (руб', 'мат-лов (руб', 'материала (руб', 'материалов (руб',
    'работа (руб', 'работы (руб',
];

// Reqs lines: emails, urls, phone numbers, banking codes
const CONTACT_RE = /(@[\w.-]+\.\w+|https?:\/\/|www\.|(?:^|[^\p{L}])(инн|огрн|огрнип|кпп|бик|окпо|окато|оквэд|р\/?с|к\/?с)(?:[^\p{L}]|$)|\+7\s*\(?\d{3}|(?:^|\D)8\s*\(?\d{3}\)?\s*\d{3})/iu;

// Company-form prefixes that mark headers (ООО «...», ИП Иванов, etc.)
const COMPANY_PREFIX_RE = /^(ооо|ип|оао|зао|пао|нао|ао|нп|тсж|сро)\s*[«"„'`]/iu;

const HEADER_FIRST_WORDS = new Set([
    'смета', 'сметы',
    'наименование', 'наименования',
    'заказчик', 'заказчика',
    'подрядчик', 'подрядчика',
    'исполнитель', 'исполнителя',
    'подпись', 'подписи',
    'дата', 'утверждаю', 'согласовано', 'руководитель',
    'итого', 'всего',
    'приложение',
    'паспорт',
]);

const AMBIGUOUS_HEADERS = new Set([
    'объект', 'объекта', 'объекту',
    'адрес', 'адреса',
    'участок', 'участка',
    'основание', 'основания',
    'часть', 'части',
    'раздел', 'раздела',
    'подраздел', 'подраздела',
    'этап', 'этапа',
    'работа', 'работы', 'работ',
    'материал', 'материалы', 'материалов',
    'механизм', 'механизмы', 'механизмов',
    'оборудование',
    'стоимость',
    'ст-ть', 'ст-сть',
]);

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

    // Если две клетки сразу после названия пустые — это заголовок раздела, пропускаем.
    const next1 = cells[nameIdx + 1] || '';
    const next2 = cells[nameIdx + 2] || '';
    if (!next1 && !next2) return { name: '', qty: NaN };

    const name = cleanName(cells[nameIdx]);
    let qty = NaN;
    for (let i = nameIdx + 1; i < cells.length; i++) {
        const n = toNumber(cells[i]);
        if (!isNaN(n) && n > 0) { qty = n; break; }
    }
    if (isNaN(qty)) {
        for (let i = 0; i < nameIdx; i++) {
            const n = toNumber(cells[i]);
            if (!isNaN(n) && n > 0) { qty = n; break; }
        }
    }
    return { name, qty };
}

function skipReason(name) {
    if (!name) return 'пустое имя';
    if (!/\p{L}{3,}/u.test(name)) return 'нет слова из 3+ букв';
    if (isHiddenCategory(name)) return 'скрытая категория';
    const lower = name.toLowerCase();
    if (CONTACT_RE.test(name)) return 'контакты/реквизиты';
    if (COMPANY_PREFIX_RE.test(name.trim())) return 'название компании';
    for (const phrase of SKIP_PHRASES) if (lower.includes(phrase)) return `содержит "${phrase}"`;
    const firstWord = (lower.match(/[\p{L}\p{N}/]+/u) || [''])[0];
    if (HEADER_FIRST_WORDS.has(firstWord)) return `заголовок ("${firstWord}")`;
    if (AMBIGUOUS_HEADERS.has(firstWord)) {
        if (/:/.test(name)) return `заголовок с ":" ("${firstWord}")`;
        const rest = name.slice(firstWord.length).trim();
        if (!rest) return `одинокое слово "${firstWord}"`;
        if (/^[\d\s.,№#)(/\\_-]+$/.test(rest)) return `заголовок с номером ("${firstWord}")`;
    }
    return '';
}

function extractDdcItems(rows) {
    if (rows.length < 2) return [];
    const header = rows[0].map(h => String(h || '').trim().toLowerCase());
    const nameIdx = header.indexOf('name');
    const unitIdx = header.indexOf('unit');
    const priceIdx = header.indexOf('price_avg');
    const sectionIdx = header.indexOf('parent_section');
    const collectionIdx = header.indexOf('parent_collection');
    if (priceIdx === -1) return [];
    const sections = new Map();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const section = sectionIdx !== -1 ? String(row[sectionIdx] || '').trim() : '';
        const resName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
        const displayName = section || resName;
        if (!displayName) continue;
        if (isHiddenCategory(displayName)) continue;
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
        const all = results.flatMap(extractItems);
        const seen = new Map();
        for (const item of all) {
            const key = item.name + '|' + item.unit;
            if (!seen.has(key)) seen.set(key, item);
        }
        const catalog = Array.from(seen.values());
        for (const item of catalog) item.tokenSet = new Set(tokenize(item.name));
        console.log(`[JSON] Загружено ${catalog.length} позиций (после дедупа)`);
        return catalog;
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
        const ddcCatalog = Array.from(seen.values());
        for (const item of ddcCatalog) item.tokenSet = new Set(tokenize(item.searchText || item.name));
        console.log(`[DDC] Загружено ${ddcCatalog.length} позиций`);
        return ddcCatalog;
    }).catch(err => {
        console.warn('[DDC] Не удалось загрузить:', err.message);
        return [];
    });
}

async function searchPriceCandidates(name, limit = 6) {
    const url = `${PRICES_BACKEND}/prices/search?query=${encodeURIComponent(name)}&limit=${limit}`;
    const delays = [0, 800, 2000];
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            return (j.results || []).filter(x => x && (x.price || x.name));
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('search failed');
}

Object.assign(window, {
    APP_VERSION, FILES, DDC_URL, SKIP_WORDS, HIDDEN_CATEGORIES, VAT_RATE, MAX_RESULTS,
    PRICES_BACKEND, PRICES_CONCURRENCY, SOURCE_LABELS, KNOWN_SOURCES,
    isHiddenCategory, toNumber, parseJsonLoose, extractItems, tokenize, stemToken,
    normalizeYo, isRelevantCandidate, fuzzyFindIn, fuzzyFind, formatMoney,
    csvCell, downloadCsv, parseCsv, readXlsx, loadScript, extractPdfText,
    extractDocxText, cleanName, textToRows, isPureNumber, extractNameAndQty,
    skipReason, extractDdcItems, loadLocalCatalog, loadDdcCatalog,
    searchPriceCandidates,
});
