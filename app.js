const API_KEY = 'c86a01de-b0b2-49cd-a8f3-cb5e8c823faa';
const ST_RABOCHIY = 's9600911';
const ST_MOZHAYSK = 's9601006';

const dateInput = document.getElementById('travel-date');
const resultsBox = document.getElementById('results');

// Устанавливаем текущую дату
dateInput.value = new Date().toISOString().split('T')[0];

function addMinutes(timeStr, mins) {
    let [h, m] = timeStr.split(':').map(Number);
    let d = new Date();
    d.setHours(h, m + mins, 0, 0);
    return d.toTimeString().substring(0, 5);
}

function getDiffMinutes(start, end) {
    let [h1, m1] = start.split(':').map(Number);
    let [h2, m2] = end.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
}

async function loadData(direction) {
    const selectedDate = dateInput.value;
    resultsBox.innerHTML = '<div class="skeleton"></div>'.repeat(5);

    try {
        const busFile = direction === 'forward' ? 'bus_29_forward.json' : 'bus_29_return.json';
        // Формируем оригинальную ссылку на Яндекс
        const yandexUrl = `https://api.rasp.yandex.net/v3.0/search/?apikey=${API_KEY}&format=json&from=${direction === 'forward' ? ST_RABOCHIY : ST_MOZHAYSK}&to=${direction === 'forward' ? ST_MOZHAYSK : ST_RABOCHIY}&date=${selectedDate}&transport_types=suburban`;
        
        // Оборачиваем её в надежный публичный CORS-прокси (AllOrigins)
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(yandexUrl)}`;

        const [busRes, trainRes] = await Promise.all([
            fetch(busFile),
            fetch(proxyUrl) // Запрашиваем данные через прокси
        ]);
        const buses = await busRes.json();
        const trainData = await trainRes.json();
        renderResults(direction, buses, trainData.segments);
    } catch (e) {
        resultsBox.innerHTML = '<div class="welcome-msg">Ошибка загрузки. Проверьте файлы JSON и ключ API.</div>';
    }
}

function renderResults(dir, buses, trains) {
    resultsBox.innerHTML = '';
    const now = new Date();
    const isToday = dateInput.value === now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().substring(0, 5);

    let cardsData = [];

    if (dir === 'forward') {
        trains.forEach(t => {
            const tDep = t.departure.split('T')[1].substring(0, 5);
            const tArr = t.arrival.split('T')[1].substring(0, 5);
            const suitableBus = buses.find(b => b.departure_mozhaysk > tArr) || buses[buses.length-1];
            const wait = getDiffMinutes(tArr, suitableBus.departure_mozhaysk);
            
            cardsData.push({
                type: 'forward',
                passed: isToday && tDep < currentTime,
                tDep, tArr,
                bDep: suitableBus.departure_mozhaysk,
                bArr: suitableBus.arrival_krasny_stan,
                wait
            });
        });
    } else {
        buses.forEach(b => {
            const suitableTrain = trains.find(t => t.departure.split('T')[1].substring(0, 5) > b.arrival_mozhaysk) || trains[trains.length-1];
            const tDep = suitableTrain.departure.split('T')[1].substring(0, 5);
            const tArr = suitableTrain.arrival.split('T')[1].substring(0, 5);
            const wait = getDiffMinutes(b.arrival_mozhaysk, tDep);

            cardsData.push({
                type: 'return',
                passed: isToday && b.departure_krasny_stan < currentTime,
                bDep: b.departure_krasny_stan,
                bArr: b.arrival_mozhaysk,
                tDep, tArr,
                homeTime: addMinutes(tArr, 15),
                wait
            });
        });
    }

    cardsData.forEach((c, idx) => {
        let statusClass = '';
        if (c.passed) statusClass = 'status-passed';
        else if (c.wait >= 15 && c.wait <= 40) statusClass = 'status-optimal';
        else if (c.wait < 15) statusClass = 'status-tight';

        const card = document.createElement('div');
        card.className = `card ${statusClass}`;
        card.id = !c.passed && !document.querySelector('.next-trip') ? 'next-trip' : '';
        if (card.id) card.classList.add('next-trip');

        card.innerHTML = c.type === 'forward' ? `
            <div class="timeline">
                <div class="step">🚆 <span class="time">${c.tDep}</span> — <span class="time">${c.tArr}</span> (Р.Поселок - Можайск)</div>
                <div class="step">🚶 Пересадка: ${c.wait} мин</div>
                <div class="step">🚌 <span class="time">${c.bDep}</span> — <span class="time">${c.bArr}</span> (МАРШРУТКА - РАДУГА)</div>
            </div>
            ${c.wait < 15 ? `<div class="badge badge-tight">⚠️ ${c.wait} мин на пересадку</div>` : ''}
            ${statusClass === 'status-optimal' ? `<div class="badge badge-optimal">✅ Оптимально</div>` : ''}
        ` : `
            <div class="timeline">
                <div class="step">🚌 <span class="time">${c.bDep}</span> — <span class="time">${c.bArr}</span> (РАДУГА - Можайск)</div>
                <div class="step">🚶 Пересадка: ${c.wait} мин</div>
                <div class="step">🚆 <span class="time">${c.tDep}</span> — <span class="time">${c.tArr}</span> (Можайск - Р.Поселок)</div>
                <div class="step">🏙️ <b>Дом: ~${c.homeTime}</b></div>
            </div>
            ${c.wait < 15 ? `<div class="badge badge-tight">⚠️ ${c.wait} мин на пересадку</div>` : ''}
        `;
        resultsBox.appendChild(card);
    });

    // Автоскролл
    const nextTrip = document.getElementById('next-trip');
    if (nextTrip) nextTrip.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Кнопка скриншота
document.getElementById('btn-share').addEventListener('click', () => {
    html2canvas(document.getElementById('capture-area')).then(canvas => {
        canvas.toBlob(blob => {
            const file = new File([blob], "schedule.png", { type: "image/png" });
            if (navigator.share) {
                navigator.share({ files: [file], title: 'Расписание' });
            }
        });
    });
});

document.getElementById('btn-forward').addEventListener('click', () => loadData('forward'));
document.getElementById('btn-return').addEventListener('click', () => loadData('return'));
