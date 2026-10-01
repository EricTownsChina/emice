const DEFAULT_TIMEZONE = '北京';
const TIMEZONE_FALLBACK = [
    ['UTC', 'UTC'], ['北京', 'Asia/Shanghai'], ['东京', 'Asia/Tokyo'], ['新德里', 'Asia/Kolkata'],
    ['迪拜', 'Asia/Dubai'], ['巴黎', 'Europe/Paris'], ['莫斯科', 'Europe/Moscow'], ['纽约', 'America/New_York'],
    ['洛杉矶', 'America/Los_Angeles'], ['悉尼', 'Australia/Sydney'],
];
const STORAGE_KEY = 'emice-time-history-v2';
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
    const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) throw new Error('请使用 yyyy-MM-dd HH:mm:ss 格式');
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    const zone = timezoneIds.get(timezoneName) || 'Asia/Shanghai';
    const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    const offset = timezoneOffsetAt(zone, new Date(guess));
    return guess - offset * 60000;
}

function timezoneOffsetAt(zone, date) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(date);
    const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : 0;
}

function formatDelta(current, previous) {
    if (previous == null) return '—';
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '-';
    let seconds = Math.round(Math.abs(diff) / 1000);
    const days = Math.floor(seconds / 86400); seconds %= 86400;
    const hours = Math.floor(seconds / 3600); seconds %= 3600;
    const minutes = Math.floor(seconds / 60); seconds %= 60;
    const chunks = [];
    if (days) chunks.push(`${days}天`);
    if (hours) chunks.push(`${hours}时`);
    if (minutes) chunks.push(`${minutes}分`);
    if (seconds || !chunks.length) chunks.push(`${seconds}秒`);
    return `${sign}${chunks.slice(0, 2).join(' ')}`;
}

async function convertTimeEntries() {
    const input = document.getElementById('time-input');
    const error = document.getElementById('time-error');
    const values = input.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!values.length) { error.textContent = '请输入至少一条时间'; input.focus(); return; }
    error.textContent = '';
    const timezoneName = document.getElementById('time-timezone').value || DEFAULT_TIMEZONE;
    const next = [];
    try {
        for (const value of values) {
            const timestamp = activeTimeMode === 'timestamp' ? normalizeTimestamp(value) : Number(await command('datetime_to_timestamp', { datetimeStr: value, timezoneName }));
            if (!Number.isFinite(timestamp)) throw new Error('转换结果无效');
            const localTime = activeTimeMode === 'timestamp' ? await command('timestamp_to_datetime', { timestamp, timezoneName }) : value;
            next.push({ id: `${Date.now()}-${Math.random()}`, input: value, timezone: timezoneName, timestamp, localTime, mode: activeTimeMode });
        }
    } catch (caught) { error.textContent = String(caught?.message || caught).replace(/^Error:\s*/, ''); setStatus('转换失败', 'error'); return; }
    timeHistory = [...next.reverse(), ...timeHistory].slice(0, 60);
    saveHistory(); renderHistory(); input.value = '';
    setStatus(`${next.length} 条已加入历史`);
}

