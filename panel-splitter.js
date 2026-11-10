export function setupPanelSplitter({ content, separator, storageKey, defaultRatio = 0.5, minLeft = 180, minRight = 240, onResize }) {
    let ratio = defaultRatio;
    let enabled = false;
    let pointerId = null;
    let grabOffset = 0;

    try {
        const saved = Number(localStorage.getItem(storageKey));
        if (saved > 0 && saved < 1) ratio = saved;
    } catch (_) { /* The default layout remains usable without storage. */ }

    function bounds() {
        const width = content.clientWidth - separator.offsetWidth;
        return { width, min: Math.min(minLeft / width, 0.5), max: Math.max(1 - minRight / width, 0.5) };
    }

    function render() {
        if (!enabled || !content.clientWidth) return;
        const { width, min, max } = bounds();
        if (width <= 0) return;
        const actual = Math.max(min, Math.min(max, ratio));
        onResize({ left: width * actual, right: width * (1 - actual) });
        separator.setAttribute('aria-valuemin', String(Math.round(min * 100)));
        separator.setAttribute('aria-valuemax', String(Math.round(max * 100)));
        separator.setAttribute('aria-valuenow', String(Math.round(actual * 100)));
        separator.setAttribute('aria-valuetext', `左侧 ${Math.round(actual * 100)}%，右侧 ${Math.round((1 - actual) * 100)}%`);
    }

    function save() {
        try { localStorage.setItem(storageKey, String(ratio)); } catch (_) { /* Resizing still works. */ }
    }

    function finish() {
        if (pointerId === null) return;
        const captured = pointerId;
        pointerId = null;
        document.documentElement.classList.remove('is-resizing-panels');
        if (separator.hasPointerCapture(captured)) separator.releasePointerCapture(captured);
        save();
    }

    separator.addEventListener('pointerdown', event => {
        if (!enabled || event.button !== 0 || !event.isPrimary || pointerId !== null) return;
        event.preventDefault();
        grabOffset = event.clientX - separator.getBoundingClientRect().left;
        pointerId = event.pointerId;
        separator.setPointerCapture(pointerId);
        separator.focus({ preventScroll: true });
        document.documentElement.classList.add('is-resizing-panels');
    });
    separator.addEventListener('pointermove', event => {
        if (event.pointerId !== pointerId) return;
        const { width, min, max } = bounds();
        if (width <= 0) return;
        ratio = Math.max(min, Math.min(max, (event.clientX - content.getBoundingClientRect().left - grabOffset) / width));
        render();
    });
    separator.addEventListener('pointerup', finish);
    separator.addEventListener('pointercancel', finish);
    separator.addEventListener('lostpointercapture', finish);
    separator.addEventListener('dblclick', () => { ratio = defaultRatio; render(); save(); });
    separator.addEventListener('keydown', event => {
        if (!enabled || !content.clientWidth) return;
        const { min, max } = bounds();
        const actual = Math.max(min, Math.min(max, ratio));
        if (event.key === 'ArrowLeft') ratio = Math.max(min, actual - (event.shiftKey ? 0.1 : 0.02));
        else if (event.key === 'ArrowRight') ratio = Math.min(max, actual + (event.shiftKey ? 0.1 : 0.02));
        else if (event.key === 'Home') ratio = min;
        else if (event.key === 'End') ratio = max;
        else return;
        event.preventDefault();
        render();
        save();
    });
    window.addEventListener('blur', finish);
    window.addEventListener('pagehide', finish);
    new ResizeObserver(render).observe(content);

    return {
        setEnabled(value) {
            enabled = value;
            separator.hidden = !enabled;
            if (enabled) render();
            else finish();
        },
    };
}
