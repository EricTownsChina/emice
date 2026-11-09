const DEFAULT_TIMEZONE = '北京';
const TIMEZONE_FALLBACK = [
    ['UTC', 'UTC'], ['北京', 'Asia/Shanghai'], ['东京', 'Asia/Tokyo'], ['新德里', 'Asia/Kolkata'],
    ['迪拜', 'Asia/Dubai'], ['巴黎', 'Europe/Paris'], ['莫斯科', 'Europe/Moscow'], ['纽约', 'America/New_York'],
    ['洛杉矶', 'America/Los_Angeles'], ['悉尼', 'Australia/Sydney'],
];
const STORAGE_KEY = 'emice-time-history-v2';
const copyFeedback = new WeakMap();
const timezoneIds = new Map(TIMEZONE_FALLBACK);
const jsonSearchState = { query: '', panel: 'text', marks: [], index: -1 };
let invokeApi = null;
let activeTimeMode = 'timestamp';
let timezones = [];
let timeHistory = loadHistory();
let currentTimeTimer = null;
let cachedJson = null;
let renderedJsonRaw = null;
let treeSearchQuery = '';

function getInvoke() {
    if (invokeApi) return invokeApi;
    const tauri = window.__TAURI__;
    const invoke = tauri?.core?.invoke || tauri?.tauri?.invoke;
    if (typeof invoke !== 'function') return null;
    invokeApi = invoke.bind(tauri.core || tauri.tauri);
    return invokeApi;
}

async function command(name, args = {}) {
    const invoke = getInvoke();
    if (invoke) return invoke(name, args);
    if (name === 'get_timezone_list') return TIMEZONE_FALLBACK.map(([label, id]) => ({ name: label, timezone_id: id, offset_minutes: timezoneOffset(id) }));
    if (name === 'get_current_time') return { timestamp: Date.now() };
    if (name === 'timestamp_to_datetime') return formatTimestamp(args.timestamp, args.timezoneName || DEFAULT_TIMEZONE);
    if (name === 'datetime_to_timestamp') return parseDatetime(args.datetimeStr, args.timezoneName || DEFAULT_TIMEZONE);
    throw new Error('当前环境不支持此操作');
}

function timezoneOffset(id) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'longOffset' }).formatToParts(new Date());
    const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function formatUtcOffset(minutes) {
    const sign = minutes < 0 ? '-' : '+';
    const abs = Math.abs(minutes);
    return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
}

function setStatus(text, kind = '') {
    const status = document.getElementById('app-status');
    if (status) status.textContent = text;
    document.querySelector('.state-dot')?.classList.toggle('error', kind === 'error');
}

async function loadTimezones() {
    try {
        timezones = await command('get_timezone_list');
    } catch (_) {
        timezones = TIMEZONE_FALLBACK.map(([name, id]) => ({ name, offset_minutes: timezoneOffset(id) }));
    }
    const select = document.getElementById('time-timezone');
    if (!select) return;
    select.innerHTML = timezones.map((tz) => `<option value="${escapeHtml(tz.name)}">${escapeHtml(tz.name)} (${formatUtcOffset(tz.offset_minutes)})</option>`).join('');
    select.value = localStorage.getItem('emice-timezone') || DEFAULT_TIMEZONE;
    if (!select.value) select.selectedIndex = 0;
    select.addEventListener('change', () => localStorage.setItem('emice-timezone', select.value));
}

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) { return []; }
}

function saveHistory() {
    timeHistory = timeHistory.slice(0, 60);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timeHistory));
}

function normalizeTimestamp(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('不是有效的时间戳');
    return Math.abs(number) < 10000000000 ? Math.trunc(number * 1000) : Math.trunc(number);
}

