"use strict";
(function exposeAppVersion(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniAppVersion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    // BEGIN VERSION POLICY
    const APP_VERSION = '2.17.9';
    const CHANGELOG = [
        { version: '2.17.9', date: '2026-10-22', title: 'Personal recibido de SA', items: ['Revisa en Conexiones el personal recibido de SA antes de aplicarlo.', 'Descarta pendientes sin cambiar el personal ya guardado.', 'Consulta los pendientes actualizados con controles legibles en pantallas móviles.'] },
        { version: '2.17.8', date: '2026-10-21', title: 'Actualizar ahora renueva la aplicación', items: ['El botón Actualizar ahora descarga los archivos nuevos y reinicia la aplicación conservando tus datos.', 'La actualización muestra su progreso y permite reintentar si falla la conexión.'] },
        { version: '2.17.7', date: '2026-10-21', title: 'Conexiones más claras', items: ['Un solo botón Vincular: eliges SA por internet, SA directo u otro Mini.', 'La cabecera tiene un solo acceso a tu cuenta y los títulos son los mismos en todas las pantallas.', 'Respaldos, vínculos y cuenta usan los mismos nombres y el mismo estilo.', 'Si Google no está disponible, la cuenta lo explica sin un botón inactivo.'] },
        { "version": "2.17.6", "date": "2026-10-21", "title": "Actualizaciones y novedades confiables", "items": ["Vuelve a recibir avisos de actualización con las novedades de cada entrega.", "Envía el salario diario y el puesto de cada día junto con la asistencia.", "Las transferencias detenidas informan un error para que puedas reintentarlas."] },
        { version: '2.17.5', date: '2026-10-20', title: 'Novedades y actualizaciones a tu ritmo', items: ['Consulta las mejoras de cada versión desde Ajustes.', 'Elige cuándo actualizar sin interrumpir tu trabajo.', 'Busca actualizaciones y revisa sus novedades antes de instalarlas.'] },
        { version: '2.17.4', date: '2026-10-19', title: 'Conexiones y acceso', items: ['Mejoras al conectar dispositivos y acceder con Google.'] }
    ];
    const CHECK_INTERVAL_MS = 30 * 60 * 1000;
    function validVersion(value) {
        return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
            && value.split('.').every(part => Number.isSafeInteger(Number(part)));
    }
    function compareVersions(a, b) {
        if (!validVersion(a) || !validVersion(b))
            return 0;
        const left = a.split('.').map(Number), right = b.split('.').map(Number);
        for (let i = 0; i < 3; i++)
            if (left[i] !== right[i])
                return left[i] > right[i] ? 1 : -1;
        return 0;
    }
    function getUnseenReleases(lastSeen, changelog = CHANGELOG) {
        if (!validVersion(lastSeen))
            return [];
        return changelog.filter(release => compareVersions(release.version, lastSeen) > 0)
            .sort((a, b) => compareVersions(b.version, a.version));
    }
    function shouldPromptForUpdate(input) {
        return input.hasController && validVersion(input.currentVersion) && validVersion(input.availableVersion)
            && compareVersions(input.availableVersion, input.currentVersion) > 0
            && (!validVersion(input.lastPromptedVersion) || compareVersions(input.availableVersion, input.lastPromptedVersion) > 0);
    }
    function shouldCheckForUpdate(input) {
        return input.online !== false && Number.isFinite(input.now)
            && (!Number.isFinite(input.lastCheckedAt) || input.lastCheckedAt <= 0 || input.now < input.lastCheckedAt || input.now - input.lastCheckedAt >= CHECK_INTERVAL_MS);
    }
    function isReleaseManifest(value) {
        var _a;
        if (!value || typeof value !== 'object')
            return false;
        const data = value;
        return validVersion(data.version) && Array.isArray(data.changelog) && data.changelog.length > 0 && data.changelog.length <= 100
            && ((_a = data.changelog[0]) === null || _a === void 0 ? void 0 : _a.version) === data.version && data.changelog.every((entry, index) => validVersion(entry === null || entry === void 0 ? void 0 : entry.version) && (index === 0 || compareVersions(data.changelog[index - 1].version, entry.version) > 0)
            && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && typeof entry.title === 'string' && entry.title.length > 0 && entry.title.length <= 200
            && Array.isArray(entry.items) && entry.items.length > 0 && entry.items.length <= 30
            && entry.items.every(item => typeof item === 'string' && item.length > 0 && item.length <= 500));
    }
    function getReleaseErrors(previous, current, runtimeChanged) {
        if (!isReleaseManifest(current) || !current.changelog.every(entry => entry.title.trim() && entry.items.every(item => item.trim())))
            return ['El catálogo debe contener una versión válida y novedades con título e ítems no vacíos.'];
        if (!runtimeChanged || previous === null)
            return [];
        if (!isReleaseManifest(previous))
            return ['No se pudo validar el catálogo de la versión base.'];
        const errors = [];
        if (compareVersions(current.version, previous.version) <= 0)
            errors.push(`Los cambios de la aplicación requieren una versión mayor que ${previous.version}.`);
        if (JSON.stringify(current.changelog[0].items.map(item => item.trim())) === JSON.stringify(previous.changelog[0].items.map(item => item.trim())))
            errors.push('Añade novedades propias de esta entrega; no reutilices las de la versión anterior.');
        if (previous.changelog.some(entry => !current.changelog.some(saved => saved.version === entry.version && JSON.stringify(saved) === JSON.stringify(entry))))
            errors.push('Conserva el historial publicado y añade las novedades arriba.');
        return errors;
    }
    return { APP_VERSION, CHANGELOG, CHECK_INTERVAL_MS, getReleaseErrors, compareVersions, getUnseenReleases, shouldPromptForUpdate, shouldCheckForUpdate, isReleaseManifest };
    // END VERSION POLICY
});
