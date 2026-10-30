"use strict";
(function exposeMiniUpdateFeedback(root, factory) { const api = factory(); if (typeof module === 'object' && module && module.exports)
    module.exports = api; if (root)
    root.MiniUpdateFeedback = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    // Local visual feedback. Numbers come only from completed worker requests.
    const icons = {
        download: '<path d="M39 65a13 13 0 0 1 1-25 20 20 0 0 1 38-2 14 14 0 0 1 3 27"/><g class="update-download-arrow"><path d="M60 49v31m-10-10 10 10 10-10"/></g>',
        save: '<path d="M41 37h30l8 8v38H41zM49 37v19h22V37M49 83V65h22v18"/>',
        install: '<path d="m60 36 24 13v26L60 88 36 75V49zM36 49l24 14 24-14M60 63v25M48 43l24 14v12"/>',
        ready: '<path d="m40 61 14 14 27-29"/>',
        error: '<path d="M60 36v30m0 12v1"/><circle cx="60" cy="60" r="29"/>'
    };
    const labels = { download: 'Descargando archivos', save: 'Guardando tus datos', install: 'Instalando actualización',
        restart: 'Abriendo la aplicación', ready: 'Actualización preparada', error: 'No se pudo completar la actualización' };
    function createUpdateFeedback() {
        const element = document.createElement('div');
        element.className = 'update-feedback';
        element.dataset.updateFeedback = '';
        element.innerHTML = '<div class="update-visual" role="progressbar"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="update-track" cx="60" cy="60" r="52"/><circle class="update-arc" cx="60" cy="60" r="52"/><g class="update-glyph"></g></svg></div><p data-update-count hidden></p>';
        return element;
    }
    function updateUpdateFeedback(element, state) {
        const activity = state.activity || (state.phase === 'preparing' ? 'download' : state.phase) || 'idle';
        element.hidden = !labels[activity];
        const meter = element.querySelector('.update-visual'), detail = element.querySelector('[data-update-count]');
        if (element.dataset.activity !== activity)
            element.querySelector('.update-glyph').innerHTML = icons[activity === 'restart' ? 'install' : activity] || '';
        element.dataset.activity = activity || 'idle';
        meter.setAttribute('role', ['download', 'save', 'install', 'restart'].includes(activity) ? 'progressbar' : 'img');
        meter.setAttribute('aria-label', labels[activity] || 'Actualización');
        const { completed, total } = state.progress || {};
        const known = typeof completed === 'number' && typeof total === 'number' && activity === 'download' && Number.isInteger(completed) && Number.isInteger(total)
            && total > 0 && completed >= 0 && completed <= total;
        meter.dataset.determinate = String(known);
        if (known) {
            meter.setAttribute('aria-valuemin', '0');
            meter.setAttribute('aria-valuemax', String(total));
            meter.setAttribute('aria-valuenow', String(completed));
            detail.textContent = completed + ' de ' + total + ' archivos';
            meter.setAttribute('aria-valuetext', detail.textContent);
            meter.style.setProperty('--update-offset', String(326.73 * (1 - completed / total)));
        }
        else {
            for (const attr of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'])
                meter.removeAttribute(attr);
            detail.textContent = '';
        }
        detail.hidden = !known;
    }
    return { createUpdateFeedback, updateUpdateFeedback };
});
