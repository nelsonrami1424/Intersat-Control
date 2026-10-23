/* Copias de seguridad locales para la versión de sede principal.
   Nota: al ejecutarse como archivo HTML, la copia semanal solo puede generarse
   mientras el programa/navegador se está utilizando; no puede escribir archivos
   silenciosamente en el disco cuando está cerrado. */
(function () {
    'use strict';
    const DATA_KEYS = ['intersat_categories', 'intersat_workers', 'intersat_attendance', 'intersat_users', 'intersat_theme'];
    const HISTORY_KEY = 'intersat_backup_weekly_history_v1';
    const MAX_WEEKLY_COPIES = 12;

    function safeParse(value, fallback) {
        try { return value === null ? fallback : JSON.parse(value); } catch (_) { return fallback; }
    }
    function getMondayKey(date = new Date()) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function createPayload(type) {
        const data = {};
        DATA_KEYS.forEach(key => {
            const raw = localStorage.getItem(key);
            data[key] = raw === null ? null : safeParse(raw, null);
        });
        return {
            format: 'INTERSAT_BACKUP', version: 1, type: type || 'manual',
            createdAt: new Date().toISOString(), weekStarting: getMondayKey(),
            app: 'Control Biométrico de Asistencia - Intersat Los Andes', data
        };
    }
    function downloadPayload(payload, prefix) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date(payload.createdAt || Date.now()).toISOString().replace(/[:.]/g, '-');
        a.href = url; a.download = `${prefix || 'intersat-respaldo'}-${stamp}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    function readHistory() {
        const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
        return Array.isArray(history) ? history : [];
    }
    function weeklyBackupIfDue() {
        try {
            if (typeof window.esAdmin !== 'function' || !window.esAdmin()) return;
            const now = new Date();
            const week = getMondayKey(now);
            const history = readHistory();
            // Prioriza el cierre de semana (viernes-domingo). Si se omitió el fin de semana
            // y ya pasaron 8 días desde el último respaldo, genera uno de recuperación.
            const latestDate = history[0] && history[0].createdAt ? new Date(history[0].createdAt) : null;
            const daysSinceLatest = latestDate ? (now.getTime() - latestDate.getTime()) / 86400000 : Infinity;
            const isWeekendWindow = now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0;
            if (!isWeekendWindow && daysSinceLatest < 8) return;
            if (history.some(item => item && item.weekStarting === week && item.payload)) return;
            const payload = createPayload('automatico-semanal');
            history.unshift({ weekStarting: week, createdAt: payload.createdAt, payload });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_WEEKLY_COPIES)));
            actualizarEstadoCopias();
            if (typeof window.showToast === 'function') window.showToast('Copia semanal creada en este navegador. Descárgala y guárdala fuera del equipo.');
        } catch (e) {
            console.error('No se pudo crear la copia semanal local', e);
            if (typeof window.showToast === 'function') window.showToast('No se pudo crear la copia semanal. Crea una copia manual.', true);
        }
    }
    window.crearCopiaManual = function () {
        if (typeof window.esAdmin !== 'function' || !window.esAdmin()) return window.denegarAccion?.();
        try { downloadPayload(createPayload('manual'), 'intersat-respaldo-manual'); if (window.showToast) window.showToast('Copia manual preparada para descargar. Guárdala en un lugar seguro.'); }
        catch (e) { console.error(e); if (window.showToast) window.showToast('No se pudo crear la copia manual.', true); }
    };
    window.descargarUltimaCopiaAutomatica = function () {
        if (typeof window.esAdmin !== 'function' || !window.esAdmin()) return window.denegarAccion?.();
        const latest = readHistory()[0];
        if (!latest || !latest.payload) { if (window.showToast) window.showToast('Todavía no existe una copia semanal en este navegador.', true); return; }
        downloadPayload(latest.payload, 'intersat-respaldo-semanal');
        if (window.showToast) window.showToast('Copia semanal descargada. Guárdala fuera del equipo.');
    };
    window.actualizarEstadoCopias = function () {
        if (typeof window.esAdmin !== 'function' || !window.esAdmin()) return;
        const el = document.getElementById('backup-weekly-status');
        if (!el) return;
        const latest = readHistory()[0];
        el.textContent = latest ? `Última copia interna: ${new Date(latest.createdAt).toLocaleString('es-VE')} · ${readHistory().length} guardadas` : 'Aún no se ha creado una copia semanal en este navegador.';
    };
    function validPayload(p) {
        if (!p || p.format !== 'INTERSAT_BACKUP' || p.version !== 1 || !p.data || typeof p.data !== 'object') return false;
        if (!Object.prototype.hasOwnProperty.call(p.data, 'intersat_workers') || !Object.prototype.hasOwnProperty.call(p.data, 'intersat_categories') || !Object.prototype.hasOwnProperty.call(p.data, 'intersat_attendance')) return false;
        if (p.data.intersat_workers !== null && !Array.isArray(p.data.intersat_workers)) return false;
        if (p.data.intersat_categories !== null && !Array.isArray(p.data.intersat_categories)) return false;
        if (p.data.intersat_attendance !== null && (typeof p.data.intersat_attendance !== 'object' || Array.isArray(p.data.intersat_attendance))) return false;
        if (p.data.intersat_users !== null && p.data.intersat_users !== undefined && !Array.isArray(p.data.intersat_users)) return false;
        return true;
    }
    window.restaurarCopiaSeleccionada = async function () {
        if (typeof window.esAdmin !== 'function' || !window.esAdmin()) return window.denegarAccion?.();
        const input = document.getElementById('backup-file-input');
        const file = input && input.files && input.files[0];
        if (!file) { if (window.showToast) window.showToast('Selecciona primero un archivo JSON de respaldo.', true); return; }
        let payload;
        try { payload = JSON.parse(await file.text()); }
        catch (_) { if (window.showToast) window.showToast('El archivo no es un JSON válido.', true); return; }
        if (!validPayload(payload)) { if (window.showToast) window.showToast('El archivo no parece una copia válida de este programa o tiene una estructura incompatible.', true); return; }
        const when = payload.createdAt ? new Date(payload.createdAt).toLocaleString('es-VE') : 'fecha desconocida';
        if (!confirm(`La copia es del ${when}. Restaurarla REEMPLAZARÁ los datos actuales de este navegador. Antes se descargará una copia de emergencia. ¿Deseas continuar?`)) return;
        try {
            downloadPayload(createPayload('emergencia-antes-de-restaurar'), 'intersat-emergencia-antes-de-restaurar');
            ['intersat_categories', 'intersat_workers', 'intersat_attendance', 'intersat_users', 'intersat_theme'].forEach(key => {
                if (Object.prototype.hasOwnProperty.call(payload.data, key) && payload.data[key] !== null) localStorage.setItem(key, JSON.stringify(payload.data[key]));
                else localStorage.removeItem(key);
            });
            alert('Copia restaurada. El programa se reiniciará para cargar los datos recuperados. Si la copia incluye usuarios, inicia sesión con una cuenta que exista en ese respaldo.');
            location.reload();
        } catch (e) {
            console.error('Error al restaurar respaldo', e);
            if (window.showToast) window.showToast('No se pudo completar la restauración; revisa el espacio disponible del navegador.', true);
        }
    };
    // Comprobar al iniciar y periódicamente: si el administrador inicia sesión después,
    // se crea la copia semanal cuando el navegador siga abierto.
    function check() { weeklyBackupIfDue(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
    else check();
    setInterval(check, 30000);
})();