function formatTimestamp(timestamp, timezoneName) {
    const zone = timezoneIds.get(timezoneName) || 'Asia/Shanghai';
    return new Intl.DateTimeFormat('zh-CN', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(timestamp)).replace(/\//g, '-');
}

function parseDatetime(value, timezoneName) {
    const text = value.trim().replace(/年|月/g, '-').replace(/日/g, '');
    const match = text.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/i);
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/);
    if (!match && !compact) {
        // Only use the native parser for explicitly zoned RFC 2822 dates.
        if (/^(?:[A-Za-z]{3},\s*)?\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:[+-]\d{4}|GMT|UT)$/i.test(text)) {
            const timestamp = Date.parse(text);
            if (Number.isFinite(timestamp)) return timestamp;
        }
        throw new Error('无法解析日期，请使用年-月-日、ISO 8601 或 RFC 2822 格式');
    }
    const [year, month, day, hour = '0', minute = '0', second = '0', fraction = '', offset] = match
        ? [match[1], match[3], ...match.slice(4)] : compact.slice(1);
    const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
    const date = new Date(0);
    date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    date.setUTCHours(Number(hour), Number(minute), Number(second), milliseconds);
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)
        || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw new Error('无效的日期');
    const guess = date.getTime();
    if (offset) {
        if (offset.toUpperCase() === 'Z') return guess;
        const digits = offset.replace(':', '');
        const hours = Number(digits.slice(1, 3));
        const minutes = Number(digits.slice(3));
        if (hours > 23 || minutes > 59) throw new Error('无效的时区偏移');
        return guess - (digits[0] === '-' ? -1 : 1) * (hours * 60 + minutes) * 60000;
    }
    const zone = timezoneIds.get(timezoneName) || 'Asia/Shanghai';
    // Check both sides of DST changes; keep the earlier occurrence for repeated hours.
    const offsets = new Set([-86400000, 0, 86400000].map((delta) => timezoneOffsetAt(zone, new Date(guess + delta))));
    const candidates = [...offsets].map((minutes) => guess - minutes * 60000)
        .filter((timestamp) => timestamp + timezoneOffsetAt(zone, new Date(timestamp)) * 60000 === guess);
    if (!candidates.length) throw new Error('该本地时间在该时区不存在（夏令时切换）');
    return Math.min(...candidates);
}

function timezoneOffsetAt(zone, date) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(date);
    const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : 0;
}

async function convertTimeEntry() {
    const input = document.getElementById('time-input');
    const error = document.getElementById('time-error');
    const value = input.value.trim();
    if (!value) { error.textContent = '请输入时间'; input.focus(); return; }
    error.textContent = '';
    const timezoneName = document.getElementById('time-timezone').value || DEFAULT_TIMEZONE;
    try {
        const timestamp = activeTimeMode === 'timestamp' ? normalizeTimestamp(value) : Number(await command('datetime_to_timestamp', { datetimeStr: value, timezoneName }));
        if (!Number.isFinite(timestamp)) throw new Error('转换结果无效');
        const localTime = await command('timestamp_to_datetime', { timestamp, timezoneName });
        timeHistory.unshift({ id: `${Date.now()}-${Math.random()}`, input: value, timezone: timezoneName, timestamp, localTime, mode: activeTimeMode });
    } catch (caught) { error.textContent = String(caught?.message || caught).replace(/^Error:\s*/, ''); setStatus('转换失败', 'error'); return; }
    saveHistory(); renderHistory();
    setStatus('已加入历史');
}