function renderHistory() {
    const body = document.getElementById('history-body');
    const empty = document.getElementById('history-empty');
    document.getElementById('history-count').textContent = timeHistory.length;
    empty.hidden = timeHistory.length > 0;
    body.innerHTML = timeHistory.map((item, index) => `<tr><td class="mono input-cell" title="${escapeHtml(item.input)}">${escapeHtml(item.input)}</td><td><span class="zone-pill">${escapeHtml(item.timezone)}</span></td><td class="mono">${item.timestamp}</td><td class="mono local-cell">${escapeHtml(item.localTime)}</td><td class="delta ${index && item.timestamp >= timeHistory[index - 1].timestamp ? 'positive' : ''}">${formatDelta(item.timestamp, timeHistory[index - 1]?.timestamp)}</td><td class="row-actions"><button class="row-btn copy-record" data-id="${item.id}" title="复制时间戳">⧉</button><button class="row-btn delete-record" data-id="${item.id}" title="删除记录">×</button></td></tr>`).join('');
    body.querySelectorAll('.copy-record').forEach((button) => button.addEventListener('click', () => copyText(timeHistory.find((item) => item.id === button.dataset.id)?.timestamp)));
    body.querySelectorAll('.delete-record').forEach((button) => button.addEventListener('click', () => { timeHistory = timeHistory.filter((item) => item.id !== button.dataset.id); saveHistory(); renderHistory(); }));
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

async function copyText(value) {
    if (value == null) return;
    try { await navigator.clipboard.writeText(String(value)); setStatus('已复制'); } catch (_) { setStatus('复制失败', 'error'); }
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
    const result = readJson(); jsonStats(document.getElementById('json-input').value); updateJsonValidity(result); renderJsonTree(result.value); applyJsonSearch();
    if (result.error) document.getElementById('json-message').textContent = result.error.message.replace(/^JSON.parse:\s*/, ''); else document.getElementById('json-message').textContent = '';
}

function jsonAction(action) {
    const input = document.getElementById('json-input'); const result = readJson();
    if (action === 'clear') { input.value = ''; updateJsonTree(); return; }
    if (action === 'sample') { input.value = JSON.stringify({ name: 'Emice', createdAt: 1704067200, features: ['format', 'tree', 'history'], config: { compact: false, locale: 'zh-CN' } }, null, 2); updateJsonTree(); return; }
    if (action === 'copy') { copyText(input.value); return; }
    if (action === 'escape') { input.value = JSON.stringify(input.value).slice(1, -1); updateJsonTree(); return; }
    if (action === 'unescape') { try { input.value = JSON.parse(`"${input.value.replace(/"/g, '\\"')}"`); } catch (_) { input.value = input.value.replace(/\\([\\"'\/bfnrt])/g, '$1'); } updateJsonTree(); return; }
    if (result.error) { document.getElementById('json-message').textContent = '请先修正 JSON 格式'; return; }
    input.value = JSON.stringify(result.value, null, action === 'compact' ? 0 : 2); updateJsonTree();
}

function applyJsonSearch() {
    const query = document.getElementById('json-search-input').value.trim().toLowerCase(); const nodes = [...document.querySelectorAll('#json-tree .tree-node')]; let count = 0;
    nodes.forEach((node) => { const matched = !query || node.textContent.toLowerCase().includes(query); node.hidden = Boolean(query && !matched); if (matched && query) count += 1; });
    document.getElementById('json-search-count').textContent = query ? `${count} 项` : '';
}

function setAllJsonDetails(open) { document.querySelectorAll('#json-tree details').forEach((details) => { details.open = open; }); }

function setupEvents() {
    document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab)); document.querySelectorAll('.tab-content').forEach((item) => item.classList.toggle('active', item.id === `${tab.dataset.tab}-tab`)); }));
    document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', () => { activeTimeMode = button.dataset.mode; document.querySelectorAll('.mode-btn').forEach((item) => item.classList.toggle('active', item === button)); const input = document.getElementById('time-input'); input.placeholder = activeTimeMode === 'timestamp' ? '每行一条，例如：1704067200\n支持秒或毫秒时间戳' : '每行一条，例如：2024-01-01 08:00:00'; document.getElementById('time-input-hint').textContent = activeTimeMode === 'timestamp' ? '可一次粘贴多条，按行转换' : '支持日期、分钟或秒格式'; }));
    document.getElementById('convert-time-btn').addEventListener('click', convertTimeEntries);
    document.getElementById('time-input').addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') convertTimeEntries(); });
    document.getElementById('fill-now-btn').addEventListener('click', () => { document.getElementById('time-input').value = activeTimeMode === 'timestamp' ? String(Math.floor(Date.now() / 1000)) : new Date().toISOString().slice(0, 19).replace('T', ' '); });
    document.getElementById('clear-history-btn').addEventListener('click', () => { timeHistory = []; saveHistory(); renderHistory(); setStatus('历史已清空'); });
    document.querySelectorAll('.copy-btn').forEach((button) => button.addEventListener('click', () => copyText(document.getElementById(button.dataset.copyTarget).textContent)));
    document.querySelectorAll('[data-json-action]').forEach((button) => button.addEventListener('click', () => jsonAction(button.dataset.jsonAction)));
    document.getElementById('json-input').addEventListener('input', updateJsonTree);
    document.getElementById('json-search-input').addEventListener('input', applyJsonSearch);
    document.getElementById('expand-json-btn').addEventListener('click', () => setAllJsonDetails(true));
    document.getElementById('collapse-json-btn').addEventListener('click', () => setAllJsonDetails(false));
}

async function init() {
    setupEvents(); renderHistory(); await loadTimezones(); updateCurrentTime(); setInterval(updateCurrentTime, 1000); jsonStats(''); setStatus('就绪');
}

document.addEventListener('DOMContentLoaded', init);
