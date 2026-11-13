const editors = new WeakMap();

// All JSON text panes keep native textarea selection and share the same wrapped layout.
export function setupJsonTextEditor(input, { highlights = null } = {}) {
    if (editors.has(input)) return editors.get(input);
    const document = input.ownerDocument;
    const editor = document.createElement('div');
    editor.className = 'json-code-editor';
    const gutter = document.createElement('div');
    gutter.className = 'json-line-numbers';
    gutter.id = `${input.id}-line-numbers`;
    gutter.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div');
    surface.className = 'json-text-editor';
    input.before(editor);
    editor.append(gutter, surface);
    if (highlights) surface.append(highlights);
    surface.append(input);
    input.wrap = 'soft';
    let numberedSource = null;

    function sync() {
        if (numberedSource !== input.value) {
            const lines = input.value.split('\n');
            gutter.style.setProperty('--json-gutter-width', `calc(${Math.max(2, String(lines.length).length)}ch + 24px)`);
            const rows = document.createDocumentFragment();
            lines.forEach((line, index) => {
                const row = document.createElement('div');
                row.className = 'json-line-number';
                row.dataset.line = String(index + 1);
                // Hidden source rows wrap exactly like the textarea; empty lines still get a line box.
                row.textContent = line || '\u200b';
                rows.append(row);
            });
            gutter.replaceChildren(rows);
            numberedSource = input.value;
        }
        // Split panes can be fractional pixels wide; rounding can add a wrapped line in long values.
        const viewportWidth = input.clientWidth ? input.getBoundingClientRect().width - input.offsetWidth + input.clientWidth : 0;
        if (viewportWidth) gutter.style.setProperty('--json-line-width', `${Math.max(0, viewportWidth - 20)}px`);
        gutter.scrollTop = input.scrollTop;
        if (highlights && !highlights.hidden && viewportWidth) {
            highlights.style.width = `${viewportWidth}px`;
            highlights.style.height = `${input.clientHeight}px`;
            highlights.scrollTop = input.scrollTop;
            highlights.scrollLeft = input.scrollLeft;
        }
    }

    const controller = {
        sync,
        setValue(value) {
            input.value = value;
            input.scrollTop = 0;
            input.scrollLeft = 0;
            sync();
        },
    };
    input.addEventListener('input', sync);
    input.addEventListener('scroll', sync);
    new ResizeObserver(sync).observe(input);
    editors.set(input, controller);
    sync();
    return controller;
}