function renderHistory() {
    const body = document.getElementById('history-body');
    body.innerHTML = timeHistory.map((item) => `<tr><td class="mono input-cell" title="${escapeHtml(item.input)}">${escapeHtml(item.input)}</td><td><span class="zone-pill">${escapeHtml(item.timezone)}</span></td><td class="mono">${item.timestamp}</td><td class="mono local-cell">${escapeHtml(item.localTime)}</td><td class="row-actions"><button class="copy-icon-btn copy-record" data-id="${item.id}" title="复制时间戳" aria-label="复制时间戳" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-copy"/></svg></button><button class="row-btn delete-record" data-id="${item.id}" title="删除记录">×</button></td></tr>`).join('');
    body.querySelectorAll('.copy-record').forEach((button) => button.addEventListener('click', () => copyText(timeHistory.find((item) => item.id === button.dataset.id)?.timestamp, button)));
    body.querySelectorAll('.delete-record').forEach((button) => button.addEventListener('click', () => { timeHistory = timeHistory.filter((item) => item.id !== button.dataset.id); saveHistory(); renderHistory(); }));
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

async function copyText(value, button) {
    if (value == null) return;
    let success = false;
    try {
        await navigator.clipboard.writeText(String(value));
        success = true;
        setStatus('已复制');
    } catch (_) {
        setStatus('复制失败', 'error');
    }
    if (!button) return;
    const previous = copyFeedback.get(button);
    if (previous) clearTimeout(previous.timer);
    const original = previous?.original || {
        iconHref: button.querySelector('use')?.getAttribute('href'),
        title: button.title,
        label: button.getAttribute('aria-label'),
    };
    button.querySelector('use')?.setAttribute('href', success ? '#icon-copy-done' : '#icon-copy-error');
    button.title = success ? '已复制' : '复制失败，请重试';
    button.setAttribute('aria-label', button.title);
    button.classList.toggle('copy-success', success);
    button.classList.toggle('copy-error', !success);
    const timer = setTimeout(() => {
        if (original.iconHref) button.querySelector('use')?.setAttribute('href', original.iconHref);
        button.title = original.title;
        if (original.label === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', original.label);
        button.classList.remove('copy-success', 'copy-error');
        copyFeedback.delete(button);
    }, 1500);
    copyFeedback.set(button, { original, timer });
}

function updateCurrentTime() {
    document.getElementById('current-timestamp').textContent = Date.now();
}

function syncCurrentTimeTimer() {
    clearInterval(currentTimeTimer);
    currentTimeTimer = null;
    if (document.hidden || !document.getElementById('time-tab').classList.contains('active')) return;
    updateCurrentTime();
    currentTimeTimer = setInterval(updateCurrentTime, 1000);
}

function jsonStats(value) {
    const lines = value ? value.split(/\r?\n/).length : 1;
    document.getElementById('json-stats').textContent = `${lines} 行 · ${value.length} 字符`;
    document.getElementById('json-line-count').textContent = `共 ${lines} 行`;
}

function readJson() {
    const raw = document.getElementById('json-input').value.trim();
    if (cachedJson?.raw === raw) return cachedJson;
    try {
        cachedJson = { raw, value: raw ? JSON.parse(raw) : null, error: null };
    } catch (error) {
        cachedJson = { raw, value: null, error };
    }
    return cachedJson;
}

function updateJsonValidity(result) {
    const badge = document.getElementById('json-validity');
    if (!result.raw) { badge.textContent = '等待输入'; badge.className = 'validity neutral'; return; }
    if (result.error) { badge.textContent = 'JSON 无效'; badge.className = 'validity invalid'; return; }
    badge.textContent = 'JSON 有效'; badge.className = 'validity valid';
}

function nodeLabel(value, key, depth = 0) {
    const type = Array.isArray(value) ? `Array(${value.length})` : value === null ? 'null' : typeof value;
    const title = key === null ? '<span class="tree-root-label">root</span>' : `<span class="tree-key">${escapeHtml(key)}</span><span class="tree-colon">:</span>`;
    if (value !== null && typeof value === 'object') return `<details class="tree-node" open data-depth="${depth}"><summary>${title}<span class="tree-type">${type}</span></summary><div class="tree-children">${Object.entries(value).map(([childKey, childValue]) => nodeLabel(childValue, childKey, depth + 1)).join('')}</div></details>`;
    const rendered = typeof value === 'string' ? `"${escapeHtml(value)}"` : String(value);
    return `<div class="tree-leaf tree-node" data-depth="${depth}"><span class="tree-key">${key === null ? '' : escapeHtml(key)}</span>${key === null ? '' : '<span class="tree-colon">:</span>'}<span class="tree-value type-${type}">${rendered}</span></div>`;
}

function renderJsonTree(result) {
    if (renderedJsonRaw === result.raw) return;
    renderedJsonRaw = result.raw;
    treeSearchQuery = '';
    const tree = document.getElementById('json-tree');
    if (!result.raw || result.error) {
        tree.innerHTML = `<div class="tree-placeholder">${result.error ? 'JSON 格式有误，请切换到文本面板修正' : '粘贴 JSON'}</div>`;
        return;
    }
    tree.innerHTML = nodeLabel(result.value, null);
}

function updateJsonTree({ revealSearch = false } = {}) {
    const value = document.getElementById('json-input').value;
    const raw = value.trim();
    jsonStats(value);
    if (cachedJson?.raw !== raw) cachedJson = null;
    if (renderedJsonRaw !== null && renderedJsonRaw !== raw) {
        // Release the previous document even when the tree is hidden.
        jsonSearchState.marks = [];
        document.getElementById('json-tree').replaceChildren();
        renderedJsonRaw = null;
        treeSearchQuery = '';
    }
    document.getElementById('json-message').textContent = '';
    if (!document.getElementById('json-preview').hidden) {
        const result = readJson();
        updateJsonValidity(result);
        renderJsonTree(result);
        if (result.error) document.getElementById('json-message').textContent = result.error.message.replace(/^JSON.parse:\s*/, '');
    }
    applyJsonSearch({ reveal: revealSearch });
}

function selectJsonPanel(panel) {
    const showView = panel === 'view';
    document.getElementById('json-editor').hidden = showView;
    document.getElementById('json-preview').hidden = !showView;
    document.getElementById('json-line-count').hidden = showView;
    document.querySelectorAll('[data-json-panel]').forEach((tab) => {
        const selected = tab.dataset.jsonPanel === panel;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    updateJsonTree({ revealSearch: true });
}

function unescapeJsonText(value) {
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'string' ? parsed : value;
    } catch (_) {
        // The escape action produces a JSON string body without surrounding quotes.
        return JSON.parse(`"${value}"`);
    }
}

function jsonAction(action, button) {
    const input = document.getElementById('json-input');
    if (action === 'clear') { input.value = ''; updateJsonTree(); return; }
    if (action === 'copy') { copyText(input.value, button); return; }
    if (action === 'escape') { input.value = JSON.stringify(input.value).slice(1, -1); updateJsonTree(); return; }
    if (action === 'unescape') {
        if (!input.value) return;
        try {
            const decoded = unescapeJsonText(input.value);
            input.value = decoded;
            updateJsonTree();
        } catch (_) {
            document.getElementById('json-message').textContent = '去转义失败：请检查 JSON 字符串中的引号和转义序列';
        }
        return;
    }
    const result = readJson();
    if (!result.raw) return;
    if (result.error) { document.getElementById('json-message').textContent = '请先修正 JSON 格式'; return; }
    input.value = JSON.stringify(result.value, null, action === 'compact' ? 0 : 2);
    input.setSelectionRange(0, 0);
    input.scrollLeft = 0;
    input.scrollTop = 0;
    updateJsonTree();
}

function findJsonMatches(text, query) {
    if (!query) return [];
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function highlightJsonMatches(text, matches) {
    let end = 0;
    const parts = matches.map((match) => {
        const part = `${escapeHtml(text.slice(end, match.start))}<mark class="json-match">${escapeHtml(text.slice(match.start, match.end))}</mark>`;
        end = match.end;
        return part;
    });
    return parts.join('') + escapeHtml(text.slice(end));
}

function syncJsonHighlights() {
    const input = document.getElementById('json-input');
    const highlights = document.getElementById('json-highlights');
    if (highlights.hidden || document.getElementById('json-editor').hidden) return;
    highlights.style.width = `${input.clientWidth}px`;
    highlights.style.height = `${input.clientHeight}px`;
    highlights.scrollTop = input.scrollTop;
    highlights.scrollLeft = input.scrollLeft;
}

function applyJsonSearch({ reveal = true } = {}) {
    const query = document.getElementById('json-search-input').value;
    const panel = document.getElementById('json-preview').hidden ? 'text' : 'view';
    const previousIndex = query === jsonSearchState.query && panel === jsonSearchState.panel ? jsonSearchState.index : 0;
    const highlights = document.getElementById('json-highlights');
    // A transparent copy of the entire document is only needed for active text matches.
    if (panel === 'text' && query) {
        const input = document.getElementById('json-input');
        const matches = findJsonMatches(input.value, query);
        highlights.hidden = !matches.length;
        if (matches.length) highlights.innerHTML = highlightJsonMatches(input.value, matches) + '\n';
        else highlights.replaceChildren();
        syncJsonHighlights();
    } else {
        highlights.hidden = true;
        if (highlights.firstChild) highlights.replaceChildren();
    }
    if (panel === 'view' && query !== treeSearchQuery) {
        document.querySelectorAll('#json-tree .tree-key, #json-tree .tree-value').forEach((element) => {
            const text = element.textContent;
            const matches = findJsonMatches(text, query);
            if (matches.length) element.innerHTML = highlightJsonMatches(text, matches);
            else if (element.querySelector('.json-match')) element.textContent = text;
            if (matches.length) {
                let ancestor = element.parentElement;
                while (ancestor && ancestor.id !== 'json-tree') {
                    if (ancestor.tagName === 'DETAILS') ancestor.open = true;
                    ancestor = ancestor.parentElement;
                }
            }
        });
        treeSearchQuery = query;
    }
    jsonSearchState.query = query;
    jsonSearchState.panel = panel;
    jsonSearchState.marks = [...document.querySelectorAll(panel === 'text' ? '#json-highlights .json-match' : '#json-tree .json-match')];
    setJsonSearchIndex(Math.max(0, Math.min(previousIndex, jsonSearchState.marks.length - 1)), { reveal });
}

function setJsonSearchIndex(index, { reveal = true } = {}) {
    const { marks, query } = jsonSearchState;
    marks[jsonSearchState.index]?.classList.remove('json-match-current');
    jsonSearchState.index = marks.length ? (index + marks.length) % marks.length : -1;
    const current = marks[jsonSearchState.index];
    current?.classList.add('json-match-current');
    const countLabel = document.getElementById('json-search-count');
    countLabel.textContent = query ? `${jsonSearchState.index + 1}/${marks.length}` : '';
    countLabel.setAttribute('aria-label', query ? `第 ${jsonSearchState.index + 1} 处，共 ${marks.length} 处` : '');
    document.getElementById('json-search-prev').disabled = !marks.length;
    document.getElementById('json-search-next').disabled = !marks.length;
    if (current && reveal) revealJsonMatch(current);
}

function revealJsonMatch(mark) {
    const isText = jsonSearchState.panel === 'text';
    if (!isText) {
        let ancestor = mark.parentElement;
        while (ancestor && ancestor.id !== 'json-tree') {
            if (ancestor.tagName === 'DETAILS') ancestor.open = true;
            ancestor = ancestor.parentElement;
        }
    }
    const viewport = document.getElementById(isText ? 'json-input' : 'json-tree');
    const target = mark.getClientRects()[0];
    if (!target || !viewport.clientHeight) return;
    const bounds = viewport.getBoundingClientRect();
    viewport.scrollTop += target.top - bounds.top - (viewport.clientHeight - target.height) / 2;
    if (target.left < bounds.left + 10) viewport.scrollLeft += target.left - bounds.left - 10;
    else if (target.right > bounds.left + viewport.clientWidth - 10) viewport.scrollLeft += target.right - bounds.left - viewport.clientWidth + 10;
    if (isText) syncJsonHighlights();
}

function moveJsonSearch(direction) {
    if (jsonSearchState.marks.length) setJsonSearchIndex(jsonSearchState.index + direction);
}

async function setupWindowControls() {
    const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow;
    if (typeof getCurrentWindow !== 'function') return;
    const appWindow = getCurrentWindow();
    const maximizeButton = document.getElementById('window-maximize');
    const syncMaximized = async () => {
        try {
            const maximized = await appWindow.isMaximized();
            document.documentElement.classList.toggle('is-maximized', maximized);
            maximizeButton.classList.toggle('is-maximized', maximized);
            maximizeButton.title = maximized ? '还原' : '最大化';
            maximizeButton.setAttribute('aria-label', maximizeButton.title);
        } catch (error) {
            console.error('读取窗口状态失败', error);
        }
    };
    document.getElementById('window-controls').hidden = false;
    const actions = {
        'window-minimize': () => appWindow.minimize(),
        'window-maximize': async () => { await appWindow.toggleMaximize(); await syncMaximized(); },
        'window-close': () => appWindow.close(),
    };
    Object.entries(actions).forEach(([id, action]) => {
        document.getElementById(id).addEventListener('click', async () => {
            try {
                await action();
            } catch (error) {
                console.error('窗口操作失败', error);
                setStatus('窗口操作失败，请重试', 'error');
            }
        });
    });
    await syncMaximized();
    try {
        await appWindow.onResized(syncMaximized);
    } catch (error) {
        console.error('监听窗口状态失败', error);
    }
}

function setupEvents() {
    document.addEventListener('visibilitychange', syncCurrentTimeTimer);
    window.addEventListener('pagehide', () => {
        clearInterval(currentTimeTimer);
        currentTimeTimer = null;
    });
    window.addEventListener('pageshow', syncCurrentTimeTimer);
    const toolSelectWrap = document.getElementById('tool-select');
    const toolSelectBtn = document.getElementById('tool-select-btn');
    const toolSelectMenu = document.getElementById('tool-select-menu');
    const toolOptions = [...toolSelectMenu.querySelectorAll('.tool-select-option')];
    const closeToolMenu = () => {
        toolSelectMenu.hidden = true;
        toolSelectBtn.setAttribute('aria-expanded', 'false');
    };
    const openToolMenu = (focusSelected = false) => {
        toolSelectMenu.hidden = false;
        toolSelectBtn.setAttribute('aria-expanded', 'true');
        if (focusSelected) {
            (toolOptions.find((option) => option.getAttribute('aria-selected') === 'true') || toolOptions[0])?.focus();
        }
    };
    const selectTool = (tool) => {
        toolOptions.forEach((option) => {
            const selected = option.dataset.tool === tool;
            option.setAttribute('aria-selected', String(selected));
            if (selected) {
                const iconHref = option.querySelector('use')?.getAttribute('href');
                const label = option.querySelector('.tool-select-label')?.textContent;
                if (iconHref) document.getElementById('tool-select-current-icon')?.setAttribute('href', iconHref);
                if (label) document.getElementById('tool-select-current-label').textContent = label;
            }
        });
        document.querySelectorAll('.tab-content').forEach((item) => item.classList.toggle('active', item.id === `${tool}-tab`));
        document.getElementById('titlebar-json-actions').hidden = tool !== 'json';
        document.getElementById('titlebar-time-actions').hidden = tool !== 'time';
        syncCurrentTimeTimer();
    };
    toolSelectBtn.addEventListener('click', () => {
        if (toolSelectMenu.hidden) openToolMenu();
        else closeToolMenu();
    });
    toolSelectBtn.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openToolMenu(true);
        } else if (event.key === 'Escape' && !toolSelectMenu.hidden) {
            event.preventDefault();
            closeToolMenu();
        }
    });
    toolOptions.forEach((option, index) => {
        option.addEventListener('click', () => {
            selectTool(option.dataset.tool);
            closeToolMenu();
            toolSelectBtn.focus();
        });
        option.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const next = toolOptions[(index + (event.key === 'ArrowDown' ? 1 : -1) + toolOptions.length) % toolOptions.length];
                next?.focus();
            } else if (event.key === 'Home') {
                event.preventDefault();
                toolOptions[0]?.focus();
            } else if (event.key === 'End') {
                event.preventDefault();
                toolOptions[toolOptions.length - 1]?.focus();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeToolMenu();
                toolSelectBtn.focus();
            } else if (event.key === 'Tab') {
                closeToolMenu();
            }
        });
    });
    document.addEventListener('pointerdown', (event) => {
        if (!toolSelectMenu.hidden && !toolSelectWrap.contains(event.target)) closeToolMenu();
    });
    document.getElementById('time-direction-btn').addEventListener('click', (event) => {
        activeTimeMode = activeTimeMode === 'timestamp' ? 'datetime' : 'timestamp';
        document.getElementById('time-direction-arrow').textContent = activeTimeMode === 'timestamp' ? '→' : '←';
        event.currentTarget.setAttribute('aria-label', `${activeTimeMode === 'timestamp' ? '时间戳转日期' : '日期转时间戳'}，点击切换方向`);
        const input = document.getElementById('time-input');
        input.placeholder = activeTimeMode === 'timestamp' ? '时间戳' : '2026-10-18 12:00:00 · 2026/10/18 · 20261018 · ISO 8601…';
        input.title = activeTimeMode === 'timestamp' ? '' : [
            '2026-10-18 12:00:00',
            '2026/10/18 12:00',
            '2026.10.18',
            '2026年10月18日 12:00:00',
            '20261018 / 202610181200 / 20261018120000',
            '2026-10-18 12:00:00.123',
            '2026-10-18T12:00:00+08:00',
            '2026-10-18T04:00:00Z',
            'Sun, 18 Oct 2026 12:00:00 +0800',
        ].join('\n');
        document.getElementById('time-error').textContent = '';
    });
    document.getElementById('convert-time-btn').addEventListener('click', convertTimeEntry);
    document.getElementById('time-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); convertTimeEntry(); } });
    document.getElementById('clear-history-btn').addEventListener('click', () => { timeHistory = []; saveHistory(); renderHistory(); setStatus('历史已清空'); });
    document.querySelectorAll('.copy-btn').forEach((button) => button.addEventListener('click', () => copyText(document.getElementById(button.dataset.copyTarget).textContent, button)));
    document.querySelectorAll('[data-json-action]').forEach((button) => button.addEventListener('click', () => jsonAction(button.dataset.jsonAction, button)));
    document.getElementById('json-input').addEventListener('input', updateJsonTree);
    const searchInput = document.getElementById('json-search-input');
    searchInput.addEventListener('input', applyJsonSearch);
    searchInput.addEventListener('keydown', (event) => {
        if (event.isComposing) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            moveJsonSearch(event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            searchInput.value = '';
            applyJsonSearch();
        }
    });
    document.getElementById('json-search-prev').addEventListener('click', () => moveJsonSearch(-1));
    document.getElementById('json-search-next').addEventListener('click', () => moveJsonSearch(1));
    const jsonInput = document.getElementById('json-input');
    jsonInput.addEventListener('scroll', syncJsonHighlights);
    new ResizeObserver(syncJsonHighlights).observe(jsonInput);
    const panelTabs = [...document.querySelectorAll('[data-json-panel]')];
    panelTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectJsonPanel(tab.dataset.jsonPanel));
        tab.addEventListener('keydown', (event) => {
            let target;
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') target = panelTabs[1 - index];
            else if (event.key === 'Home') target = panelTabs[0];
            else if (event.key === 'End') target = panelTabs[panelTabs.length - 1];
            else return;
            event.preventDefault();
            target.focus();
            selectJsonPanel(target.dataset.jsonPanel);
        });
    });
}

async function init() {
    setupEvents(); await setupWindowControls(); renderHistory(); await loadTimezones(); syncCurrentTimeTimer(); jsonStats(''); setStatus('就绪');
}

document.addEventListener('DOMContentLoaded', init);
