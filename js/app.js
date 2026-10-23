let categories = JSON.parse(localStorage.getItem('intersat_categories'));
if (!Array.isArray(categories)) {
    categories = [];
    localStorage.setItem('intersat_categories', JSON.stringify(categories));
}

let workers = JSON.parse(localStorage.getItem('intersat_workers'));
if (!Array.isArray(workers)) {
    workers = [];
    localStorage.setItem('intersat_workers', JSON.stringify(workers));
}

let attendanceData = JSON.parse(localStorage.getItem('intersat_attendance')) || {};
let selectedWorkerCardId = null;
let balanceCardsOpen = true;
let selectedWorkerCategory = '';

window.onload = function() {
    document.getElementById('filter-date').value = todayStr();
    setInterval(updateClock, 1000);
    updateClock();
    populateCategorySelects();
    renderDashboard();
    renderWorkersTable();
    renderCategoriesTable();
    populateSimulatorWorkers();
    document.getElementById('hours-month').value = todayStr().slice(0, 7);
    applyThemeIcon();
    renderHours();
};

function todayStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function toMin(t) {
    if (!t || t === '-' || t === 'PERMISO') return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function m2t(mins) {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function fmt12(t) {
    if (t === 'PERMISO') return 'PERMISO';
    if (!t || t === '-') return '-';
    const parts = String(t).split(':').map(Number);
    const h = parts[0], m = parts[1] || 0, sec = parts[2] || 0;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '-';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function formatDateDisplay(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
}

function secondsOfDay(t) {
    if (!t || t === '-' || t === 'PERMISO') return null;
    const [h, m, sec = 0] = String(t).split(':').map(Number);
    return h * 3600 + m * 60 + sec;
}

function hmText(h, m) { return m ? `${h} h ${m} min` : `${h} h`; }

function formatDelayText(mins) {
    if (!mins || mins <= 0) return '0 min';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

function workerExpectedMinutes(w) {
    const e = toMin(w.entryTime || '08:00');
    const x = toMin(w.exitTime || '18:00');
    if (e === null || x === null || x <= e) return 8 * 60;
    return Math.max(0, (x - e) - 120);
}

function workedMinutes(r, w) {
    if (r.statusType === 'permiso' && r.entry === 'PERMISO' && r.exit === 'PERMISO') return 0;
    
    let totalWorked = 0;
    const entryMin = toMin(r.entry);
    const lunchOutMin = toMin(r.lunch_out);
    const lunchInMin = toMin(r.lunch_in);
    const exitMin = toMin(r.exit);

    if (entryMin !== null && r.entry !== 'PERMISO') {
        let endMorning = lunchOutMin;
        if (endMorning === null && (lunchInMin !== null || r.lunch_in === 'PERMISO' || exitMin !== null || r.exit === 'PERMISO')) {
            endMorning = 720;
        }
        if (endMorning !== null && endMorning > entryMin) {
            totalWorked += (endMorning - entryMin);
        }
    }

    if (r.exit !== 'PERMISO' && exitMin !== null) {
        const startAfternoon = (lunchInMin !== null && r.lunch_in !== 'PERMISO') ? lunchInMin : 840;
        if (exitMin > startAfternoon) {
            totalWorked += (exitMin - startAfternoon);
        }
    }

    return totalWorked;
}

function calculateExpectedForDay(r, w) {
    let expected = workerExpectedMinutes(w);
    const morningPermiso = (r.entry === 'PERMISO' || r.lunch_out === 'PERMISO');
    const afternoonPermiso = (r.lunch_in === 'PERMISO' || r.exit === 'PERMISO');

    if (morningPermiso && !afternoonPermiso) expected = Math.max(0, expected - 240);
    else if (!morningPermiso && afternoonPermiso) expected = Math.max(0, expected - 240);
    else if (morningPermiso && afternoonPermiso) expected = 0;

    return expected;
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }

function seeded(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function demoRecord(dateStr, w) {
    const rnd = seeded(hashStr(w.id + '|' + dateStr));
    if (rnd() < 0.05) return null;
    const bias = ((Math.abs(hashStr(w.id)) % 5) - 2) * 30;
    const eM = toMin(w.entryTime || '08:00');
    const xM = toMin(w.exitTime || '18:00');
    const entry = eM + Math.round(rnd() * 20) - 5;
    const lo = 720 + Math.round(rnd() * 15);
    const li = lo + 105 + Math.round(rnd() * 30);
    const exit = xM + bias + Math.round(rnd() * 30) - 10;
    return { entry: m2t(entry), lunch_out: m2t(lo), lunch_in: m2t(li), exit: m2t(exit), statusType: 'normal', delayMin: 0 };
}

function computeHours(w, y, mo, demo) {
    const last = new Date(y, mo, 0).getDate(), today = todayStr();
    let days = 0, incomplete = 0, worked = 0, expectedTotal = 0;

    for (let d = 1; d <= last; d++) {
        const ds = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (ds > today) break;
        let r = (attendanceData[ds] || {})[w.id];
        const wd = new Date(y, mo - 1, d).getDay();
        if (wd === 0) continue;

        if (!r && demo) { r = demoRecord(ds, w); }
        if (!r) continue;

        const dailyExpected = calculateExpectedForDay(r, w);
        expectedTotal += dailyExpected;

        const m = workedMinutes(r, w);
        if (m === null && dailyExpected > 0) { incomplete++; continue; }
        days++; worked += (m || 0);
    }
    
    const balance = worked - expectedTotal;
    return { days, incomplete, expected: expectedTotal, worked, balance, extra: balance > 0 ? balance : 0, debt: balance < 0 ? -balance : 0 };
}

function toggleBalanceCards() {
    balanceCardsOpen = !balanceCardsOpen;
    const container = document.getElementById('workers-balance-cards-container');
    const icon = document.getElementById('balance-cards-icon');
    if (balanceCardsOpen) {
        container.style.maxHeight = container.scrollHeight + 'px';
        icon.style.transform = 'rotate(0deg)';
    } else {
        container.style.maxHeight = '0px';
        icon.style.transform = 'rotate(-180deg)';
    }
}

function filterByWorkerCard(workerId) {
    selectedWorkerCardId = (selectedWorkerCardId === workerId) ? null : workerId;
    renderHours();
}

function clearWorkerFilter() {
    selectedWorkerCardId = null;
    renderHours();
}

function renderHours() {
    const monthEl = document.getElementById('hours-month');
    if (!monthEl.value) monthEl.value = todayStr().slice(0, 7);
    const [y, mo] = monthEl.value.split('-').map(Number);
    const cat = document.getElementById('hours-category').value;
    const search = document.getElementById('hours-search').value.toLowerCase();
    const sort = document.getElementById('hours-sort').value;
    const demo = false;
    document.getElementById('hours-month-label').innerText = new Date(y, mo - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

    const clearBtn = document.getElementById('clear-worker-filter-btn');
    const filterBadge = document.getElementById('selected-worker-filter-badge');
    if (selectedWorkerCardId) {
        clearBtn.classList.remove('hidden');
        filterBadge.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
        filterBadge.classList.add('hidden');
    }

    let rows = workers
        .filter(w => (!cat || w.category === cat) && (!search || w.name.toLowerCase().includes(search) || w.ci.toLowerCase().includes(search)))
        .map(w => ({ w, ...computeHours(w, y, mo, demo) }));

    if (selectedWorkerCardId) {
        rows = rows.filter(r => r.w.id === selectedWorkerCardId);
    }

    rows.sort((a, b) => sort === 'extra' ? b.balance - a.balance : sort === 'debt' ? a.balance - b.balance : a.w.name.localeCompare(b.w.name));

    let totalExtra = 0, totalDebt = 0, countExtra = 0, countDebt = 0;
    rows.forEach(r => {
        totalExtra += r.extra;
        totalDebt += r.debt;
        if (r.balance > 0) countExtra++;
        else if (r.balance < 0) countDebt++;
    });

    document.getElementById('hours-total-extra').innerText = hmText(Math.floor(totalExtra / 60), totalExtra % 60);
    document.getElementById('hours-total-debt').innerText = hmText(Math.floor(totalDebt / 60), totalDebt % 60);
    document.getElementById('hours-count-extra').innerText = countExtra;
    document.getElementById('hours-count-debt').innerText = countDebt;

    const cardsContainer = document.getElementById('workers-balance-cards');
    const allComputedRows = workers.map(w => ({ w, ...computeHours(w, y, mo, demo) }));
    
    cardsContainer.innerHTML = allComputedRows.map(r => {
        const b = r.balance;
        const isExtra = b > 0, isDebt = b < 0, isSelected = selectedWorkerCardId === r.w.id;
        let badgeColor = isExtra ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : isDebt ? 'bg-red-50 border-red-200 text-red-800' : 'bg-slate-50 border-slate-200 text-slate-700';
        if (isSelected) badgeColor += ' ring-2 ring-brand-blue shadow-md';

        const textVal = b === 0 ? '0 h' : (isExtra ? `+ ${hmText(Math.floor(b/60), b%60)}` : `− ${hmText(Math.floor(-b/60), -b%60)}`);
        const label = isExtra ? 'Horas a favor' : isDebt ? 'Horas debidas' : 'Al día';

        return `
        <div onclick="filterByWorkerCard('${r.w.id}')" class="p-3.5 rounded-xl border ${badgeColor} flex flex-col justify-between space-y-2 cursor-pointer hover:shadow-md transition">
            <div>
                <div class="text-xs font-bold truncate flex items-center justify-between">
                    <span>${r.w.name}</span>
                    ${isSelected ? '<i class="fa-solid fa-check text-brand-blue"></i>' : ''}
                </div>
                <div class="text-[10px] opacity-75">${r.w.category}</div>
            </div>
            <div class="flex items-end justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-wider">${label}</span>
                <span class="text-sm font-bold font-mono">${textVal}</span>
            </div>
        </div>`;
    }).join('');

    const container = document.getElementById('workers-balance-cards-container');
    if (balanceCardsOpen) container.style.maxHeight = container.scrollHeight + 'px';

    const tbody = document.getElementById('hours-table-body');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">No se encontraron trabajadores.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(r => {
            const b = r.balance;
            const sign = b > 0 ? '+ ' : b < 0 ? '− ' : '';
            let badge = 'bg-slate-100 text-slate-600 border-slate-200', label = 'Al día';
            if (b > 0) { badge = 'bg-emerald-100 text-emerald-800 border-emerald-300'; label = 'Saldo a favor'; }
            else if (b < 0) { badge = 'bg-red-100 text-red-800 border-red-300'; label = 'Debe horas'; }

            const workedText = hmText(Math.floor(r.worked / 60), r.worked % 60);
            const debtText = hmText(Math.floor(r.debt / 60), r.debt % 60);

            return `
            <tr class="hover:bg-slate-50/80 transition">
                <td class="py-3 px-4 font-semibold text-slate-800">${r.w.name}<div class="text-[10px] font-normal text-slate-400">${r.w.ci}</div></td>
                <td class="py-3 px-4 text-slate-600">${r.w.category}</td>
                <td class="py-3 px-4 text-center font-medium">${r.days} días</td>
                <td class="py-3 px-4 text-center font-mono font-medium text-emerald-700">${workedText}</td>
                <td class="py-3 px-4 text-center font-mono font-medium text-red-700">${debtText}</td>
                <td class="py-3 px-4 text-center font-bold font-mono ${b > 0 ? 'text-emerald-700' : b < 0 ? 'text-red-700' : 'text-slate-500'}">${sign}${hmText(Math.floor(Math.abs(b)/60), Math.abs(b)%60)}</td>
                <td class="py-3 px-4 text-center"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge}"><span class="w-1.5 h-1.5 rounded-full mr-1.5 bg-current"></span>${label}</span></td>
            </tr>`;
        }).join('');
    }
}

function applyThemeIcon() {
    const dark = document.documentElement.classList.contains('dark');
    document.getElementById('theme-icon').className = dark ? 'fa-solid fa-sun text-brand-yellow' : 'fa-solid fa-moon';
}

function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('intersat_theme', dark ? 'dark' : 'light'); } catch (e) {}
    applyThemeIcon();
}

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').innerText = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    document.getElementById('live-date').innerText = now.toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function switchTab(tabId) {
    if (!esAdmin() && !['dashboard', 'hours'].includes(tabId)) tabId = 'dashboard';
    ['dashboard', 'hours', 'workers', 'categories', 'simulator', 'users', 'backups'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.getElementById(`nav-${t}`).classList.remove('bg-white', 'text-brand-navy', 'shadow-md', 'dark-nav-active');
        document.getElementById(`nav-${t}`).classList.add('text-slate-300');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById(`nav-${tabId}`).classList.add('bg-white', 'text-brand-navy', 'shadow-md', 'dark-nav-active');
    document.getElementById(`nav-${tabId}`).classList.remove('text-slate-300');
    if (tabId === 'hours') renderHours();
    if (tabId === 'users') renderUsers();
    if (tabId === 'backups' && typeof actualizarEstadoCopias === 'function') actualizarEstadoCopias();
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    document.getElementById('toast-message').innerText = message;
    document.getElementById('toast-icon').className = isError ? 'fa-solid fa-circle-exclamation text-red-400 text-base' : 'fa-solid fa-circle-check text-emerald-400 text-base';
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

function populateCategorySelects() {
    let filterHtml = '<option value="">Todas las Categorías</option>';
    let workerHtml = '';
    categories.forEach(cat => {
        filterHtml += `<option value="${cat.name}">${cat.name}</option>`;
        workerHtml += `<option value="${cat.name}">${cat.name}</option>`;
    });
    document.getElementById('filter-category').innerHTML = filterHtml;
    document.getElementById('worker-category').innerHTML = workerHtml;
    document.getElementById('hours-category').innerHTML = filterHtml;
}

function renderDashboard() {
    const dateStr = document.getElementById('filter-date').value || todayStr();
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoryFilter = document.getElementById('filter-category').value;
    document.getElementById('attendance-date-label').innerText = `Fecha: ${formatDateDisplay(dateStr)}`;

    const dayRecords = attendanceData[dateStr] || {};
    const tbody = document.getElementById('attendance-table-body');
    tbody.innerHTML = '';

    let [total, ontime, mild, mod, grave] = [0, 0, 0, 0, 0];
    const filtered = workers.filter(w => (w.name.toLowerCase().includes(searchTerm) || w.ci.toLowerCase().includes(searchTerm)) && (!categoryFilter || w.category === categoryFilter));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">No se encontraron trabajadores.</td></tr>`;
        updateStats(0, 0, 0, 0, 0);
        return;
    }

    filtered.forEach(w => {
        total++;
        const r = dayRecords[w.id] || { entry: '-', lunch_out: '-', lunch_in: '-', exit: '-', color: 'slate', statusType: 'normal', delayMin: 0 };
        let [badgeClass, statusText] = ['bg-slate-100 text-slate-600 border-slate-200', 'Pendiente'];
        const delayText = formatDelayText(r.delayMin || 0);

        const tienePermisoParcial = (r.entry === 'PERMISO' || r.lunch_out === 'PERMISO' || r.lunch_in === 'PERMISO' || r.exit === 'PERMISO');

        if (r.statusType === 'permiso' || tienePermisoParcial) {
            badgeClass = 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700';
            statusText = tienePermisoParcial ? 'Permiso Parcial' : 'Permiso / Justificado';
        } else if (r.color === 'emerald') { 
            badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300'; 
            statusText = `A tiempo (${fmt12(r.entry)})`; 
            ontime++; 
        } else if (r.color === 'amber') { 
            badgeClass = 'bg-amber-100 text-amber-800 border-amber-300'; 
            statusText = `Atraso Leve: ${delayText}`; 
            mild++; 
        } else if (r.color === 'orange') { 
            badgeClass = 'bg-orange-100 text-orange-800 border-orange-300'; 
            statusText = `Atraso Mod.: ${delayText}`; 
            mod++; 
        } else if (r.color === 'red') { 
            badgeClass = 'bg-red-100 text-red-800 border-red-300'; 
            statusText = `Atraso Grave: ${delayText}`; 
            grave++; 
        }

        const diaFinalizado = r.exit !== '-' && r.statusType !== 'permiso';
        const lunchOutText = r.lunch_out !== '-' ? fmt12(r.lunch_out) : (diaFinalizado ? '<span class="text-amber-600 font-medium italic text-[11px]">Pendiente</span>' : '-');
        const lunchInText = r.lunch_in !== '-' ? fmt12(r.lunch_in) : (diaFinalizado ? '<span class="text-amber-600 font-medium italic text-[11px]">Pendiente</span>' : '-');

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50/85 transition">
                <td class="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">${w.name}<div class="text-[10px] font-normal text-slate-400">${w.ci}</div></td>
                <td class="py-3 px-4 text-slate-600 dark:text-slate-300">${w.category}</td>
                <td class="py-3 px-4 text-center font-mono font-medium">${fmt12(r.entry)}</td>
                <td class="py-3 px-4 text-center font-mono font-medium">${lunchOutText}</td>
                <td class="py-3 px-4 text-center font-mono font-medium">${lunchInText}</td>
                <td class="py-3 px-4 text-center font-mono font-medium">${fmt12(r.exit)}</td>
                <td class="py-3 px-4 text-center"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}"><span class="w-1.5 h-1.5 rounded-full mr-1.5 bg-current"></span>${statusText}</span></td>
                <td class="py-3 px-4 text-center">
                    <button onclick="openAttendanceEditModal('${w.id}')" title="Editar fichaje / Permiso" class="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-brand-blue dark:bg-[#1b2c42] dark:hover:bg-[#223856] flex items-center justify-center transition mx-auto">
                        <i class="fa-solid fa-pen text-xs"></i>
                    </button>
                </td>
            </tr>`;
    });
    updateStats(total, ontime, mild, mod, grave);
}

function updateStats(t, o, mi, mo, g) {
    document.getElementById('stat-total').innerText = t;
    document.getElementById('stat-ontime').innerText = o;
    document.getElementById('stat-late-mild').innerText = mi;
    document.getElementById('stat-late-mod').innerText = mo;
    document.getElementById('stat-late-grave').innerText = g;
}

function resetTodayAttendance() {
    if (!esAdmin()) return denegarAccion();
    const dateStr = document.getElementById('filter-date').value;
    if (confirm(`¿Reiniciar registros de asistencia para ${dateStr}?`)) {
        delete attendanceData[dateStr];
        localStorage.setItem('intersat_attendance', JSON.stringify(attendanceData));
        renderDashboard();
        showToast('Registros reiniciados.');
    }
}

function renderWorkersTable() {
    const tbody = document.getElementById('workers-table-body');
    const tabs = document.getElementById('workers-category-tabs');
    const searchInput = document.getElementById('workers-search');
    if (!tbody || !tabs) return;

    const search = (searchInput?.value || '').trim().toLocaleLowerCase();
    const counts = new Map();
    workers.forEach(w => counts.set(w.category, (counts.get(w.category) || 0) + 1));

    // Construye las pestañas laterales y mantiene visible el filtro elegido.
    const knownCategories = categories.map(c => c.name);
    workers.forEach(w => { if (w.category && !knownCategories.includes(w.category)) knownCategories.push(w.category); });
    if (selectedWorkerCategory && !knownCategories.includes(selectedWorkerCategory)) selectedWorkerCategory = '';
    const tabItems = [{ name: '', label: 'Todos los trabajadores', count: workers.length },
        ...knownCategories.map(name => ({ name, label: name, count: counts.get(name) || 0 }))];
    tabs.innerHTML = tabItems.map(item => {
        const active = selectedWorkerCategory === item.name;
        return `<button type="button" onclick="selectWorkerCategory(this.dataset.category)" data-category="${escapeWorkerHtml(item.name)}" aria-pressed="${active}" class="flex shrink-0 lg:w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${active ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-slate-50 dark:bg-[#1b2735] border-slate-200 dark:border-[#2a3a4d] text-slate-700 dark:text-slate-200 hover:border-blue-400'}"><span>${escapeWorkerHtml(item.label)}</span><span class="rounded-lg px-2 py-1 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-[#2a3a4d] text-slate-600 dark:text-slate-300'}">${item.count}</span></button>`;
    }).join('');

    const totalLabel = document.getElementById('workers-category-total');
    if (totalLabel) totalLabel.textContent = `${knownCategories.length} áreas`;

    const filtered = workers.filter(w => {
        const categoryMatches = !selectedWorkerCategory || w.category === selectedWorkerCategory;
        const searchable = [w.name, w.ci, w.fingerprint, w.category].some(value => String(value || '').toLocaleLowerCase().includes(search));
        return categoryMatches && searchable;
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));

    const resultCount = document.getElementById('workers-results-count');
    if (resultCount) resultCount.textContent = `${filtered.length} de ${workers.length} trabajador${workers.length === 1 ? '' : 'es'}`;
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 px-4 text-slate-500 dark:text-slate-400"><i class="fa-solid fa-magnifying-glass mb-2 text-lg block opacity-60"></i>No se encontraron trabajadores con esos filtros.</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(w => `
        <tr class="hover:bg-slate-50 dark:hover:bg-[#1b2735] transition">
            <td class="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-200">${escapeWorkerHtml(w.ci)}</td>
            <td class="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">${escapeWorkerHtml(w.name)}</td>
            <td class="py-3 px-4"><span class="inline-block px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 rounded-full text-[10px] font-semibold">${escapeWorkerHtml(w.category)}</span></td>
            <td class="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${fmt12(w.entryTime || '08:00')} a ${fmt12(w.exitTime || '18:00')}</td>
            <td class="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">${escapeWorkerHtml(w.fingerprint || '—')}</td>
            <td class="py-3 px-4 text-center whitespace-nowrap space-x-2">
                <button onclick="editWorker(this.dataset.id)" data-id="${escapeWorkerHtml(w.id)}" title="Editar trabajador" aria-label="Editar ${escapeWorkerHtml(w.name)}" class="text-brand-blue bg-blue-50 hover:bg-blue-100 dark:bg-[#1b2c42] dark:hover:bg-[#223856] px-2.5 py-1.5 rounded-lg text-xs"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteWorker(this.dataset.id)" data-id="${escapeWorkerHtml(w.id)}" title="Eliminar trabajador" aria-label="Eliminar ${escapeWorkerHtml(w.name)}" class="text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 px-2.5 py-1.5 rounded-lg text-xs"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`).join('');
}

function selectWorkerCategory(category) {
    selectedWorkerCategory = category || '';
    renderWorkersTable();
}

function escapeWorkerHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function openWorkerModal(id = null) {
    if (!esAdmin()) return denegarAccion();
    document.getElementById('worker-modal').classList.remove('hidden');
    if (id) {
        document.getElementById('modal-title').innerText = 'Editar Trabajador';
        const w = workers.find(i => i.id === id);
        document.getElementById('worker-edit-id').value = w.id;
        document.getElementById('worker-ci').value = w.ci;
        document.getElementById('worker-name').value = w.name;
        document.getElementById('worker-category').value = w.category;
        document.getElementById('worker-entry-time').value = w.entryTime || '08:00';
        document.getElementById('worker-exit-time').value = w.exitTime || '18:00';
        document.getElementById('worker-fingerprint').value = w.fingerprint;
    } else {
        document.getElementById('modal-title').innerText = 'Registrar Trabajador';
        document.getElementById('worker-edit-id').value = '';
        document.getElementById('worker-ci').value = '';
        document.getElementById('worker-name').value = '';
        document.getElementById('worker-entry-time').value = '08:00';
        document.getElementById('worker-exit-time').value = '18:00';
        document.getElementById('worker-fingerprint').value = 'FP-' + Math.floor(1000 + Math.random() * 9000);
    }
}

function closeWorkerModal() { document.getElementById('worker-modal').classList.add('hidden'); }

function handleWorkerSubmit(e) {
    if (!esAdmin()) { if (e && e.preventDefault) e.preventDefault(); return denegarAccion(); }
    e.preventDefault();
    const id = document.getElementById('worker-edit-id').value;
    const ci = document.getElementById('worker-ci').value;
    const name = document.getElementById('worker-name').value;
    const category = document.getElementById('worker-category').value;
    const entryTime = document.getElementById('worker-entry-time').value;
    const exitTime = document.getElementById('worker-exit-time').value;
    const fingerprint = document.getElementById('worker-fingerprint').value;

    if (id) {
        workers = workers.map(w => w.id === id ? { ...w, ci, name, category, entryTime, exitTime, fingerprint } : w);
        showToast('Trabajador actualizado.');
    } else {
        workers.push({ id: Date.now().toString(), ci, name, category, entryTime, exitTime, fingerprint });
        showToast('Trabajador registrado.');
    }
    localStorage.setItem('intersat_workers', JSON.stringify(workers));
    closeWorkerModal();
    renderWorkersTable();
    renderDashboard();
    populateSimulatorWorkers();
}

function editWorker(id) { openWorkerModal(id); }
function deleteWorker(id) {
    if (!esAdmin()) return denegarAccion();
    if (confirm('¿Eliminar trabajador?')) {
        workers = workers.filter(w => w.id !== id);
        localStorage.setItem('intersat_workers', JSON.stringify(workers));
        renderWorkersTable();
        renderDashboard();
        populateSimulatorWorkers();
        showToast('Eliminado.');
    }
}

function renderCategoriesTable() {
    const tbody = document.getElementById('categories-table-body');
    if (!tbody) return;
    const search = (document.getElementById('categories-search')?.value || '').trim().toLocaleLowerCase();
    const filteredCategories = categories.filter(cat =>
        String(cat.name || '').toLocaleLowerCase().includes(search) ||
        String(cat.desc || '').toLocaleLowerCase().includes(search)
    ).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
    if (filteredCategories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 px-4 text-slate-500 dark:text-slate-400">No se encontraron áreas o categorías.</td></tr>`;
        return;
    }
    tbody.innerHTML = filteredCategories.map(cat => {
        const count = workers.filter(w => w.category === cat.name).length;
        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-[#1b2735] transition">
                <td class="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">${escapeWorkerHtml(cat.name)}</td>
                <td class="py-3 px-4 text-slate-600 dark:text-slate-300">${escapeWorkerHtml(cat.desc || 'Sin descripción')}</td>
                <td class="py-3 px-4 text-center"><span class="px-2 py-1 bg-slate-100 dark:bg-[#1b2735] text-slate-700 dark:text-slate-200 rounded-md font-semibold text-xs">${count} empleado${count === 1 ? '' : 's'}</span></td>
                <td class="py-3 px-4 text-center"><button onclick="deleteCategory(${Number(cat.id)})" title="Eliminar categoría" aria-label="Eliminar categoría ${escapeWorkerHtml(cat.name)}" class="text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 px-2.5 py-1.5 rounded-lg text-xs"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
    }).join('');
}

function handleCategorySubmit(e) {
    if (!esAdmin()) { if (e && e.preventDefault) e.preventDefault(); return denegarAccion(); }
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    const desc = document.getElementById('cat-desc').value;
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { showToast('La categoría ya existe.', true); return; }
    categories.push({ id: Date.now(), name, desc });
    localStorage.setItem('intersat_categories', JSON.stringify(categories));
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-desc').value = '';
    populateCategorySelects();
    renderCategoriesTable();
    renderWorkersTable();
    showToast('Categoría agregada.');
}

function deleteCategory(id) {
    if (!esAdmin()) return denegarAccion();
    const cat = categories.find(c => c.id === id);
    if (workers.some(w => w.category === cat.name)) { showToast('No se puede eliminar, tiene personal asignado.', true); return; }
    if (confirm('¿Eliminar categoría?')) {
        categories = categories.filter(c => c.id !== id);
        localStorage.setItem('intersat_categories', JSON.stringify(categories));
        populateCategorySelects();
        renderCategoriesTable();
        renderWorkersTable();
        showToast('Eliminada.');
    }
}

function populateSimulatorWorkers() {
    const select = document.getElementById('sim-worker-select');
    select.innerHTML = '';
    workers.forEach(w => select.innerHTML += `<option value="${w.id}">${w.name} (${w.ci})</option>`);
}

function simulateBiometricPunch() {
    if (!esAdmin()) return denegarAccion();
    const workerId = document.getElementById('sim-worker-select').value;
    const punchTime = document.getElementById('sim-time').value;
    const dateStr = document.getElementById('filter-date').value || todayStr();

    if (!workerId) return;
    const worker = workers.find(w => w.id === workerId);
    if (!attendanceData[dateStr]) attendanceData[dateStr] = {};
    if (!attendanceData[dateStr][workerId]) attendanceData[dateStr][workerId] = { entry: '-', lunch_out: '-', lunch_in: '-', exit: '-', color: 'slate', statusType: 'normal', delayMin: 0 };

    const record = attendanceData[dateStr][workerId];
    if (record.statusType === 'permiso' || record.entry === 'PERMISO' || record.exit === 'PERMISO') {
        showToast('El trabajador tiene un permiso registrado para hoy.', true);
        return;
    }

    const tMin = toMin(punchTime);
    let punchType = '';

    if (record.entry === '-') {
        punchType = 'entry';
    } else if (record.exit !== '-') {
        showToast('El trabajador ya completó todos sus marcajes del día.', true);
        return;
    } else {
        if (tMin >= 900 && record.lunch_out === '-') {
            punchType = 'exit';
        } else if (record.lunch_out === '-') {
            if (tMin < 710 || tMin > 840) {
                showToast('Fuera del rango permitido para salida a almuerzo (11:50 AM - 02:00 PM).', true);
                return;
            }
            punchType = 'lunch_out';
        } else if (record.lunch_in === '-') {
            if (tMin < 710 || tMin > 870) {
                showToast('Fuera del rango permitido para regreso de almuerzo (11:50 AM - 02:30 PM).', true);
                return;
            }
            punchType = 'lunch_in';
        } else {
            punchType = 'exit';
        }
    }

    record[punchType] = punchTime;

    if (punchType === 'entry') {
        const targetEntry = worker.entryTime || '08:00';
        const diffSeconds = secondsOfDay(punchTime) - secondsOfDay(targetEntry);
        const delay = Math.max(0, diffSeconds);
        record.delayMin = Math.ceil(delay / 60);
        if (diffSeconds <= 900) { record.color = 'emerald'; record.delayMin = 0; }
        else if (diffSeconds <= 1800) { record.color = 'amber'; }
        else if (diffSeconds <= 3600) { record.color = 'orange'; }
        else { record.color = 'red'; }
    }

    localStorage.setItem('intersat_attendance', JSON.stringify(attendanceData));
    const labels = { entry: 'Entrada', lunch_out: 'Salida Almuerzo', lunch_in: 'Regreso Almuerzo', exit: 'Salida Final' };
    showToast(`¡Huella reconocida! (${labels[punchType]} a las ${fmt12(punchTime)})`);
    switchTab('dashboard');
    renderDashboard();
}

function toggleIndividualPermiso(field) {
    if (!esAdmin()) return denegarAccion();
    const fieldMap = { entry: 'edit-entry', lunch_out: 'edit-lunch-out', lunch_in: 'edit-lunch-in', exit: 'edit-exit' };
    const checkEl = document.getElementById(`check-permiso-${field.replace('_', '-')}`);
    const inputEl = document.getElementById(fieldMap[field]);

    if (checkEl.checked) {
        inputEl.value = 'PERMISO';
        inputEl.classList.add('opacity-40', 'pointer-events-none');
    } else {
        if (inputEl.value === 'PERMISO') inputEl.value = '-';
        inputEl.classList.remove('opacity-40', 'pointer-events-none');
    }
}

function openAttendanceEditModal(workerId) {
    if (!esAdmin()) return denegarAccion();
    const dateStr = document.getElementById('filter-date').value || todayStr();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;

    if (!attendanceData[dateStr]) attendanceData[dateStr] = {};
    if (!attendanceData[dateStr][workerId]) {
        attendanceData[dateStr][workerId] = { entry: '-', lunch_out: '-', lunch_in: '-', exit: '-', color: 'slate', statusType: 'normal', delayMin: 0 };
    }

    const r = attendanceData[dateStr][workerId];

    document.getElementById('edit-worker-id').value = workerId;
    document.getElementById('edit-date-str').value = dateStr;
    document.getElementById('edit-worker-info').innerText = `${worker.name} (${worker.ci}) - Fecha: ${dateStr}`;
    
    const fields = ['entry', 'lunch_out', 'lunch_in', 'exit'];
    fields.forEach(f => {
        const inputId = `edit-${f.replace('_', '-')}`;
        const checkId = `check-permiso-${f.replace('_', '-')}`;
        const val = r[f] || '-';

        document.getElementById(inputId).value = val;
        const isP = val === 'PERMISO';
        document.getElementById(checkId).checked = isP;

        if (isP) {
            document.getElementById(inputId).classList.add('opacity-40', 'pointer-events-none');
        } else {
            document.getElementById(inputId).classList.remove('opacity-40', 'pointer-events-none');
        }
    });

    document.getElementById('attendance-edit-modal').classList.remove('hidden');
}

function closeAttendanceEditModal() {
    document.getElementById('attendance-edit-modal').classList.add('hidden');
}

function handleAttendanceEditSubmit(e) {
    if (!esAdmin()) { if (e && e.preventDefault) e.preventDefault(); return denegarAccion(); }
    e.preventDefault();
    const workerId = document.getElementById('edit-worker-id').value;
    const dateStr = document.getElementById('edit-date-str').value;

    let entry = document.getElementById('edit-entry').value.trim() || '-';
    let lunch_out = document.getElementById('edit-lunch-out').value.trim() || '-';
    let lunch_in = document.getElementById('edit-lunch-in').value.trim() || '-';
    let exit = document.getElementById('edit-exit').value.trim() || '-';

    if (!attendanceData[dateStr]) attendanceData[dateStr] = {};
    
    let color = 'slate';
    let delayMin = 0;
    let statusType = 'normal';

    const tienePermiso = (entry === 'PERMISO' || lunch_out === 'PERMISO' || lunch_in === 'PERMISO' || exit === 'PERMISO');

    if (tienePermiso) {
        color = 'blue';
        statusType = 'permiso';
    } else if (entry !== '-') {
        const worker = workers.find(w => w.id === workerId);
        const targetEntry = worker?.entryTime || '08:00';
        const diffSeconds = secondsOfDay(entry) - secondsOfDay(targetEntry);
        if (Number.isFinite(diffSeconds)) {
            delayMin = Math.ceil(Math.max(0, diffSeconds) / 60);
            if (diffSeconds <= 900) { color = 'emerald'; delayMin = 0; }
            else if (diffSeconds <= 1800) color = 'amber';
            else if (diffSeconds <= 3600) color = 'orange';
            else color = 'red';
        }
    }

    attendanceData[dateStr][workerId] = {
        entry,
        lunch_out,
        lunch_in,
        exit,
        color,
        delayMin,
        statusType
    };

    localStorage.setItem('intersat_attendance', JSON.stringify(attendanceData));
    closeAttendanceEditModal();
    renderDashboard();
    renderHours();
    showToast('Fichaje actualizado correctamente.');
}

// Función auxiliar segura con try/catch para evitar bloqueos por CORS en ficheros locales
function loadLogoImage() {
    // Usa el logo incrustado en js/logo.js (funciona abriendo el archivo directo o con Live Server)
    if (typeof LOGO_INTERSAT_PNG !== 'undefined') return Promise.resolve(LOGO_INTERSAT_PNG);
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.src = './images/logo.png';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

// Dibuja un emblema vectorizado por defecto si la imagen no se puede cargar
function drawDefaultLogoSymbol(doc, x, y, size) {
    doc.setFillColor(11, 37, 69);
    doc.circle(x + size/2, y + size/2, size/2, 'F');
    doc.setFillColor(255, 107, 0);
    doc.circle(x + size/2, y + size/2, size/3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('I', x + size/2 - 1.5, y + size/2 + 4.5);
}

// ================= EXPORTAR PDF REPORTES DIARIOS =================
async function exportDailyPDF() {
    const dateStr = document.getElementById('filter-date').value || todayStr();
    const [y, m, d] = dateStr.split('-');
    const fechaTxt = `${d}/${m}/${y}`;

    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('No se pudo cargar la librería jsPDF.', true);
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const dayRecords = attendanceData[dateStr] || {};

        const logoImg = await loadLogoImage();
        const logoSize = 22;
        const logoX = 14;
        const logoY = 10;

        try {
            if (logoImg) {
                doc.addImage(logoImg, 'PNG', logoX, logoY, logoSize, logoSize);
            } else {
                drawDefaultLogoSymbol(doc, logoX, logoY, logoSize);
            }
        } catch (imgErr) {
            drawDefaultLogoSymbol(doc, logoX, logoY, logoSize);
        }

        // Título e Información Institucional
        const textX = logoX + logoSize + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(11, 37, 69);
        doc.text('INTERSAT LOS ANDES', textX, 17);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 107, 0);
        doc.text('TECNOLOGÍA Y TELECOMUNICACIONES A SU ALCANCE', textX, 22);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('Sede Principal - La Grita, Estado Táchira', textX, 27);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(11, 37, 69);
        doc.text('CONTROL DIARIO DE FICHAJE BIOMÉTRICO', pageW - 14, 17, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Fecha del Reporte: ${fechaTxt}`, pageW - 14, 23, { align: 'right' });

        doc.setDrawColor(255, 107, 0);
        doc.setLineWidth(0.8);
        doc.line(14, 35, pageW - 14, 35);

        let counts = { total: 0, ontime: 0, late: 0, permiso: 0 };
        const statusStyle = {
            emerald: { fillColor: [209, 250, 229], textColor: [6, 95, 70] },
            amber:   { fillColor: [254, 243, 199], textColor: [146, 64, 14] },
            orange:  { fillColor: [255, 237, 213], textColor: [154, 52, 18] },
            red:     { fillColor: [254, 226, 226], textColor: [153, 27, 27] },
            blue:    { fillColor: [219, 234, 254], textColor: [30, 64, 175] },
            slate:   { fillColor: [241, 245, 249], textColor: [71, 85, 105] }
        };

        const rows = workers.map(w => {
            counts.total++;
            const r = dayRecords[w.id] || { entry: '-', lunch_out: '-', lunch_in: '-', exit: '-', color: 'slate', statusType: 'normal', delayMin: 0 };
            let status = 'Pendiente';
            const delayText = formatDelayText(r.delayMin || 0);

            const tienePermisoParcial = (r.entry === 'PERMISO' || r.lunch_out === 'PERMISO' || r.lunch_in === 'PERMISO' || r.exit === 'PERMISO');

            if (r.statusType === 'permiso' || tienePermisoParcial) {
                status = tienePermisoParcial ? 'Permiso Parcial' : 'Permiso / Justificado';
                counts.permiso++;
            } else if (r.color === 'emerald') { 
                status = `A tiempo (${fmt12(r.entry)})`; 
                counts.ontime++; 
            } else if (r.color === 'amber' || r.color === 'orange' || r.color === 'red') { 
                status = `Atraso: ${delayText}`; 
                counts.late++; 
            }

            return {
                color: statusStyle[r.color] ? r.color : 'slate',
                cells: [`${w.name}\n${w.ci}`, w.category, fmt12(r.entry), fmt12(r.lunch_out), fmt12(r.lunch_in), fmt12(r.exit), status]
            };
        });

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, 38, pageW - 28, 11, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
        doc.text(`TOTAL PERSONAL: ${counts.total}  |  A TIEMPO: ${counts.ontime}  |  CON ATRASO: ${counts.late}  |  CON PERMISO: ${counts.permiso}`, 20, 45);

        doc.autoTable({
            startY: 52,
            margin: { left: 14, right: 14, bottom: 16 },
            head: [['Trabajador / C.I.', 'Categoría / Área', 'Entrada', 'Salida Almuerzo', 'Regreso Almuerzo', 'Salida Final', 'Estado / Asistencia']],
            body: rows.map(r => r.cells),
            theme: 'striped',
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [30, 41, 59], valign: 'middle' },
            headStyles: { fillColor: [11, 37, 69], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { halign: 'left', fontStyle: 'bold', cellWidth: 55 },
                1: { halign: 'left', cellWidth: 50 },
                2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' },
                6: { halign: 'center', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 6) {
                    Object.assign(data.cell.styles, statusStyle[rows[data.row.index].color]);
                }
            },
            didDrawPage: () => {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
                doc.text('Intersat Los Andes - Sistema de Control Biométrico', 14, pageH - 8);
                doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - 14, pageH - 8, { align: 'right' });
            }
        });

        doc.save(`Intersat_Asistencia_${y}-${m}-${d}.pdf`);
        showToast('PDF descargado correctamente.');
    } catch (err) {
        console.error(err);
        showToast('Error al generar el PDF.', true);
    }
}

// ================= EXPORTAR PDF CONTROL DE HORAS MENSUAL =================
async function exportHoursPDF() {
    const monthVal = document.getElementById('hours-month').value || todayStr().slice(0, 7);
    const [y, mo] = monthVal.split('-').map(Number);
    const monthName = new Date(y, mo - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('Error al cargar la librería jsPDF.', true);
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        const logoImg = await loadLogoImage();
        const logoSize = 22;
        const logoX = 14;
        const logoY = 10;

        try {
            if (logoImg) {
                doc.addImage(logoImg, 'PNG', logoX, logoY, logoSize, logoSize);
            } else {
                drawDefaultLogoSymbol(doc, logoX, logoY, logoSize);
            }
        } catch (imgErr) {
            drawDefaultLogoSymbol(doc, logoX, logoY, logoSize);
        }

        const textX = logoX + logoSize + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(11, 37, 69);
        doc.text('INTERSAT LOS ANDES', textX, 17);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 107, 0);
        doc.text('REPORTE CONSOLIDADO MENSUAL DE CONTROL DE HORAS', textX, 22);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('Sede Principal - La Grita, Estado Táchira', textX, 27);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(11, 37, 69);
        doc.text(`MES: ${monthName.toUpperCase()}`, pageW - 14, 17, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Fecha de emisión: ${todayStr()}`, pageW - 14, 23, { align: 'right' });

        doc.setDrawColor(255, 107, 0);
        doc.setLineWidth(0.8);
        doc.line(14, 35, pageW - 14, 35);

        let totalWorkedAll = 0;
        let totalDebtAll = 0;

        const rows = workers.map(w => {
            const res = computeHours(w, y, mo, false);
            const b = res.balance;
            totalWorkedAll += res.worked;
            totalDebtAll += res.debt;

            const balanceTxt = b === 0 ? '0 h' : (b > 0 ? `+${hmText(Math.floor(b/60), b%60)}` : `-${hmText(Math.floor(-b/60), -b%60)}`);
            const estado = b > 0 ? 'Saldo a favor' : b < 0 ? 'Debe horas' : 'Al día';
            return [`${w.name}\n${w.ci}`, w.category, `${res.days} días`, hmText(Math.floor(res.worked/60), res.worked%60), hmText(Math.floor(res.debt/60), res.debt%60), balanceTxt, estado];
        });

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, 38, pageW - 28, 11, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
        doc.text(`HORAS TRABAJADAS TOTALES: ${hmText(Math.floor(totalWorkedAll/60), totalWorkedAll%60)}   |   HORAS DEBIDAS TOTALES: ${hmText(Math.floor(totalDebtAll/60), totalDebtAll%60)}`, 20, 45);

        doc.autoTable({
            startY: 52,
            margin: { left: 14, right: 14, bottom: 16 },
            head: [['Trabajador / C.I.', 'Categoría / Área', 'Días Asistidos', 'Horas Trabajadas', 'Horas Debidas', 'Balance Neto', 'Estado Final']],
            body: rows,
            theme: 'striped',
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [30, 41, 59], valign: 'middle' },
            headStyles: { fillColor: [11, 37, 69], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { halign: 'left', fontStyle: 'bold', cellWidth: 55 },
                1: { halign: 'left', cellWidth: 50 },
                2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center', fontStyle: 'bold' },
                6: { halign: 'center', fontStyle: 'bold' }
            },
            didDrawPage: () => {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
                doc.text('Intersat Los Andes - Sistema de Control Biométrico', 14, pageH - 8);
                doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - 14, pageH - 8, { align: 'right' });
            }
        });

        doc.save(`Intersat_Control_Horas_${y}_${mo}.pdf`);
        showToast('PDF de Control de Horas descargado.');
    } catch (err) {
        console.error(err);
        showToast('Error al generar el PDF.', true);
    }
}