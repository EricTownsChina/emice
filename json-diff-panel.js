import { setupPanelSplitter } from './panel-splitter.js';
import { setupJsonTextEditor } from './json-text-editor.js';

const STORAGE_KEY = 'emice-json-diff-draft-v1';
let panel;

export function openJsonDiff(copyText) {
    if (!panel) panel = createPanel(copyText);
    panel.activate();
}

export function closeJsonDiff() {
    panel?.deactivate();
}

export function selectJsonDiffPanel(value) {
    panel?.selectPanel(value);
}

export function getJsonDiffPanel() {
    return panel?.getActivePanel() ?? 'text';
}

function createPanel(copyText) {
    const section = document.getElementById('json-diff');
    const inputs = ['left', 'right'].map(side => document.getElementById(`diff-${side}`));
    const editors = inputs.map(input => setupJsonTextEditor(input));
    const status = document.getElementById('diff-status');
    const tree = document.getElementById('diff-tree');
    const textPanel = document.getElementById('diff-text-panel');
    const viewPanel = document.getElementById('diff-view-panel');
    const content = document.getElementById('diff-content');
    const splitter = setupPanelSplitter({
        content,
        separator: document.getElementById('diff-splitter'),
        storageKey: 'emice-json-diff-split-ratio-v1',
        minLeft: 240,
        onResize: ({ left }) => content.style.setProperty('--diff-left-width', `${left}px`),
    });
    const onlyChanges = document.getElementById('diff-only-changes');
    const expandButton = document.getElementById('diff-expand');
    const expandActions = new WeakMap();
    const requests = new Map();
    let worker;
    let serial = 0;
    let generation = 0;
    let treeGeneration = 0;
    let expansion = 0;
    let result;
    let debounce;
    let busy = false;
    let activePanel = 'text';
    let rendered = false;
    let savedDraft = '';

    function isActive() {
        return !section.hidden && document.getElementById('json-tab').classList.contains('active');
    }

    function deactivate() {
        splitter.setEnabled(false);
        stopExpansion();
        clearTimeout(debounce);
        saveDraft();
        if (busy) { stopWorker(); invalidate(); }
    }

    function activate() {
        if (!isActive()) return;
        splitter.setEnabled(true);
        if (inputs.every(input => input.value.trim())) run();
        else if (!result) invalidate();
    }

    function placeholder(message) {
        if (!message) { tree.replaceChildren(); return; }
        const element = document.createElement('div');
        element.className = 'tree-placeholder diff-placeholder';
        element.textContent = message;
        tree.replaceChildren(element);
    }

    function stopWorker() {
        worker?.terminate();
        worker = null;
        for (const request of requests.values()) {
            clearTimeout(request.timer);
            request.reject(new Error('对比内容已更新'));
        }
        requests.clear();
        busy = false;
        section.setAttribute('aria-busy', 'false');
    }

    function request(payload) {
        return new Promise((resolve, reject) => {
            if (!worker) {
                worker = new Worker(new URL('./json-diff-worker.js', import.meta.url), { type: 'module' });
                worker.onmessage = ({ data }) => {
                    const pending = requests.get(data.id);
                    if (!pending) return;
                    requests.delete(data.id);
                    clearTimeout(pending.timer);
                    if (data.error) pending.reject(new Error(data.error));
                    else pending.resolve(data);
                };
                worker.onerror = event => {
                    event.preventDefault();
                    stopWorker();
                    invalidate('对比未能完成，请重试', true);
                };
            }
            const id = ++serial;
            const timer = setTimeout(() => {
                stopWorker();
                invalidate('对比超时，请缩小数据范围后重试', true);
            }, 8000);
            requests.set(id, { resolve, reject, timer });
            try { worker.postMessage({ id, ...payload }); }
            catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
        });
    }

    function invalidate(message = '', error = false) {
        stopExpansion();
        generation++;
        treeGeneration++;
        result = null;
        rendered = false;
        status.textContent = message;
        status.title = message;
        status.classList.toggle('is-error', error);
        placeholder(message);
    }

    function saveDraft() {
        const draft = JSON.stringify(inputs.map(input => input.value));
        if (draft === savedDraft) return;
        try {
            if (inputs.some(input => input.value)) localStorage.setItem(STORAGE_KEY, draft);
            else localStorage.removeItem(STORAGE_KEY);
            savedDraft = draft;
        } catch (_) { /* Comparing remains available when local storage is full. */ }
    }

    function schedule() {
        clearTimeout(debounce);
        stopWorker();
        invalidate();
        if (isActive()) debounce = setTimeout(() => { saveDraft(); run(); }, 300);
    }

    async function run(showView = false) {
        clearTimeout(debounce);
        saveDraft();
        if (showView) selectPanel('view', false);
        if (result) { render(); return; }
        if (busy) return;
        const version = generation;
        busy = true;
        section.setAttribute('aria-busy', 'true');
        status.textContent = '正在比较…';
        status.classList.remove('is-error');
        placeholder('正在比较…');
        try {
            const data = await request({ left: inputs[0].value, right: inputs[1].value });
            if (version !== generation) return;
            result = data;
            const { added, removed, changed } = data.counts;
            status.textContent = added + removed + changed
                ? `新增 ${added} · 删除 ${removed} · 修改 ${changed}` : 'JSON 一致';
            status.title = `${status.textContent} · ${Math.round(data.elapsed)} ms`;
            render();
        } catch (error) {
            if (version === generation) {
                busy = false;
                section.setAttribute('aria-busy', 'false');
                invalidate(error.message, true);
            }
        } finally {
            if (version === generation) {
                busy = false;
                section.setAttribute('aria-busy', 'false');
            }
        }
    }

    function span(className, text) {
        const element = document.createElement('span');
        element.className = className;
        element.textContent = text;
        return element;
    }

    function cell(side, direction, descriptor, depth) {
        const element = document.createElement('span');
        const status = descriptor.status;
        const valueChanged = status === 'changed' && (!descriptor.expandable || descriptor.left?.type !== descriptor.right?.type);
        let tone = side ? status : 'missing';
        if (side && status === 'changed') {
            tone = 'same';
            if (valueChanged) tone = direction === 'left' ? 'removed' : 'added';
        }
        element.className = `diff-cell diff-${tone}`;
        element.style.setProperty('--diff-indent', `${Math.min(depth, 12) * 16}px`);
        element.append(span('diff-fold', descriptor.expandable ? '▸' : ''));
        if (!side) { element.append(span('diff-missing', '—')); return element; }
        element.title = side.path;
        const mark = tone === 'added' ? '+' : tone === 'removed' ? '−' : status === 'changed' ? '~' : '';
        element.append(span('diff-sign', mark), span(side.key === 'root' && depth === 0 ? 'tree-root-label' : 'tree-key', side.key), span('tree-colon', ':'));
        const type = side.type === 'object' || side.type === 'array' ? 'tree-type' : `tree-value type-${side.type}`;
        element.append(span(type, side.text + (side.shortened ? ' …' : '')));
        if (side.shortened) element.title += '\n字符串预览已截断，完整内容见文本面板';
        element.dataset.side = direction;
        return element;
    }

    function node(descriptor, version, depth = 0) {
        const element = document.createElement(descriptor.expandable ? 'details' : 'div');
        element.className = 'diff-node';
        const row = descriptor.expandable ? document.createElement('summary') : document.createElement('div');
        row.className = 'diff-row';
        row.setAttribute('aria-label', `${{ same: '相同', added: '新增', removed: '删除', changed: '修改' }[descriptor.status]}：${descriptor.left?.path || descriptor.right.path}`);
        row.append(cell(descriptor.left, 'left', descriptor, depth), cell(descriptor.right, 'right', descriptor, depth));
        element.append(row);
        if (!descriptor.expandable) return element;
        const children = document.createElement('div');
        children.className = 'diff-children';
        element.append(children);
        let loaded = false;
        let loading;
        let nextOffset = 0;
        let total = 0;
        const childNodes = [];
        function load(offset = 0, moreButton) {
            if (loading) return loading;
            loading = appendPage(offset, moreButton).finally(() => { loading = null; });
            return loading;
        }
        async function appendPage(offset, moreButton) {
            children.setAttribute('aria-busy', 'true');
            if (moreButton) { moreButton.disabled = true; moreButton.textContent = '加载中…'; }
            try {
                const data = await request({ children: { id: descriptor.id, offset, onlyChanges: onlyChanges.checked } });
                if (version !== treeGeneration) return false;
                moreButton?.remove();
                const pageNodes = data.nodes.map(item => node(item, version, depth + 1));
                children.append(...pageNodes);
                childNodes.push(...pageNodes);
                loaded = true;
                nextOffset = data.nextOffset;
                total = data.total;
                if (data.nextOffset < data.total) {
                    const more = document.createElement('button');
                    more.type = 'button';
                    more.className = 'tool-btn diff-load-more';
                    more.textContent = `显示更多（${data.nextOffset} / ${data.total}）`;
                    more.addEventListener('click', () => load(data.nextOffset, more));
                    children.append(more);
                }
                return true;
            } catch (error) {
                if (version !== treeGeneration) return false;
                if (moreButton) { moreButton.disabled = false; moreButton.textContent = '加载失败，点击重试'; }
                else children.replaceChildren(span('tree-placeholder diff-placeholder', `加载失败：${error.message}，请收起后重试`));
                return false;
            } finally { children.setAttribute('aria-busy', 'false'); }
        }
        expandActions.set(element, async current => {
            if (!current()) return;
            element.open = true;
            if (!loaded) {
                children.replaceChildren();
                if (!await load()) return;
            }
            while (nextOffset < total && current() && element.open) {
                if (!await load(nextOffset, children.querySelector(':scope > .diff-load-more'))) return;
                // Yield between pages so large trees remain responsive to folding.
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            for (const child of childNodes) {
                if (!current() || !element.open) return;
                await expandActions.get(child)?.(current);
            }
        });
        element.addEventListener('toggle', () => {
            if (version !== treeGeneration) return;
            element.querySelectorAll(':scope > summary .diff-fold').forEach(fold => { fold.textContent = element.open ? '▾' : '▸'; });
            if (!element.open) stopExpansion();
            if (element.open && !loaded && !loading) { children.replaceChildren(); load(); }
        });
        return element;
    }

    function stopExpansion() {
        expansion++;
        expandButton.disabled = false;
        expandButton.textContent = '展开全部';
    }

    async function expandAll() {
        if (!result || !rendered || !isActive() || activePanel !== 'view') return;
        const version = treeGeneration;
        const operation = ++expansion;
        const current = () => operation === expansion && version === treeGeneration && isActive() && activePanel === 'view';
        expandButton.disabled = true;
        expandButton.textContent = '展开中…';
        try {
            await expandActions.get(tree.firstElementChild)?.(current);
        } finally {
            if (operation === expansion) stopExpansion();
        }
    }

    function render() {
        if (!result || activePanel !== 'view' || rendered) return;
        tree.replaceChildren(node(result.root, treeGeneration));
        tree.scrollTop = 0;
        rendered = true;
        expandAll();
    }

    function selectPanel(value, compare = true) {
        if (value !== 'view') stopExpansion();
        activePanel = value;
        textPanel.hidden = value !== 'text';
        if (value === 'text') editors.forEach(editor => editor.sync());
        viewPanel.hidden = value !== 'view';
        expandButton.hidden = value !== 'view';
        document.dispatchEvent(new Event('json-diff-panel-change'));
        if (compare && value === 'view') run();
        else render();
    }

    try {
        const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (Array.isArray(draft) && draft.length === 2 && draft.every(value => typeof value === 'string')) {
            editors.forEach((editor, index) => editor.setValue(draft[index]));
            savedDraft = JSON.stringify(draft);
        }
    } catch (_) { /* A damaged draft must not block opening the tool. */ }
    inputs.forEach(input => input.addEventListener('input', schedule));
    document.getElementById('diff-compare').addEventListener('click', () => run(true));
    section.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
            event.preventDefault();
            run(true);
        }
    });
    document.getElementById('diff-swap').addEventListener('click', () => {
        const values = inputs.map(input => input.value);
        editors.forEach((editor, index) => editor.setValue(values[1 - index]));
        schedule();
    });
    document.getElementById('diff-clear').addEventListener('click', () => {
        editors.forEach(editor => editor.setValue(''));
        schedule(); clearTimeout(debounce); saveDraft(); invalidate(); selectPanel('text'); inputs[0].focus();
    });
    document.getElementById('diff-use-current').addEventListener('click', () => {
        editors[0].setValue(document.getElementById('json-input').value);
        schedule();
    });
    expandButton.addEventListener('click', expandAll);
    onlyChanges.addEventListener('change', () => { stopExpansion(); treeGeneration++; rendered = false; render(); });
    document.querySelectorAll('[data-diff-copy]').forEach(button => button.addEventListener('click', () => {
        const index = button.dataset.diffCopy === 'left' ? 0 : 1;
        copyText(inputs[index].value, button);
    }));
    document.addEventListener('tool-change', event => {
        if (event.detail === 'json') activate();
        else deactivate();
    });
    window.addEventListener('pagehide', () => { saveDraft(); stopWorker(); invalidate(); });

    return { activate, deactivate, selectPanel, getActivePanel: () => activePanel };
}
