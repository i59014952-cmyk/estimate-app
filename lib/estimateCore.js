// estimateCore.js — pure logic extracted from app.js, no DOM access.
// Exposed via window.* so JSX modules can read them.

const APP_VERSION = 'v2026-04-28-kub-house';
console.log(`%c Kub·House ${APP_VERSION} `, 'background:#5b5bf1;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px');

const FILES = ['one.json', 'two.json', 'th.json'];
const DDC_URL = 'https://raw.githubusercontent.com/datadrivenconstruction/OpenConstructionEstimate-DDC-CWICR/main/RU___DDC_CWICR/DDC_CWICR_RU_STPETERSBURG_Catalog.csv';
// Встроенный демо-каталог (one/two/th.json + DDC) ОТКЛЮЧЁН: сайт отдаётся
// заказчику «чистым», база наполняется только его собственными загруженными
// прайсами. Чтобы вернуть встроенный каталог, поставь true (и верни данные в
// one/two/th.json — они сохранены в истории git).
const BUILTIN_CATALOG_ENABLED = false;
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
const VAT_RATE = 0.22;
const MAX_RESULTS = 20;
const PRICES_BACKEND = 'https://api.sme-ta.ru';
const PRICES_CONCURRENCY = 3;
const SOURCE_LABELS = {
    local: 'Своя база',
    ddc: 'DDC база',
    kolorit: 'Колорит',
    krepmast: 'Крепмаст',
    voltkin: 'Вольткин',
    moi: 'Мои Инструменты',
    lemana: 'Лемана ПРО',
    store: 'Магазин',
    manual: 'Вручную',
    none: '—',
};
const KNOWN_SOURCES = new Set(['kolorit', 'krepmast', 'voltkin', 'moi', 'lemana']);

function isHiddenCategory(name) {
    const normalized = String(name)
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
        .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
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
        if (!qStems.some(s => allTokens[i].startsWith(s))) continue;
        if (ADJECTIVE_ENDING.test(allTokens[i])) continue;
        matchIdx = i;
        break;
    }
    if (matchIdx === -1) return false;
    for (let i = 0; i < matchIdx; i++) {
        const t = allTokens[i];
        if (CONNECTOR_WORDS.has(t)) return false;
        if (!ADJECTIVE_ENDING.test(t)) return false;
    }
    return true;
}

// Оценка соответствия товара запросу для ранжирования кандидатов
// («лучшее совпадение — первым»): чем больше слов запроса найдено в названии
// товара (по основам слов) и чем меньше «лишних» слов — тем выше балл.
function candidateScore(query, candidate) {
    const qTokens = Array.from(new Set(tokenize(normalizeYo(query))));
    if (qTokens.length === 0) return 0;
    const cTokens = (normalizeYo(candidate && candidate.name || '').match(/\p{L}+|\d+/gu)) || [];
    if (cTokens.length === 0) return 0;
    let matched = 0;
    for (const q of qTokens) {
        const stem = stemToken(q);
        if (cTokens.some(w => w.startsWith(stem) || (w.length >= 4 && stem.startsWith(w.slice(0, 4))))) matched++;
    }
    const coverage = matched / qTokens.length;            // доля слов запроса, найденных в названии
    const extra = Math.max(0, cTokens.length - matched);  // «лишние» слова (шум)
    return coverage * 100 - Math.min(extra, 20) * 0.6;
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
    const required = Math.min(2, qTokens.length);
    return bestHits >= required ? best : null;
}

function fuzzyFind(query, catalog, ddcCatalog) {
    const qTokens = Array.from(new Set(tokenize(query)));
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
                        if (/[:：;；]\s*$/.test(v)) endsColon = true;
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
    if (nameIdx === -1) return { name: '', qty: NaN, unit: '' };

    // Заголовок раздела: справа от названия все клетки пустые (две сразу после — частный случай).
    let hasAnyRight = false;
    let qty = NaN;
    let unit = '';
    for (let i = nameIdx + 1; i < cells.length; i++) {
        const c = cells[i];
        if (c) hasAnyRight = true;
        const n = toNumber(c);
        if (!isNaN(n) && n > 0 && isNaN(qty)) qty = n;
        // Единица измерения: короткая клетка с буквами, не число.
        if (!unit && c && c.length <= 12 && /\p{L}/u.test(c) && isNaN(toNumber(c))) unit = c;
    }
    if (!hasAnyRight) return { name: '', qty: NaN, unit: '' };

    // Если справа от названия вообще нет числа — это тоже заголовок (нет ни количества, ни цены).
    if (isNaN(qty)) return { name: '', qty: NaN, unit: '' };

    const name = cleanName(cells[nameIdx]);
    return { name, qty, unit };
}

