"use strict";
// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.Tutorials` (browser global consumed by index.html).
// Catalog of the recorded tutorials (tests/tutorials/<id>.mjs records them)
// plus pure helpers for the player: captions, step bar, WebVTT, staleness.
(function exposeTutorials(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.Tutorials = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTutorialsModule() {
    const BASE = './tutorials/';
    const OFFLINE_CACHE = 'mini-tutorials-v1';
    const STEP_PREFIX = /^(\d+)\s*·\s*/;
    const LIST = [
        {
            id: 'marcar-asistencia',
            title: 'Marcar asistencia',
            summary: 'Marcá presente, cambiá las horas y revisá otro día.',
            doneText: 'Ya sabés marcar asistencia.',
            tour: [
                { target: '#nav-attendance', title: 'Asistencia', text: 'Tocá "Asistencia" para ver la lista del día.' },
                { target: '.user-card .check-box', title: 'Marcá presente', text: 'Tocá el cuadrito: queda presente con la jornada completa.' },
                { target: '.user-card .hours-badge', title: 'Cambiá las horas', text: 'Tocá las horas si trabajó más o menos.' },
                { target: '#btn-save-hours', spotlight: '#modal-hours.active .modal-content', title: 'Guardá', text: 'Mové la barra y tocá "Guardar".' }
            ]
        },
        {
            id: 'agregar-empleado',
            title: 'Agregar un empleado',
            summary: 'Cargá un empleado nuevo a mano y marcalo presente.',
            doneText: 'Empleado agregado.',
            tour: [
                { target: '#nav-add', title: 'Agregar', text: 'Tocá el botón "+" de abajo.' },
                { target: '#btn-add-manual', title: 'Manual', text: 'Tocá "Manual" para escribir sus datos.' },
                { target: '#user-form button[type="submit"]', spotlight: '#user-modal.active .modal-content', title: 'Completá y guardá', text: 'Escribí nombre y cargo (el número se sugiere solo) y tocá "Guardar Empleado".' }
            ]
        },
        {
            id: 'liberar-espacio',
            title: 'Liberar espacio',
            summary: 'Si Mini se llena, archivá los meses viejos sin perder nada.',
            doneText: 'Ya podés seguir marcando asistencia.',
            tour: [
                { target: '#nav-more', title: 'Abrí "Más"', text: 'Acá están los ajustes y tus datos.' },
                { target: '#btn-more-tab-data', title: 'Pestaña Datos', text: 'Tocá "Datos" para ver respaldos y archivado.' },
                { target: '#btn-download-backup', title: 'Primero, un respaldo', text: 'Tocá "Respaldo completo" y guardá el archivo. Así nada se pierde.' },
                { target: '#btn-archive-months', title: 'Archivar meses antiguos', text: 'Tocá acá para sacar del celular los meses viejos.' },
                { target: '.archive-keep-pills', title: '¿Cuántos meses mantener?', text: 'Tocá 3, 6 o 12 meses. Recomendado: 3. Abajo ves qué meses se archivan.' },
                { target: '#btn-archive-run', spotlight: '#modal-archive-months.active .modal-content', title: 'Guardar y archivar', text: 'Tocá "Guardar archivo y archivar". Primero se descarga el archivo con esos meses.' },
                { target: '#modal-confirm.active .btn-danger', spotlight: '#modal-confirm.active .modal-content', title: 'Confirmá', text: 'Cuando el archivo esté guardado, tocá "Archivar" para liberar el espacio.' },
                { target: '#btn-more-tab-settings', title: 'Volvé a Ajustes', text: 'Revisemos cuánto espacio quedó.' },
                { target: '#btn-free-storage', title: 'Liberar espacio', text: 'Tocá acá: limpia duplicados y te muestra el uso actual.' }
            ]
        }
    ];
    function find(id) {
        return LIST.find(t => t.id === id) || null;
    }
    const videoUrl = (id) => `${BASE}${id}.webm`;
    const captionsUrl = (id) => `${BASE}${id}.json`;
    function stepNumber(text) {
        const match = STEP_PREFIX.exec(text);
        return match ? Number(match[1]) : null;
    }
    function spokenText(text) {
        return text.replace(STEP_PREFIX, '');
    }
    function captionIndexAt(captions, time) {
        return captions.findIndex(c => time >= c.start && time < c.end);
    }
    function stepSegments(file) {
        const numbered = file.captions.filter(c => stepNumber(c.text) !== null);
        return numbered.map((c, i) => ({
            step: stepNumber(c.text),
            text: spokenText(c.text),
            start: c.start,
            end: i + 1 < numbered.length ? numbered[i + 1].start : file.duration
        }));
    }
    function vttTime(seconds) {
        const ms = Math.round(seconds * 1000);
        const pad = (n, size = 2) => String(n).padStart(size, '0');
        return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
    }
    function toVtt(captions) {
        return 'WEBVTT\n\n' + captions.map(c => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`).join('\n');
    }
    // The script's captions must be exactly the recorded ones, or the video is stale.
    function compareScripts(texts, recorded) {
        var _a, _b;
        const saved = recorded && Array.isArray(recorded.captions) ? recorded.captions.map(c => c.text) : [];
        const length = Math.max(texts.length, saved.length);
        for (let index = 0; index < length; index++) {
            if (texts[index] !== saved[index])
                return { ok: false, index, expected: (_a = texts[index]) !== null && _a !== void 0 ? _a : null, recorded: (_b = saved[index]) !== null && _b !== void 0 ? _b : null };
        }
        return length ? { ok: true } : { ok: false, index: 0, expected: null, recorded: null };
    }
    function offlineKey(id, recordedAt) {
        return `${videoUrl(id)}?rec=${encodeURIComponent(recordedAt)}`;
    }
    return { LIST, OFFLINE_CACHE, find, videoUrl, captionsUrl, stepNumber, spokenText, captionIndexAt, stepSegments, toVtt, compareScripts, offlineKey };
});
