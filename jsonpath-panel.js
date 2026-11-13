import { setupJsonPathSplitter } from './jsonpath-splitter.js';
import { createJsonPathTree } from './jsonpath-tree.js';
import { setupJsonTextEditor } from './json-text-editor.js';

const EXPRESSION_KEY = 'emice-jsonpath-expression-v1';
let panel;

export function setJsonPathEnabled(enabled, copyText) {
    if (!panel && enabled) panel = createPanel(copyText);
    panel?.setEnabled(enabled);
}

function createPanel(copyText) {
    const queryBar = document.getElementById('jsonpath-query');
    const results = document.getElementById('jsonpath-result');
    const input = document.getElementById('jsonpath-input');
    const output = document.getElementById('jsonpath-output');
    const outputEditor = setupJsonTextEditor(output);
    const status = document.getElementById('jsonpath-status');
    const pageLabel = document.getElementById('jsonpath-page');
    const previous = document.getElementById('jsonpath-prev');
    const next = document.getElementById('jsonpath-next');
    const copy = document.getElementById('jsonpath-copy');
    const splitter = setupJsonPathSplitter();
    const textPanel = document.getElementById('jsonpath-result-text');
    const treePanel = document.getElementById('jsonpath-result-view');
    const collapse = document.getElementById('jsonpath-collapse');
    const viewTabs = [...document.querySelectorAll('[data-jsonpath-panel]')];
    const nodeRequests = new Map();
    const resultTree = createJsonPathTree(treePanel, requestChildren);
    let worker;
    let sentRaw;
    let serial = 0;
    let pending;
    let debounce;
    let deadline;
    let page = 0;
    let mode = 'value';
    let enabled = false;
    let resultPanel = 'text';
    let resultData = null;
    let treeRendered = false;

    try { input.value = localStorage.getItem(EXPRESSION_KEY) || '$'; } catch (_) { input.value = '$'; }

    function cancelNodeRequests() {
        for (const request of nodeRequests.values()) {
            clearTimeout(request.timer);
            request.reject(new Error('查询已更新'));
        }
        nodeRequests.clear();
    }

    function clearTree(message) {
        resultData = null;
        treeRendered = false;
        resultTree.clear(message);
        cancelNodeRequests();
    }

    function showTree() {
        if (resultPanel !== 'view' || !resultData || treeRendered) return;
        resultTree.render(resultData);
        treeRendered = true;
    }

    function selectResultPanel(value) {
        resultPanel = value;
        textPanel.hidden = value !== 'text';
        treePanel.hidden = value !== 'view';
        collapse.hidden = value !== 'view';
        viewTabs.forEach(tab => {
            const selected = tab.dataset.jsonpathPanel === value;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });
        outputEditor.sync();
        showTree();
    }

    function requestChildren(nodePath, offset) {
        return new Promise((resolve, reject) => {
            if (!enabled || !resultData || pending) { reject(new Error('请等待查询完成')); return; }
            const id = ++serial;
            const timer = setTimeout(() => {
                stopWorker();
                fail('节点加载超时，请重新查询');
            }, 8000);
            nodeRequests.set(id, { resolve, reject, timer });
            try {
                const raw = document.getElementById('json-input').value;
                getWorker().postMessage({ id, ...(raw === sentRaw ? {} : { raw }), path: input.value.trim(), mode, children: { nodePath, offset } });
                sentRaw = raw;
            } catch (error) {
                clearTimeout(timer);
                nodeRequests.delete(id);
                reject(error);
            }
        });
    }

    function stopWorker() {
        worker?.terminate();
        worker = null;
        sentRaw = undefined;
        pending = null;
        clearTimeout(deadline);
        cancelNodeRequests();
        results.setAttribute('aria-busy', 'false');
    }

    function reset(message = '输入表达式查询 JSON') {
        clearTree(message);
        outputEditor.setValue('');
        output.placeholder = message;
        status.textContent = message;
        status.classList.remove('is-error');
        input.removeAttribute('aria-invalid');
        previous.disabled = true;
        next.disabled = true;
        copy.disabled = true;
        pageLabel.textContent = '';
        page = 0;
    }

    function fail(message) {
        reset(message);
        status.classList.add('is-error');
        input.setAttribute('aria-invalid', 'true');
    }

    function getWorker() {
        if (worker) return worker;
        worker = new Worker(new URL('./jsonpath-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            const nodeRequest = nodeRequests.get(data.id);
            if (nodeRequest) {
                nodeRequests.delete(data.id);
                clearTimeout(nodeRequest.timer);
                if (data.error) { sentRaw = undefined; nodeRequest.reject(new Error(data.error)); }
                else nodeRequest.resolve(data);
                return;
            }
            if (!pending || data.id !== pending.id) return;
            const request = pending;
            pending = null;
            clearTimeout(deadline);
            results.setAttribute('aria-busy', 'false');
            if (data.error) { sentRaw = undefined; fail(data.error); return; }
            if (request.copy) {
                copy.disabled = false;
                status.textContent = request.status;
                previous.disabled = request.previousDisabled;
                next.disabled = request.nextDisabled;
                copyText(data.text, copy);
                return;
            }
            outputEditor.setValue(data.text);
            resultData = data;
            treeRendered = false;
            showTree();
            page = data.page;
            status.textContent = `${data.total} 项匹配 · ${Math.round(data.elapsed)} ms${data.truncated ? ' · 预览已截断，复制可获取完整结果' : ''}`;
            status.title = status.textContent;
            pageLabel.textContent = data.total ? `${page + 1} / ${data.pages}` : '';
            previous.disabled = page === 0;
            next.disabled = page + 1 >= data.pages;
            copy.disabled = false;
        };
        worker.onerror = (event) => {
            event.preventDefault();
            stopWorker();
            fail('查询未能完成，请重试');
        };
        return worker;
    }

    function run({ targetPage = 0, copying = false } = {}) {
        clearTimeout(debounce);
        if (!enabled) return;
        if (pending) stopWorker();
        const raw = document.getElementById('json-input').value;
        const path = input.value.trim();
        try {
            localStorage.setItem(EXPRESSION_KEY, input.value);
        } catch (_) { /* Querying remains available if storage is full. */ }
        if (!raw.trim()) { reset('请先在文本面板输入 JSON'); return; }
        if (!path) { reset(); return; }
        const previousStatus = status.textContent;
        const previousDisabled = previous.disabled;
        const nextDisabled = next.disabled;
        if (!copying) { clearTree('正在查询…'); outputEditor.setValue(''); }
        status.classList.remove('is-error');
        input.removeAttribute('aria-invalid');
        status.textContent = '正在查询…';
        copy.disabled = true;
        previous.disabled = true;
        next.disabled = true;
        results.setAttribute('aria-busy', 'true');
        try {
            const activeWorker = getWorker();
            const id = ++serial;
            pending = { id, copy: copying, status: previousStatus, previousDisabled, nextDisabled };
            activeWorker.postMessage({ id, ...(raw === sentRaw ? {} : { raw }), path, mode, page: targetPage, copy: copying });
            sentRaw = raw;
            deadline = setTimeout(() => {
                stopWorker();
                fail('查询超时，请缩小查询范围后重试');
            }, 8000);
        } catch (error) {
            stopWorker();
            fail(`查询未能启动：${error.message}`);
        }
    }

    function schedule() {
        clearTimeout(debounce);
        if (pending) stopWorker();
        reset();
        if (enabled) debounce = setTimeout(run, 300);
    }

    queryBar.addEventListener('submit', (event) => { event.preventDefault(); run(); });
    input.addEventListener('input', schedule);
    document.addEventListener('json-document-change', schedule);
    viewTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectResultPanel(tab.dataset.jsonpathPanel));
        tab.addEventListener('keydown', event => {
            let target;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') target = viewTabs[1 - index];
            else if (event.key === 'Home') target = viewTabs[0];
            else if (event.key === 'End') target = viewTabs[viewTabs.length - 1];
            else return;
            event.preventDefault();
            target.focus();
            selectResultPanel(target.dataset.jsonpathPanel);
        });
    });
    collapse.addEventListener('click', () => resultTree.collapse());
    document.querySelectorAll('[data-jsonpath-mode]').forEach(button => {
        button.addEventListener('click', () => {
            mode = button.dataset.jsonpathMode;
            document.querySelectorAll('[data-jsonpath-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            run({ targetPage: page });
        });
    });
    document.querySelectorAll('[data-jsonpath-example]').forEach(button => {
        button.addEventListener('click', () => {
            input.value = button.dataset.jsonpathExample;
            document.getElementById('jsonpath-help').open = false;
            input.focus();
            run();
        });
    });
    previous.addEventListener('click', () => run({ targetPage: page - 1 }));
    next.addEventListener('click', () => run({ targetPage: page + 1 }));
    copy.addEventListener('click', () => run({ copying: true }));
    window.addEventListener('pagehide', stopWorker);

    return {
        setEnabled(value) {
            if (enabled === value) return;
            enabled = value;
            queryBar.hidden = !enabled;
            results.hidden = !enabled;
            splitter.setEnabled(enabled);
            if (enabled) { input.focus(); run(); }
            else { clearTimeout(debounce); stopWorker(); }
        },
    };
}