// Классификация позиции: «работа» или «материал».
// Приоритет сигналов (по убыванию надёжности):
//   1) слово-работа в названии (монтаж, укладка…) → работа;
//   2) единица работы (час/смена) → работа;
//   3) штучная единица товара (шт/компл/рул/лист…) без слова-работы → материал
//      (так «Розетка, шт» внутри секции «Работа» всё равно станет материалом);
//   4) контекст раздела файла («Работы»/«Материалы»);
//   5) иначе — материал (их большинство).
const WORK_NAME_RE = /(монтаж(?!н)|демонтаж|установк|укладк|устройств|сборк|разборк|оштукатур|штукатурн|шпакл|шпатл|окрас|покрас|малярн|облицов|кладк|бетонир|армир|сверлен|бурен|стяжк|выравниван|утеплен|погрузк|разгрузк|пусконал|наладк|подключен|замер|обработк|распиловк|сварочн|сварк|работа|работы|работ\b|услуг|доработк|разработк|проливк|уплотнен|изготовлен|креплен|прогрев|вибрирован|перемещен|засыпк|обмаз|складирован|раскрой|планировк|рыхлен|трамбов|отсыпк|подсыпк|выемк|штроблен|долблен|пробивк|резк|заливк|заделк|герметизац|затирк|расшивк|врезк|шлифов|фрезеров|опрессовк|омоноличиван|распалуб|очистк|расчистк|корчев|разметк|устр-во|устр\.|нанесен|грунтован)/i;
const WORK_UNIT_RE = /^(час|часы|ч|чел|чел[.\-/]?час|нормо[.\-]?час|смена|смены|смен|м\/ч|трудозатрат)/i;
// Тара/вес/объём — почти всегда товар, перебивает «рабочее» слово в названии
// (например «Смесь штукатурная … мешок» — это материал, а не работа).
const MATERIAL_UNIT_RE = /^(мешок|меш|ведро|вед|кан|канистр|банк|бутыл|бут|пачк|пач|тюбик|рулон|рул|лист|упак|уп|кг|кгс|гр|г|тонн|т|литр|л|мл)\.?$/i;
const GOODS_UNIT_RE = /^(шт|компл|комплект|к-т|кт|пар|пара|набор)\.?$/i;

function classifyCategory(name, unit, sectionCat) {
    const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
    const n = normalizeYo(String(name || ''));
    if (u && WORK_UNIT_RE.test(u)) return 'work';        // час/смена — точно работа
    if (u && MATERIAL_UNIT_RE.test(u)) return 'material'; // мешок/кг/лист — точно материал
    // Слово-работа в НАЧАЛЕ названия («Монтаж…», «Установка…») — это услуга.
    const firstWord = (n.trim().split(/\s+/)[0]) || '';
    if (WORK_NAME_RE.test(firstWord)) return 'work';
    // Штучная/комплектная единица товара → материал, даже если «рабочее» слово
    // встречается в описании («Розетка … скрытой установки, шт» — это материал).
    if (u && GOODS_UNIT_RE.test(u)) return 'material';
    if (WORK_NAME_RE.test(n)) return 'work';
    if (sectionCat === 'work' || sectionCat === 'material') return sectionCat;
    return 'material';
}

function classifyItem(name, unit) {
    return classifyCategory(name, unit, null);
}

// Наценка для строки: построчное переопределение row.markup важнее, иначе
// берётся % по категории (markup.work / markup.material). Возвращает проценты.
function markupPctFor(row, markup) {
    if (row && row.markup != null && isFinite(Number(row.markup))) return Number(row.markup);
    const cat = row && row.category === 'work' ? 'work' : 'material';
    const m = markup && isFinite(Number(markup[cat])) ? Number(markup[cat]) : 0;
    return m;
}

