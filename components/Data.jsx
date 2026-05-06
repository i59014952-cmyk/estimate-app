// Data.jsx — фейковые но правдоподобные данные для сметы «Сосны»

const ESTIMATE = {
  code: "EST-0024",
  title: "Сосны",
  subtitle: "Резиденция · Деревянный каркас · 284 м²",
  revision: "R3",
  date: "24.04.2026",
  estimator: "А. Меньшов",
  area: 284,
  location: "Д. Горки, 14 соток",
  stage: "Смета / R3",
  budget: {
    materials: 4_280_500,
    works: 3_120_000,
    overhead: 612_000,
    vat: 1_602_500,
    total: 9_615_000,
  },
  stats: [
    { k: "Каталог", v: "2 078", u: "позиций", d: "+128 за неделю", dir: "up" },
    { k: "Своя база", v: "787", u: "материалов", d: "Обновл. 2 мин назад" },
    { k: "DDC цены", v: "1 291", u: "записей", d: "Синх. активна", live: true },
    { k: "Маржа проекта", v: "18.4", u: "%", d: "−2.1 п.п.", dir: "down" },
  ],
};

const SECTIONS = [
  {
    id: "s1", name: "Земляные работы и фундамент", code: "01", total: 1_240_000, expanded: true,
    rows: [
      { n: "01.01", name: "Разработка котлована экскаватором", unit: "м³", qty: 86, price: 720, src: "Норматив ГЭСН", srcKind: "norm" },
      { n: "01.02", name: "Монолитная плита УШП h=300", unit: "м²", qty: 142, price: 6900, src: "КП «БазисБетон»", srcKind: "kp" },
      { n: "01.03", name: "Гидроизоляция Икопал ЭКП", unit: "м²", qty: 158, price: 480, src: "Каталог KH", srcKind: "kh" },
      { n: "01.04", name: "Утеплитель XPS 100 мм", unit: "м²", qty: 142, price: 720, src: "Своя база", srcKind: "own" },
    ],
  },
  {
    id: "s2", name: "Стены и каркас", code: "02", total: 3_870_000, expanded: true,
    rows: [
      { n: "02.01", name: "Брус клеёный 200×200, лиственница", unit: "м³", qty: 22.4, price: 34800, src: "Каталог KH", srcKind: "kh", hot: true },
      { n: "02.02", name: "Узлы соединений (металл)", unit: "компл.", qty: 48, price: 4200, src: "Подрядчик «Линия»", srcKind: "pod" },
      { n: "02.03", name: "Контурная теплоизоляция Rockwool 200", unit: "м²", qty: 248, price: 880, src: "Своя база", srcKind: "own" },
      { n: "02.04", name: "Пароизоляция Изоспан А", unit: "м²", qty: 248, price: 95, src: "Каталог KH", srcKind: "kh" },
      { n: "02.05", name: "Планкен скошенный, сосна термо", unit: "м²", qty: 196, price: 2150, src: "Каталог KH", srcKind: "kh" },
    ],
  },
  {
    id: "s3", name: "Кровля", code: "03", total: 980_000, expanded: false,
    rows: [
      { n: "03.01", name: "Стропильная система", unit: "м³", qty: 8.2, price: 28000, src: "Своя база", srcKind: "own" },
      { n: "03.02", name: "Фальцевая кровля Zn-Mg", unit: "м²", qty: 168, price: 2400, src: "Каталог KH", srcKind: "kh" },
    ],
  },
  {
    id: "s4", name: "Инженерия", code: "04", total: 1_510_000, expanded: false,
    rows: [
      { n: "04.01", name: "Тёплый пол водяной", unit: "м²", qty: 142, price: 1800, src: "Подрядчик «Тепло+»", srcKind: "pod" },
      { n: "04.02", name: "Вентиляция с рекуперацией", unit: "компл.", qty: 1, price: 420000, src: "КП «Айрвент»", srcKind: "kp" },
    ],
  },
  {
    id: "s5", name: "Отделка и полы", code: "05", total: 2_015_000, expanded: false,
    rows: [
      { n: "05.01", name: "Паркет дуб массив, селект", unit: "м²", qty: 124, price: 6900, src: "Каталог KH", srcKind: "kh" },
      { n: "05.02", name: "OSB-3 плита 12 мм", unit: "лист", qty: 86, price: 1280, src: "Каталог KH", srcKind: "kh" },
    ],
  },
];

const POPULAR_MATERIALS = [
  { name: "Брус клеёный 200×200", note: "лиственница", price: 34_800, unit: "м³", color: "#C8A57A" },
  { name: "Планкен скошенный", note: "сосна термо", price: 2_150, unit: "м²", color: "#7C4A2A" },
  { name: "Паркет дуб массив", note: "селект", price: 6_900, unit: "м²", color: "#5C3A1E" },
  { name: "OSB-3 плита 12 мм", note: "лист", price: 1_280, unit: "лист", color: "#E0C898" },
  { name: "Rockwool Лайт Баттс", note: "100 мм", price: 1_180, unit: "м²", color: "#8C7E4F" },
  { name: "Изоспан А", note: "паропроницаемая", price: 95, unit: "м²", color: "#9DA98C" },
];

const HISTORY = [
  { who: "А. Меньшов", what: "создал ревизию R3", when: "сегодня · 14:31", live: true },
  { who: "Д. Ковров", what: "согласовал R2", when: "вчера · 18:04" },
  { who: "Система", what: "обновила цены DDC", when: "23 апр · 09:15", live: true },
  { who: "Е. Тарасов", what: "добавил подрядчика «Линия»", when: "22 апр · 16:40" },
];

const OBJECTS = [
  { code: "EST-0024", name: "Сосны", loc: "Д. Горки", area: 284, stage: "R3", budget: 9_615_000, status: "active" },
  { code: "EST-0023", name: "Берёзовая 12", loc: "Истра", area: 196, stage: "R5", budget: 7_120_000, status: "approved" },
  { code: "EST-0022", name: "Озеро", loc: "Завидово", area: 412, stage: "R2", budget: 14_280_000, status: "active" },
  { code: "EST-0021", name: "Кедр", loc: "Дмитров", area: 168, stage: "R7", budget: 5_840_000, status: "build" },
  { code: "EST-0020", name: "Долина", loc: "Тверь", area: 308, stage: "R1", budget: 11_200_000, status: "draft" },
];

const NAV = [
  { id: "objects", label: "Объекты", icon: "house", count: 18 },
  { id: "materials", label: "Материалы", icon: "cube", count: 2_078 },
  { id: "database", label: "База данных", icon: "layers" },
  { id: "contractors", label: "Подрядчики", icon: "users", count: 47 },
  { id: "calendar", label: "Календарь", icon: "cal" },
];

const NAV2 = [
  { id: "templates", label: "Шаблоны", icon: "tpl" },
];

const fmt = (n, sep=" ") => Number(n).toLocaleString("ru-RU").replace(/\u00A0/g, sep);
const fmtMoney = (n) => fmt(Math.round(n)) + " ₽";

Object.assign(window, { ESTIMATE, SECTIONS, POPULAR_MATERIALS, HISTORY, OBJECTS, NAV, NAV2, fmt, fmtMoney });
