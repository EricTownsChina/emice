const DEFAULT_TIMEZONE = '北京';
const TIMEZONE_FALLBACK = [
    ['UTC', 'UTC'], ['北京', 'Asia/Shanghai'], ['东京', 'Asia/Tokyo'], ['新德里', 'Asia/Kolkata'],
    ['迪拜', 'Asia/Dubai'], ['巴黎', 'Europe/Paris'], ['莫斯科', 'Europe/Moscow'], ['纽约', 'America/New_York'],
    ['洛杉矶', 'America/Los_Angeles'], ['悉尼', 'Australia/Sydney'],
];
const STORAGE_KEY = 'emice-time-history-v2';
const copyFeedback = new WeakMap();
const timezoneIds = new Map(TIMEZONE_FALLBACK);
let invokeApi = null;
let activeTimeMode = 'timestamp';
let timezones = [];
let timeHistory = loadHistory();

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
    saveHistory(); renderHistory(); input.value = '';
    setStatus('已加入历史');
}

function renderHistory() {
    const body = document.getElementById('history-body');
    body.innerHTML = timeHistory.map((item) => `<tr><td class="mono input-cell" title="${escapeHtml(item.input)}">${escapeHtml(item.input)}</td><td><span class="zone-pill">${escapeHtml(item.timezone)}</span></td><td class="mono">${item.timestamp}</td><td class="mono local-cell">${escapeHtml(item.localTime)}</td><td class="row-actions"><button class="row-btn copy-record" data-id="${item.id}" title="复制时间戳">⧉</button><button class="row-btn delete-record" data-id="${item.id}" title="删除记录">×</button></td></tr>`).join('');
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
        text: button.textContent,
        title: button.title,
        label: button.getAttribute('aria-label'),
    };
    button.textContent = success ? '✓' : '!';
    button.title = success ? '已复制' : '复制失败，请重试';
    button.setAttribute('aria-label', button.title);
    button.classList.toggle('copy-success', success);
    button.classList.toggle('copy-error', !success);
    const timer = setTimeout(() => {
        button.textContent = original.text;
        button.title = original.title;
        if (original.label === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', original.label);
        button.classList.remove('copy-success', 'copy-error');
        copyFeedback.delete(button);
    }, 1500);
    copyFeedback.set(button, { original, timer });
}

function updateCurrentTime() { command('get_current_time').then((result) => { document.getElementById('current-timestamp').textContent = result.timestamp; }).catch(() => {}); }

function jsonStats(value) {
    const lines = value ? value.split(/\r?\n/).length : 1;
    document.getElementById('json-stats').textContent = `${lines} 行 · ${value.length} 字符`;
    document.getElementById('json-line-count').textContent = `第 ${lines} 行`;
}

function readJson() {
    const raw = document.getElementById('json-input').value.trim();
    if (!raw) return { raw, value: null, error: null };
    try { return { raw, value: JSON.parse(raw), error: null }; } catch (error) { return { raw, value: null, error }; }
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

function renderJsonTree(value) {
    const tree = document.getElementById('json-tree');
    if (value === null || value === undefined) { tree.innerHTML = '<div class="tree-placeholder">输入有效 JSON 后显示结构</div>'; return; }
    tree.innerHTML = nodeLabel(value, null);
}

function updateJsonTree() {
    jsonStats(document.getElementById('json-input').value);
    document.getElementById('json-message').textContent = '';
    if (document.getElementById('json-preview').hidden) { applyJsonSearch(); return; }
    const result = readJson(); updateJsonValidity(result); renderJsonTree(result.value); applyJsonSearch();
    if (result.error) document.getElementById('json-message').textContent = result.error.message.replace(/^JSON.parse:\s*/, ''); else document.getElementById('json-message').textContent = '';
}

function toggleJsonPreview() {
    const preview = document.getElementById('json-preview');
    preview.hidden = !preview.hidden;
    document.querySelector('.json-workspace').classList.toggle('preview-open', !preview.hidden);
    const button = document.getElementById('toggle-json-preview-btn');
    button.setAttribute('aria-expanded', String(!preview.hidden));
    button.textContent = preview.hidden ? '展开视图' : '收起视图';
    if (preview.hidden) document.getElementById('json-tree').replaceChildren();
    updateJsonTree();
}

function jsonAction(action) {
    const input = document.getElementById('json-input');
    if (action === 'clear') { input.value = ''; updateJsonTree(); return; }
    if (action === 'copy') { copyText(input.value); return; }
    if (action === 'escape') { input.value = JSON.stringify(input.value).slice(1, -1); updateJsonTree(); return; }
    if (action === 'unescape') { try { input.value = JSON.parse(`"${input.value.replace(/"/g, '\\"')}"`); } catch (_) { input.value = input.value.replace(/\\([\\"'\/bfnrt])/g, '$1'); } updateJsonTree(); return; }
    const result = readJson();
    if (result.error) { document.getElementById('json-message').textContent = '请先修正 JSON 格式'; return; }
    input.value = JSON.stringify(result.value, null, action === 'compact' ? 0 : 2); updateJsonTree();
}

function applyJsonSearch() {
    const query = document.getElementById('json-search-input').value.trim().toLowerCase();
    const countLabel = document.getElementById('json-search-count');
    if (document.getElementById('json-preview').hidden) {
        let count = 0;
        if (query) {
            const input = document.getElementById('json-input');
            const text = input.value.toLowerCase();
            for (let index = text.indexOf(query); index !== -1; index = text.indexOf(query, index + query.length)) count += 1;
        }
        countLabel.textContent = query ? `${count} 处` : '';
        return;
    }
    const nodes = [...document.querySelectorAll('#json-tree .tree-node')]; let count = 0;
    nodes.forEach((node) => { const matched = !query || node.textContent.toLowerCase().includes(query); node.hidden = Boolean(query && !matched); if (matched && query) count += 1; });
    countLabel.textContent = query ? `${count} 项` : '';
}

function setAllJsonDetails(open) { document.querySelectorAll('#json-tree details').forEach((details) => { details.open = open; }); }

function setupEvents() {
    document.querySelectorAll('.tool-select').forEach((select) => select.addEventListener('change', () => {
        const tool = select.value;
        document.querySelectorAll('.tool-select').forEach((item) => { item.value = tool; });
        document.querySelectorAll('.tab-content').forEach((item) => item.classList.toggle('active', item.id === `${tool}-tab`));
        document.querySelector('.tab-content.active .tool-select').focus();
    }));
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
    document.querySelectorAll('[data-json-action]').forEach((button) => button.addEventListener('click', () => jsonAction(button.dataset.jsonAction)));
    document.getElementById('json-input').addEventListener('input', updateJsonTree);
    document.getElementById('json-search-input').addEventListener('input', applyJsonSearch);
    document.getElementById('toggle-json-preview-btn').addEventListener('click', toggleJsonPreview);
    document.getElementById('expand-json-btn').addEventListener('click', () => setAllJsonDetails(true));
    document.getElementById('collapse-json-btn').addEventListener('click', () => setAllJsonDetails(false));
}

async function init() {
    setupEvents(); renderHistory(); await loadTimezones(); updateCurrentTime(); setInterval(updateCurrentTime, 1000); jsonStats(''); setStatus('就绪');
}

document.addEventListener('DOMContentLoaded', init);