// Клиентская цена за единицу = себестоимость × (1 + наценка%), округление до копеек.
function clientUnitPrice(row, markup) {
    const base = Number(row && row.unitPrice) || 0;
    const pct = markupPctFor(row, markup);
    return Math.round(base * (1 + pct / 100) * 100) / 100;
}

// Определяет категорию по тексту заголовка-раздела файла («Работы», «Материалы»).
// Возвращает null для неоднозначных («Работы и материалы») и для шапки таблицы
// («Наименование работ», «Ст-ть мат-ла») — там есть служебные слова колонок.
function detectSectionCategory(text) {
    const t = normalizeYo(String(text || '')).toLowerCase();
    if (/наименован|ед\.?\s*изм|кол-?во|расценк|стоимост|ст-ть|ст-сть|№/.test(t)) return null;
    const hasWork = /работ/.test(t);
    const hasMat = /материал/.test(t);
    if (hasWork && !hasMat) return 'work';
    if (hasMat && !hasWork) return 'material';
    return null;
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
    if (!BUILTIN_CATALOG_ENABLED) return Promise.resolve([]);
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
    if (!BUILTIN_CATALOG_ENABLED) return Promise.resolve([]);
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

async function searchBackendCandidates(name, limit = 6) {
    const url = `${PRICES_BACKEND}/prices/search?query=${encodeURIComponent(name)}&limit=${limit}`;
    const delays = [0, 800, 2000];
    const TIMEOUT_MS = 15000;
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const r = await fetch(url, { signal: ctrl.signal });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            return (j.results || []).filter(x => x && (x.price || x.name));
        } catch (err) {
            lastErr = err.name === 'AbortError' ? new Error(`timeout ${TIMEOUT_MS}ms`) : err;
        } finally {
            clearTimeout(t);
        }
    }
    throw lastErr || new Error('search failed');
}

// Поиск по пользовательским магазинам (вкладка «Магазины»), помеченным «Активен».
// Best-effort: ошибки/таймауты отдельных магазинов не валят общий поиск.
async function searchActiveStores(name, limit = 6) {
    let stores = [];
    try { stores = JSON.parse(localStorage.getItem('kh-stores-v1') || '[]'); } catch { return []; }
    const active = (Array.isArray(stores) ? stores : []).filter(s => s && s.active && s.url);
    if (!active.length) return [];
    const TIMEOUT_MS = 15000;
    const lists = await Promise.all(active.map(async (s) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            let u = `${PRICES_BACKEND}/auto/search?store=${encodeURIComponent(s.url)}&query=${encodeURIComponent(name)}&limit=${limit}`;
            if (s.searchUrl) u += `&search_url=${encodeURIComponent(s.searchUrl)}`;
            const r = await fetch(u, { signal: ctrl.signal });
            if (!r.ok) return [];
            const j = await r.json();
            return (j.results || []).filter(x => x && x.price).map(x => ({
                name: x.name, price: x.price, unit: x.unit || null, url: x.url || '',
                city: 'store', source: 'store', sourceLabel: s.name || s.host || 'Магазин',
            }));
        } catch { return []; }
        finally { clearTimeout(t); }
    }));
    return lists.flat();
}

// Поиск по Лемана ПРО — ТОЛЬКО из кэша (cache_only). Сам парсинг идёт фоновой
// пакетной задачей (submitLemanaBatch -> /lemana/jobs), которая наполняет кэш.
// Поэтому здесь не блокируемся: либо мгновенный ответ из кэша, либо пусто.
async function searchLemana(name, limit = 6) {
    const TIMEOUT_MS = 12000;  // только кэш -> ответ мгновенный, ждать долго незачем
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const u = `${PRICES_BACKEND}/lemana/search?query=${encodeURIComponent(name)}&limit=${limit}&cache_only=1`;
        const r = await fetch(u, { signal: ctrl.signal });
        if (!r.ok) return [];
        const j = await r.json();
        return (j.results || []).filter(x => x && x.price).map(x => ({
            name: x.name, price: x.price, unit: x.unit || null, url: x.url || '',
            city: 'lemana', source: 'lemana', sourceLabel: 'Лемана ПРО',
        }));
    } catch { return []; }
    finally { clearTimeout(t); }
}

