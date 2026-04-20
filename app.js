const works = [
    { id: 'demolition', name: 'Демонтаж старых покрытий', price: 350 },
    { id: 'walls-align', name: 'Выравнивание стен', price: 600 },
    { id: 'floor-align', name: 'Выравнивание пола (стяжка)', price: 700 },
    { id: 'ceiling', name: 'Покраска потолка', price: 250 },
    { id: 'wallpaper', name: 'Поклейка обоев', price: 300 },
    { id: 'tile', name: 'Укладка плитки', price: 1200 },
    { id: 'laminate', name: 'Укладка ламината', price: 400 },
    { id: 'electric', name: 'Электромонтаж', price: 500 },
    { id: 'plumbing', name: 'Сантехнические работы', price: 800 },
];

const materials = [
    { id: 'primer', name: 'Грунтовка', price: 80 },
    { id: 'plaster', name: 'Штукатурка', price: 250 },
    { id: 'putty', name: 'Шпаклёвка', price: 180 },
    { id: 'paint', name: 'Краска', price: 220 },
    { id: 'wallpaper-mat', name: 'Обои', price: 400 },
    { id: 'tile-mat', name: 'Плитка', price: 900 },
    { id: 'laminate-mat', name: 'Ламинат', price: 700 },
    { id: 'cable', name: 'Кабель и фурнитура', price: 150 },
    { id: 'pipes', name: 'Трубы и фитинги', price: 200 },
];

const areaInput = document.getElementById('area');
const worksList = document.getElementById('works-list');
const materialsList = document.getElementById('materials-list');
const worksTotalEl = document.getElementById('works-total');
const materialsTotalEl = document.getElementById('materials-total');
const grandTotalEl = document.getElementById('grand-total');

function formatPrice(value) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

function renderList(container, items, type) {
    container.innerHTML = items.map(item => `
        <label>
            <input type="checkbox" data-type="${type}" data-id="${item.id}" data-price="${item.price}">
            <span class="name">${item.name}</span>
            <span class="price">${item.price} ₽/м²</span>
        </label>
    `).join('');
}

function calculate() {
    const area = parseFloat(areaInput.value) || 0;
    let worksTotal = 0;
    let materialsTotal = 0;

    document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        const price = parseFloat(cb.dataset.price) * area;
        if (cb.dataset.type === 'works') worksTotal += price;
        else materialsTotal += price;
    });

    worksTotalEl.textContent = formatPrice(worksTotal);
    materialsTotalEl.textContent = formatPrice(materialsTotal);
    grandTotalEl.textContent = formatPrice(worksTotal + materialsTotal);
}

renderList(worksList, works, 'works');
renderList(materialsList, materials, 'materials');

areaInput.addEventListener('input', calculate);
document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', calculate);
});

calculate();
