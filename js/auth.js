// ===== Inicio de sesión y roles: Administrador (control total) / Solo lectura (ver y descargar PDF) =====
(function () {
    const USERS_KEY = 'intersat_users', SESSION_KEY = 'intersat_session';
    const ROLES = { admin: 'Administrador', lector: 'Solo lectura' };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // SHA-256 (JS puro: funciona también sin HTTPS)
    function sha256(ascii) {
        function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
        var mw = Math.pow(2, 32), result = '', words = [], bl = ascii.length * 8, hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, comp = {}, i, j;
        for (var c = 2; pc < 64; c++) { if (!comp[c]) { for (i = 0; i < 313; i += c) comp[i] = c; hash[pc] = (Math.pow(c, .5) * mw) | 0; k[pc++] = (Math.pow(c, 1 / 3) * mw) | 0; } }
        ascii += '\x80'; while (ascii.length % 64 - 56) ascii += '\x00';
        for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
        words[words.length] = ((bl / mw) | 0); words[words.length] = bl;
        for (j = 0; j < words.length;) {
            var w = words.slice(j, j += 16), old = hash; hash = hash.slice(0, 8);
            for (i = 0; i < 64; i++) {
                var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
                var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
                var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(t1 + t2) | 0].concat(hash); hash[4] = (hash[4] + t1) | 0;
            }
            for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
        }
        for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
        return result;
    }
    const salt = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
    const hashPass = (pass, s) => { let h = sha256(unescape(encodeURIComponent(s + ':' + pass))); for (let i = 0; i < 2000; i++) h = sha256(h + s); return h; };
    const getUsers = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (e) { return []; } };
    const saveUsers = u => localStorage.setItem(USERS_KEY, JSON.stringify(u));
    const current = () => { const u = sessionStorage.getItem(SESSION_KEY); return getUsers().find(x => x.user === u) || null; };
    window.__sha256 = sha256;
    window.usuarioActual = current;
    window.esAdmin = () => { const u = current(); return !!u && u.role === 'admin'; };
    window.denegarAccion = () => showToast('Acción no permitida: tu usuario es de solo lectura.', true);

    // Ocultar controles de edición al usuario de solo lectura
    const st = document.createElement('style');
    st.textContent = `body.rol-lector :is([onclick*="openWorkerModal"],[onclick*="editWorker"],[onclick*="deleteWorker"],[onclick*="deleteCategory"],[onclick*="openAttendanceEditModal"],[onclick*="resetTodayAttendance"],#nav-workers,#nav-categories,#nav-device,#nav-users,#tab-workers,#tab-categories,#tab-device,#tab-users){display:none !important}`;
    document.head.appendChild(st);

    const INPUT = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-[#2a3a4d] bg-slate-50 dark:bg-[#1b2735] text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-orange';
    const BTN = 'px-4 py-2.5 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-md transition';

    // ---------- Pantalla de acceso ----------
    let fails = 0, lockUntil = 0;
    function mostrarLogin() {
        const primera = getUsers().length === 0;
        const el = document.createElement('div');
        el.id = 'auth-screen';
        el.className = 'fixed inset-0 z-[100] bg-brand-navy flex items-center justify-center p-4 overflow-y-auto';
        el.innerHTML = `
        <form id="auth-form" class="w-full max-w-sm bg-white dark:bg-[#17212d] rounded-3xl shadow-2xl p-8 space-y-4 border-t-4 border-brand-orange">
            <div class="flex flex-col items-center text-center space-y-2">
                <img src="${typeof LOGO_INTERSAT_PNG !== 'undefined' ? LOGO_INTERSAT_PNG : ''}" alt="Intersat Los Andes" class="w-24 h-24 rounded-full">
                <h1 class="text-lg font-extrabold text-slate-900 dark:text-slate-100">INTERSAT LOS ANDES</h1>
                <p class="text-xs text-slate-500 dark:text-slate-400">${primera ? 'Primer uso: crea la cuenta del administrador' : 'Control de asistencia · Inicia sesión'}</p>
            </div>
            ${primera ? `<input id="a-name" class="${INPUT}" placeholder="Nombre completo" autocomplete="name">` : ''}
            <input id="a-user" class="${INPUT}" placeholder="Usuario" autocomplete="username" required>
            <div class="relative">
                <input id="a-pass" type="password" class="${INPUT} pr-11" placeholder="Clave${primera ? ' (mínimo 8 caracteres)' : ''}" autocomplete="${primera ? 'new-password' : 'current-password'}" required>
                <button type="button" id="a-eye" tabindex="-1" class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600" title="Mostrar u ocultar"><i class="fa-solid fa-eye"></i></button>
            </div>
            ${primera ? `<input id="a-pass2" type="password" class="${INPUT}" placeholder="Repite la clave" autocomplete="new-password" required>` : ''}
            <div id="a-err" class="text-xs font-semibold text-red-500 min-h-[16px]"></div>
            <button class="${BTN} w-full">${primera ? 'Crear administrador y entrar' : 'Ingresar'}</button>
        </form>`;
        document.body.appendChild(el);
        const $ = id => el.querySelector('#' + id), err = m => { $('a-err').textContent = m; };
        $('a-eye').onclick = () => { const p = $('a-pass'); p.type = p.type === 'password' ? 'text' : 'password'; };
        $('a-user').focus();
        $('auth-form').onsubmit = ev => {
            ev.preventDefault();
            const user = $('a-user').value.trim().toLowerCase(), pass = $('a-pass').value;
            if (primera) {
                const name = $('a-name').value.trim() || user;
                if (!/^[a-z0-9._-]{3,}$/.test(user)) return err('Usuario: mínimo 3 caracteres (letras, números, punto o guion).');
                if (pass.length < 8) return err('La clave debe tener al menos 8 caracteres.');
                if (pass !== $('a-pass2').value) return err('Las claves no coinciden.');
                const s = salt(); saveUsers([{ user, name, role: 'admin', salt: s, hash: hashPass(pass, s) }]);
            } else {
                if (Date.now() < lockUntil) return err(`Demasiados intentos. Espera ${Math.ceil((lockUntil - Date.now()) / 1000)} s.`);
                const u = getUsers().find(x => x.user === user);
                if (!u || u.hash !== hashPass(pass, u.salt)) {
                    if (++fails >= 5) { fails = 0; lockUntil = Date.now() + 30000; }
                    return err('Usuario o clave incorrectos.');
                }
            }
            sessionStorage.setItem(SESSION_KEY, user);
            el.remove(); aplicarSesion();
        };
    }

    // ---------- Sesión activa ----------
    function aplicarSesion() {
        const u = current(); if (!u) return;
        document.body.classList.remove('rol-admin', 'rol-lector');
        document.body.classList.add(u.role === 'admin' ? 'rol-admin' : 'rol-lector');
        document.getElementById('user-badge')?.remove();
        document.getElementById('theme-toggle').insertAdjacentHTML('beforebegin', `
            <div id="user-badge" class="flex items-center space-x-2 text-right">
                <div class="hidden sm:block"><div class="text-xs font-black text-white">${esc(u.name)}</div>
                <div class="text-[10px] font-bold text-brand-orange uppercase">${ROLES[u.role]}</div></div>
                <button onclick="cerrarSesion()" title="Cerrar sesión" class="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition flex-shrink-0 border border-white/10"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>`);
        switchTab('dashboard');
    }
    window.cerrarSesion = () => { sessionStorage.removeItem(SESSION_KEY); location.reload(); };

    // ---------- Pestaña "Usuarios" (solo administrador) ----------
    function montarPestanaUsuarios() {
        const nav = document.getElementById('nav-device').cloneNode(true);
        nav.id = 'nav-users'; nav.setAttribute('onclick', "switchTab('users')");
        nav.innerHTML = '<i class="fa-solid fa-user-shield mr-1.5"></i> Usuarios';
        document.getElementById('nav-device').after(nav);
        const CARD = 'bg-white dark:bg-[#17212d] rounded-2xl border border-slate-200 dark:border-[#2a3a4d] shadow-sm';
        document.querySelector('main').insertAdjacentHTML('beforeend', `
        <section id="tab-users" class="space-y-6 hidden no-print">
            <div class="${CARD} p-5">
                <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 mb-3">Crear usuario</h2>
                <form id="user-form" class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                    <input id="u-name" class="${INPUT}" placeholder="Nombre completo" required>
                    <input id="u-user" class="${INPUT}" placeholder="Usuario" required>
                    <input id="u-pass" type="password" class="${INPUT}" placeholder="Clave (mín. 8)" autocomplete="new-password" required>
                    <select id="u-role" class="${INPUT}"><option value="lector">Solo lectura</option><option value="admin">Administrador</option></select>
                    <button class="${BTN}">Crear usuario</button>
                </form>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-3"><b>Administrador:</b> agrega, edita y elimina todo. <b>Solo lectura:</b> consulta el dashboard y el control de horas y descarga los PDF.</p>
            </div>
            <div class="${CARD} overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left text-xs">
                <thead><tr class="bg-slate-100 dark:bg-[#223041] text-[11px] font-semibold uppercase text-slate-700 dark:text-slate-300"><th class="py-3 px-4">Nombre</th><th class="py-3 px-4">Usuario</th><th class="py-3 px-4">Rol</th><th class="py-3 px-4 text-center">Acciones</th></tr></thead>
                <tbody id="users-body" class="divide-y divide-slate-100 dark:divide-[#2a3a4d] text-slate-800 dark:text-slate-100"></tbody>
            </table></div></div>
        </section>`);
        document.getElementById('user-form').onsubmit = ev => {
            ev.preventDefault(); if (!esAdmin()) return denegarAccion();
            const g = id => document.getElementById(id).value, users = getUsers(), user = g('u-user').trim().toLowerCase();
            if (!/^[a-z0-9._-]{3,}$/.test(user)) return showToast('Usuario: mínimo 3 caracteres (letras, números, punto o guion).', true);
            if (users.some(x => x.user === user)) return showToast('Ese usuario ya existe.', true);
            if (g('u-pass').length < 8) return showToast('La clave debe tener al menos 8 caracteres.', true);
            const s = salt(); users.push({ user, name: g('u-name').trim(), role: g('u-role'), salt: s, hash: hashPass(g('u-pass'), s) });
            saveUsers(users); ev.target.reset(); renderUsers(); showToast('Usuario creado.');
        };
    }
    window.renderUsers = () => {
        if (!esAdmin()) return;
        const me = current().user;
        document.getElementById('users-body').innerHTML = getUsers().map(u => `
            <tr><td class="py-3 px-4 font-bold">${esc(u.name)}</td><td class="py-3 px-4 font-mono">${esc(u.user)}${u.user === me ? ' <span class="text-[10px] text-slate-400">(tú)</span>' : ''}</td>
            <td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${u.role === 'admin' ? 'bg-orange-100 text-orange-800' : 'bg-blue-50 text-brand-blue'}">${ROLES[u.role]}</span></td>
            <td class="py-3 px-4 text-center space-x-2">
                <button onclick="cambiarClave('${esc(u.user)}')" class="text-brand-blue bg-blue-50 px-2 py-1 rounded-lg text-xs" title="Cambiar clave"><i class="fa-solid fa-key"></i></button>
                ${u.user === me ? '' : `<button onclick="eliminarUsuario('${esc(u.user)}')" class="text-red-500 bg-red-50 px-2 py-1 rounded-lg text-xs" title="Eliminar"><i class="fa-solid fa-trash"></i></button>`}
            </td></tr>`).join('');
    };
    window.cambiarClave = user => {
        if (!esAdmin()) return denegarAccion();
        const p = prompt(`Nueva clave para "${user}" (mínimo 8 caracteres):`);
        if (p === null) return;
        if (p.length < 8) return showToast('La clave debe tener al menos 8 caracteres.', true);
        const users = getUsers(), u = users.find(x => x.user === user); u.salt = salt(); u.hash = hashPass(p, u.salt);
        saveUsers(users); showToast('Clave actualizada.');
    };
    window.eliminarUsuario = user => {
        if (!esAdmin()) return denegarAccion();
        const users = getUsers(), u = users.find(x => x.user === user);
        if (u.role === 'admin' && users.filter(x => x.role === 'admin').length === 1) return showToast('Debe quedar al menos un administrador.', true);
        if (confirm(`¿Eliminar al usuario "${user}"?`)) { saveUsers(users.filter(x => x.user !== user)); renderUsers(); showToast('Usuario eliminado.'); }
    };

    montarPestanaUsuarios();

    // ---------- Pestaña de copias de seguridad (solo administrador) ----------
    const backupNav = document.createElement('button');
    backupNav.id = 'nav-backups';
    backupNav.type = 'button';
    backupNav.className = 'px-4 py-2 text-xs font-bold rounded-xl transition-all text-slate-300 hover:text-white hover:bg-white/10';
    backupNav.setAttribute('onclick', "switchTab('backups')");
    backupNav.innerHTML = '<i class="fa-solid fa-shield-halved mr-1.5"></i> Seguridad / Copias';
    document.getElementById('nav-users').after(backupNav);
    document.querySelector('main').insertAdjacentHTML('beforeend', `
      <section id="tab-backups" class="space-y-6 hidden no-print">
        <div class="bg-white dark:bg-[#17212d] rounded-2xl border border-slate-200 dark:border-[#2a3a4d] shadow-sm p-5 md:p-6">
          <div class="flex items-start gap-3 mb-5"><div class="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center"><i class="fa-solid fa-shield-halved text-xl"></i></div><div><h2 class="text-base font-black text-slate-900 dark:text-slate-100">Seguridad y copias de respaldo</h2><p class="text-xs text-slate-600 dark:text-slate-400 mt-1">Respalda y recupera trabajadores, áreas, marcaciones, usuarios y configuración del programa.</p></div></div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="rounded-xl border border-slate-200 dark:border-[#2a3a4d] p-4"><h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2"><i class="fa-solid fa-calendar-week mr-2 text-blue-500"></i>Copia automática semanal</h3><p class="text-xs text-slate-600 dark:text-slate-400 mb-3">El sistema guarda un respaldo interno al entrar el administrador, una vez por semana, mientras el programa se esté utilizando en este navegador.</p><p id="backup-weekly-status" class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Consultando estado…</p><button type="button" onclick="descargarUltimaCopiaAutomatica()" class="w-full px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-download mr-2"></i>Descargar última copia semanal</button></div>
            <div class="rounded-xl border border-slate-200 dark:border-[#2a3a4d] p-4"><h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2"><i class="fa-solid fa-file-circle-plus mr-2 text-emerald-500"></i>Copia manual</h3><p class="text-xs text-slate-600 dark:text-slate-400 mb-3">Descarga ahora un archivo con todos los datos necesarios para recuperar el sistema.</p><button type="button" onclick="crearCopiaManual()" class="w-full px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-download mr-2"></i>Crear y descargar copia</button></div>
          </div>
        </div>
        <div class="bg-white dark:bg-[#17212d] rounded-2xl border border-slate-200 dark:border-[#2a3a4d] shadow-sm p-5 md:p-6">
          <h3 class="font-black text-sm text-slate-900 dark:text-slate-100 mb-2"><i class="fa-solid fa-clock-rotate-left mr-2 text-brand-orange"></i>Restaurar una copia de seguridad</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-4">Selecciona un archivo de respaldo JSON creado por este programa. La restauración reemplazará los datos actuales de este navegador; antes se descargará una copia de emergencia de los datos actuales.</p>
          <label for="backup-file-input" class="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Archivo de respaldo (.json)</label>
          <input id="backup-file-input" type="file" accept=".json,application/json" class="block w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-200 dark:file:bg-[#223041] file:text-slate-800 dark:file:text-slate-100">
          <button type="button" onclick="restaurarCopiaSeleccionada()" class="mt-3 px-4 py-2.5 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-upload mr-2"></i>Validar y restaurar copia</button>
          <div class="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200"><b>Importante:</b> conserva también una copia descargada en una ubicación segura autorizada por Intersat. Las copias contienen datos laborales y usuarios; no las compartas por canales públicos.</div>
        </div>
      </section>`);

    if (current()) aplicarSesion(); else mostrarLogin();
})();