// Фоновая пакетная загрузка Лемана ПРО: отправляем все названия позиций одной
// задачей на бэкенд (/lemana/jobs). Бэкенд парсит их в фоне (долго, но не
// блокирует UI) и наполняет кэш, который потом мгновенно отдаёт searchLemana.
// Fire-and-forget; повторный вызов по тем же названиям дешёв (бэкенд кэширует).
async function submitLemanaBatch(names, city = 'kazan') {
    const uniq = Array.from(new Set(
        (names || []).map(s => String(s == null ? '' : s).trim()).filter(s => s.length >= 2)
    ));
    if (!uniq.length) return [];
    const jobs = [];   // [{ jobId, names: [...] }] — для отслеживания прогресса
    for (let i = 0; i < uniq.length; i += 50) {   // /lemana/jobs принимает до 50 запросов
        const chunk = uniq.slice(i, i + 50);
        try {
            const r = await fetch(`${PRICES_BACKEND}/lemana/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queries: chunk, city, limit_per_query: 2 }),
            });
            const j = await r.json();
            if (j && j.job_id) jobs.push({ jobId: j.job_id, names: chunk });
        } catch (_) { /* fire-and-forget: фоновая загрузка не должна мешать UI */ }
    }
    return jobs;
}

// Статус фоновой Lemana-задачи: { status, done_count, total, current_query }.
async function getLemanaJobStatus(jobId) {
    try {
        const r = await fetch(`${PRICES_BACKEND}/lemana/jobs/${encodeURIComponent(jobId)}`);
        if (!r.ok) return null;
        return await r.json();
    } catch (_) { return null; }
}

// Объединяет результаты Лемана ПРО, встроенного поиска (Petrovich) и магазинов.
// Лемана ищется ВСЕГДА и идёт первой; остальные источники — по возможности.
// Все источники best-effort: сбой/таймаут любого из них (в т.ч. Petrovich) не
// должен ронять поиск по позиции — позиция «не найдена» только если ничего не
// вернул ни один источник.
async function searchPriceCandidates(name, limit = 6) {
    const [lemana, base, stores] = await Promise.all([
        searchLemana(name, limit).catch(() => []),
        searchBackendCandidates(name, limit).catch(() => []),
        searchActiveStores(name, limit).catch(() => []),
    ]);
    const merged = [];
    const seen = new Set();
    for (const s of [...lemana, ...base, ...stores]) {
        const key = s.url || s.name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(s);
    }
    // Ранжируем по совпадению с запросом: лучшее совпадение — первым (именно
    // его подставит автоподбор). При равном балле сохраняется порядок
    // источников (сортировка стабильная).
    merged.sort((a, b) => candidateScore(name, b) - candidateScore(name, a));
    return merged;
}

// --- Robust price-sheet extractor -------------------------------------------
// Pulls only real line items (name / unit / qty / unit-price) out of an XLSX/CSV
// grid regardless of the КП design: scans for the real header row, prefers the
// unit-price column over "Сумма", and drops totals/footer rows (ИТОГО, НДС,
// Срок поставки, Условия оплаты, Гарантия, "С уважением", etc.).
const KH_NAME_RE = /наимен|name|позиц|товар|материал|работ|услуг|описан|продукт|ассортимент/;
const KH_UNIT_RE = /^ед\b|unit|един|изм|^е\.?и\.?$|^е\/и$/;
const KH_PRICE_RE = /цена|price|стоим|тариф|расц|руб|₽/;
const KH_SUM_RE = /сумм|итог|всего|total/;
const KH_QTY_RE = /кол-?в|кол\.|колич|объ[её]м|q-?ty|quantity|amount|^кол$/;
const KH_NUMERIC_NAME_RE = /^[\d.,\s\-]+$/;
const KH_SKIP_NAME_RE = /^(итог|всего|подытог|total|subtotal|ндс|сумма)|^№$|^п\/п$|^(срок|услови|гаранти|доставк|оплат|реквизит|менеджер|примечани|комментар)|^с уважением|коммерческое предложение/i;

function khIsTotalsName(name) {
    return KH_SKIP_NAME_RE.test(String(name == null ? '' : name).trim());
}

function khExtractPriceRows(rows) {
    if (!rows || !rows.length) return [];
    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
    const num = (s) => parseFloat(String(s == null ? '' : s).replace(/\s+/g, '').replace(/[^\d,.\-]/g, '').replace(',', '.')) || 0;

    // 1) Find a real header row: has a name column AND at least one of unit/qty/price.
    let H = null;
    const limit = Math.min(rows.length, 40);
    for (let i = 0; i < limit; i++) {
        const cells = (rows[i] || []).map(norm);
        const nIdx = cells.findIndex(h => KH_NAME_RE.test(h));
        if (nIdx === -1) continue;
        const uIdx = cells.findIndex(h => KH_UNIT_RE.test(h));
        const qIdx = cells.findIndex(h => KH_QTY_RE.test(h));
        let pIdx = -1;
        for (let k = 0; k < cells.length; k++) { if (KH_PRICE_RE.test(cells[k]) && !KH_SUM_RE.test(cells[k])) { pIdx = k; break; } }
        if (pIdx === -1) for (let k = 0; k < cells.length; k++) { if (KH_PRICE_RE.test(cells[k])) { pIdx = k; break; } }
        if (uIdx === -1 && qIdx === -1 && pIdx === -1) continue;
        H = { hRow: i, nIdx, uIdx, qIdx, pIdx }; break;
    }

    const out = [];
    const accept = (name) => name && name.length >= 2 && !KH_NUMERIC_NAME_RE.test(name) && !KH_SKIP_NAME_RE.test(name);

    if (H) {
        const { hRow, nIdx, uIdx, qIdx, pIdx } = H;
        for (let i = hRow + 1; i < rows.length; i++) {
            const r = rows[i]; if (!r) continue;
            const c = r.map(x => x == null ? '' : String(x).trim());
            const name = (c[nIdx] || '').trim();
            if (!accept(name)) continue;
            out.push({
                name,
                unit: uIdx !== -1 ? (c[uIdx] || '') : '',
                qty: qIdx !== -1 ? (num(c[qIdx]) || 1) : 1,
                unitPrice: pIdx !== -1 ? num(c[pIdx]) : 0,
            });
        }
        return out;
    }

    // 2) No header: name = column with the most long text cells; price = a positive
    //    number in the row (excluding consecutive-integer index columns).
    const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
    let nameCol = -1, best = 0;
    for (let col = 0; col < width; col++) {
        let score = 0;
        for (const r of rows) { const v = r && r[col] != null ? String(r[col]).trim() : ''; if (v.length >= 4 && !KH_NUMERIC_NAME_RE.test(v)) score++; }
        if (score > best) { best = score; nameCol = col; }
    }
    if (nameCol === -1) return out;
    for (const r of rows) {
        if (!r) continue;
        const c = r.map(x => x == null ? '' : String(x).trim());
        const name = (c[nameCol] || '').trim();
        if (!accept(name)) continue;
        let unit = '', price = 0;
        for (let k = 0; k < c.length; k++) {
            if (k === nameCol) continue;
            const v = c[k]; if (!v) continue;
            if (!unit && /[а-яёa-z]/i.test(v) && !/\d/.test(v) && v.length <= 10) { unit = v; continue; }
            const n = num(v); if (n > price) price = n;
        }
        out.push({ name, unit, qty: 1, unitPrice: price });
    }
    return out;
}

Object.assign(window, {
    APP_VERSION, FILES, DDC_URL, SKIP_WORDS, HIDDEN_CATEGORIES, VAT_RATE, MAX_RESULTS,
    PRICES_BACKEND, PRICES_CONCURRENCY, SOURCE_LABELS, KNOWN_SOURCES,
    isHiddenCategory, toNumber, parseJsonLoose, extractItems, tokenize, stemToken,
    normalizeYo, isRelevantCandidate, fuzzyFindIn, fuzzyFind, formatMoney,
    csvCell, downloadCsv, parseCsv, readXlsx, loadScript, extractPdfText,
    extractDocxText, cleanName, textToRows, isPureNumber, extractNameAndQty,
    skipReason, extractDdcItems, loadLocalCatalog, loadDdcCatalog,
    searchPriceCandidates, searchActiveStores, searchBackendCandidates, searchLemana, submitLemanaBatch, getLemanaJobStatus,
    classifyItem, classifyCategory, detectSectionCategory, markupPctFor, clientUnitPrice,
    khExtractPriceRows, khIsTotalsName,
});
