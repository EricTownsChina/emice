import JSONEditor from 'jsoneditor';
import 'jsoneditor/dist/jsoneditor.css';

const JSONEditorClass = JSONEditor.default || JSONEditor;

// 获取 Tauri API - Tauri 2.0 使用 window.__TAURI__
function getInvoke() {
    console.log('检查 Tauri API:', {
        hasTAURI: !!window.__TAURI__,
        TAURI: window.__TAURI__,
        hasCore: !!(window.__TAURI__ && window.__TAURI__.core),
        hasInvoke: !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
    });
    
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        return window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
    }
    if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
        return window.__TAURI__.tauri.invoke.bind(window.__TAURI__.tauri);
    }
    console.error('Tauri API 不可用:', window.__TAURI__);
    throw new Error('Tauri invoke API not available');
}

const defaultTimezone = '北京';
let timestampTimezone = defaultTimezone;
let datetimeTimezone = defaultTimezone;
let currentTimeTimer = null;

function getSelectedTimezone(selectId, fallback) {
    const select = document.getElementById(selectId);
    if (!select) {
        return fallback;
    }
    return select.value || fallback;
}

function loadConversionTimezonePreference() {
    const savedTimestampTimezone = localStorage.getItem('emice_timestamp_timezone');
    const savedDatetimeTimezone = localStorage.getItem('emice_datetime_timezone');

    if (savedTimestampTimezone) {
        timestampTimezone = savedTimestampTimezone;
    }
    if (savedDatetimeTimezone) {
        datetimeTimezone = savedDatetimeTimezone;
    }
}

function saveConversionTimezonePreference() {
    localStorage.setItem('emice_timestamp_timezone', timestampTimezone);
    localStorage.setItem('emice_datetime_timezone', datetimeTimezone);
}

function formatUtcOffset(offsetMinutes) {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    if (minutes === 0) {
        return `UTC${sign}${hours}`;
    }
    return `UTC${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
}

async function loadTimezones() {
    try {
        const invoke = getInvoke();
        const timezones = await invoke("get_timezone_list");
        console.log("加载时区列表:", timezones);

        const timestampSelect = document.getElementById('timestamp-timezone');
        const datetimeSelect = document.getElementById('datetime-timezone');
        if (!timestampSelect || !datetimeSelect) {
            console.error('找不到转换时区选择元素');
            return;
        }

        const buildOptions = (select) => {
            select.innerHTML = '';
            timezones.forEach((tz) => {
                const option = document.createElement('option');
                const offsetStr = formatUtcOffset(tz.offset_minutes);
                option.value = tz.name;
                option.textContent = `${tz.name} (${offsetStr})`;
                select.appendChild(option);
            });
        };

        buildOptions(timestampSelect);
        buildOptions(datetimeSelect);

        const availableTimezoneNames = new Set(timezones.map((tz) => tz.name));
        if (!availableTimezoneNames.has(timestampTimezone)) {
            timestampTimezone = defaultTimezone;
        }
        if (!availableTimezoneNames.has(datetimeTimezone)) {
            datetimeTimezone = defaultTimezone;
        }

        timestampSelect.value = timestampTimezone;
        datetimeSelect.value = datetimeTimezone;

        timestampSelect.addEventListener('change', (e) => {
            timestampTimezone = e.target.value || defaultTimezone;
            saveConversionTimezonePreference();
        });

        datetimeSelect.addEventListener('change', (e) => {
            datetimeTimezone = e.target.value || defaultTimezone;
            saveConversionTimezonePreference();
        });

        saveConversionTimezonePreference();
    } catch (error) {
        console.error("加载时区列表失败:", error);
    }
}

async function updateCurrentTime() {
    try {
        const invoke = getInvoke();
        const result = await invoke('get_current_time');
        console.log("获取当前时间戳:", result);
        document.getElementById("current-timestamp").textContent = result.timestamp;
    } catch (error) {
        console.error("获取当前时间失败:", error);
    }
}

function startCurrentTimeTimer() {
    if (currentTimeTimer) {
        clearInterval(currentTimeTimer);
    }
    updateCurrentTime();
    currentTimeTimer = setInterval(updateCurrentTime, 1000);
}

async function convertTimestamp() {
    const input = document.getElementById("timestamp-input");
    const value = input.value.trim();
    
    if (!value) {
        alert("请输入时间戳");
        return;
    }
    
    const timestamp = parseInt(value);
    if (isNaN(timestamp)) {
        alert("请输入有效的数字");
        return;
    }
    
    try {
        const invoke = getInvoke();
        const timezoneName = getSelectedTimezone('timestamp-timezone', defaultTimezone);
        const result = await invoke("timestamp_to_datetime", {
            timestamp: timestamp,
            timezoneName,
        });
        console.log("时间戳转换结果:", result);
        document.getElementById("timestamp-result").value = result;
    } catch (error) {
        console.error("转换失败:", error);
        alert("转换失败: " + error);
    }
}

async function convertDatetime() {
    const input = document.getElementById("datetime-input");
    const value = input.value.trim();
    
    if (!value) {
        alert("请输入时间");
        return;
    }
    
    try {
        const invoke = getInvoke();
        const timezoneName = getSelectedTimezone('datetime-timezone', defaultTimezone);
        const result = await invoke("datetime_to_timestamp", {
            datetimeStr: value,
            timezoneName,
        });
        console.log("时间转换结果:", result);
        document.getElementById("datetime-result").value = result;
    } catch (error) {
        console.error("转换失败:", error);
        alert("转换失败: " + error);
    }
}

function copyToClipboard(targetId) {
    const element = document.getElementById(targetId);
    const text = element.value || element.textContent;
    
    if (text === '-' || !text) {
        return;
    }
    
    const btn = document.querySelector(`[data-target="${targetId}"]`);
    if (!btn) return;
    
    const originalHTML = btn.innerHTML;
    
    navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        setTimeout(() => {
            btn.innerHTML = originalHTML;
        }, 1000);
    }).catch(err => {
        console.error("复制失败:", err);
    });
}

function setupTabSwitching() {
    const tabs = document.querySelectorAll(".tab");
    const contents = document.querySelectorAll(".tab-content");
    
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            
            tab.classList.add("active");
            const targetId = tab.dataset.tab + "-tab";
            document.getElementById(targetId).classList.add("active");
            
            const tabName = tab.dataset.tab;
            updateTheme(tabName);
            if (tabName === 'json') {
                requestAnimationFrame(() => {
                    focusJsonEditorCursor();
                });
            }
        });
    });
}

function updateTheme(tabName) {
    if (!tabName) {
        return;
    }
}

let initialized = false;
let jsonEditor = null;
const jsonSearchState = {
    query: '',
    previewIndex: -1,
    textIndex: -1,
};

function setJsonSearchStatus(current = 0, total = 0) {
    const status = document.getElementById('json-search-status');
    if (!status) {
        return;
    }
    if (!total) {
        status.textContent = '';
        return;
    }
    status.textContent = `${current}/${total}`;
}

function countSubstringMatches(content, query) {
    if (!content || !query) {
        return 0;
    }

    const source = content.toLowerCase();
    const keyword = query.toLowerCase();
    let count = 0;
    let from = 0;

    while (from <= source.length) {
        const index = source.indexOf(keyword, from);
        if (index === -1) {
            break;
        }
        count += 1;
        from = index + keyword.length;
    }

    return count;
}

function getSubstringMatchIndices(content, query) {
    if (!content || !query) {
        return [];
    }

    const source = content.toLowerCase();
    const keyword = query.toLowerCase();
    const indices = [];
    let from = 0;

    while (from <= source.length) {
        const index = source.indexOf(keyword, from);
        if (index === -1) {
            break;
        }
        indices.push(index);
        from = index + keyword.length;
    }

    return indices;
}

function getNextIndex(current, total, direction) {
    if (total <= 0) {
        return -1;
    }
    if (current < 0 || current >= total) {
        return direction === 'prev' ? total - 1 : 0;
    }
    return direction === 'prev'
        ? (current - 1 + total) % total
        : (current + 1) % total;
}

function resetJsonSearchStateIfQueryChanged(query) {
    if (jsonSearchState.query === query) {
        return;
    }
    jsonSearchState.query = query;
    jsonSearchState.previewIndex = -1;
    jsonSearchState.textIndex = -1;
}

function clearPreviewHighlights(container) {
    const marks = container.querySelectorAll('mark.json-search-mark');
    marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
    });
}

function findTextRangeByOffset(root, start, length) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const nodeLength = node.textContent ? node.textContent.length : 0;
        const nodeStart = offset;
        const nodeEnd = offset + nodeLength;

        if (!startNode && start >= nodeStart && start <= nodeEnd) {
            startNode = node;
            startOffset = start - nodeStart;
        }

        if (startNode && start + length >= nodeStart && start + length <= nodeEnd) {
            endNode = node;
            endOffset = start + length - nodeStart;
            break;
        }

        offset = nodeEnd;
    }

    if (!startNode || !endNode) {
        return null;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
}

function updateJsonSearchCount(query, mode) {
    if (!jsonEditor || !query) {
        setJsonSearchStatus('');
        return;
    }

    if (mode === 'tree') {
        const searchBox = jsonEditor.searchBox;
        const count = Array.isArray(searchBox?.results) ? searchBox.results.length : 0;
        const current = count > 0 ? (searchBox.resultIndex ?? 0) + 1 : 0;
        setJsonSearchStatus(current, count);
        return;
    }

    if ((mode === 'code' || mode === 'text') && jsonEditor.aceEditor) {
        const content = jsonEditor.aceEditor.getValue();
        const matches = getSubstringMatchIndices(content, query);
        const range = jsonEditor.aceEditor.getSelectionRange();
        const startIndex = jsonEditor.aceEditor.session.doc.positionToIndex(range.start);
        const current = matches.findIndex((index) => index === startIndex);
        setJsonSearchStatus(current >= 0 ? current + 1 : (matches.length ? 1 : 0), matches.length);
        return;
    }

    if (mode === 'text' && jsonEditor.textarea) {
        const content = jsonEditor.textarea.value;
        const matches = getSubstringMatchIndices(content, query);
        const currentPos = jsonEditor.textarea.selectionStart;
        const current = matches.findIndex((index) => index === currentPos);
        setJsonSearchStatus(current >= 0 ? current + 1 : (matches.length ? 1 : 0), matches.length);
        return;
    }

    const editorContainer = document.getElementById('json-editor-container');
    const content = editorContainer ? editorContainer.innerText : '';
    const count = countSubstringMatches(content, query);
    setJsonSearchStatus(count ? 1 : 0, count);
}

function searchInTextArea(query, direction) {
    const textarea = jsonEditor?.textarea;
    if (!textarea) {
        return false;
    }

    const matches = getSubstringMatchIndices(textarea.value, query);
    if (!matches.length) {
        setJsonSearchStatus(0, 0);
        return true;
    }

    jsonSearchState.textIndex = getNextIndex(jsonSearchState.textIndex, matches.length, direction);
    const targetIndex = matches[jsonSearchState.textIndex];
    textarea.focus();
    textarea.setSelectionRange(targetIndex, targetIndex + query.length);
    setJsonSearchStatus(jsonSearchState.textIndex + 1, matches.length);
    return true;
}

function searchInPreview(query, direction) {
    const previewRoot = document.querySelector('#json-editor-container .jsoneditor-preview');
    if (!previewRoot) {
        return false;
    }

    clearPreviewHighlights(previewRoot);
    const content = previewRoot.textContent || '';
    const matches = getSubstringMatchIndices(content, query);
    if (!matches.length) {
        setJsonSearchStatus(0, 0);
        return true;
    }

    jsonSearchState.previewIndex = getNextIndex(jsonSearchState.previewIndex, matches.length, direction);
    const start = matches[jsonSearchState.previewIndex];
    const range = findTextRangeByOffset(previewRoot, start, query.length);

    if (range) {
        const mark = document.createElement('mark');
        mark.className = 'json-search-mark';
        try {
            range.surroundContents(mark);
            mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (_) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    setJsonSearchStatus(jsonSearchState.previewIndex + 1, matches.length);
    return true;
}

function focusJsonSearchInput() {
    const searchInput = document.getElementById('json-search-input');
    if (!searchInput) {
        return;
    }
    const cursorAt = searchInput.value.length;
    searchInput.focus();
    searchInput.setSelectionRange(cursorAt, cursorAt);
}

function focusJsonEditorCursor() {
    if (!jsonEditor) {
        return;
    }

    if (jsonEditor.aceEditor) {
        jsonEditor.aceEditor.focus();
        jsonEditor.aceEditor.clearSelection();
        jsonEditor.aceEditor.moveCursorTo(0, 0);
        return;
    }

    if (jsonEditor.textarea) {
        jsonEditor.textarea.focus();
        jsonEditor.textarea.setSelectionRange(0, 0);
        return;
    }

    if (typeof jsonEditor.focus === 'function') {
        jsonEditor.focus();
    }
}

function runJsonSearch(direction = 'next', keepFocus = false) {
    if (!jsonEditor) {
        return;
    }

    const searchInput = document.getElementById('json-search-input');
    const query = searchInput ? searchInput.value.trim() : '';
    if (!query) {
        jsonSearchState.query = '';
        jsonSearchState.previewIndex = -1;
        jsonSearchState.textIndex = -1;
        const previewRoot = document.querySelector('#json-editor-container .jsoneditor-preview');
        if (previewRoot) {
            clearPreviewHighlights(previewRoot);
        }
        setJsonSearchStatus(0, 0);
        return;
    }

    resetJsonSearchStateIfQueryChanged(query);

    const mode = typeof jsonEditor.getMode === 'function' ? jsonEditor.getMode() : 'tree';

    if ((mode === 'code' || mode === 'text') && jsonEditor.aceEditor) {
        jsonEditor.aceEditor.find(query, {
            backwards: direction === 'prev',
            wrap: true,
            caseSensitive: false,
            wholeWord: false,
            regExp: false,
        });
        updateJsonSearchCount(query, mode);
        return;
    }

    if (mode === 'text' && searchInTextArea(query, direction)) {
        return;
    }

    if (mode === 'tree') {
        const searchBox = jsonEditor.searchBox;
        if (searchBox && searchBox.dom && searchBox.dom.search) {
            if (searchBox.dom.search.value !== query) {
                searchBox.dom.search.value = query;
                if (typeof searchBox._onSearch === 'function') {
                    searchBox._onSearch();
                }
            }

            if (direction === 'prev' && typeof searchBox.previous === 'function') {
                searchBox.previous();
            } else if (typeof searchBox.next === 'function') {
                searchBox.next();
            }

            updateJsonSearchCount(query, mode);
            if (keepFocus) {
                focusJsonSearchInput();
            }
            return;
        }

        if (typeof jsonEditor.search === 'function') {
            jsonEditor.search(query);
            updateJsonSearchCount(query, mode);
            if (keepFocus) {
                focusJsonSearchInput();
            }
            return;
        }
    }

    if (mode === 'preview' && searchInPreview(query, direction)) {
        if (keepFocus) {
            focusJsonSearchInput();
        }
        return;
    }

    if (typeof window.find === 'function') {
        window.find(query, false, direction === 'prev', true, false, false, false);
        updateJsonSearchCount(query, mode);
        if (keepFocus) {
            focusJsonSearchInput();
        }
    }
}

function setupJSONTools() {
    const editorContainer = document.getElementById('json-editor-container');
    const searchInput = document.getElementById('json-search-input');
    const searchPrevBtn = document.getElementById('json-search-prev-btn');
    const searchNextBtn = document.getElementById('json-search-next-btn');
    if (!editorContainer) {
        console.error('找不到JSON编辑器容器');
        return;
    }

    jsonEditor = new JSONEditorClass(editorContainer, {
        mode: 'code',
        modes: ['tree', 'code', 'text', 'preview'],
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        search: true,
    });

    jsonEditor.setText('');

    if (searchPrevBtn) {
        searchPrevBtn.addEventListener('click', () => runJsonSearch('prev', true));
    }
    if (searchNextBtn) {
        searchNextBtn.addEventListener('click', () => runJsonSearch('next', true));
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (!searchInput.value.trim()) {
                setJsonSearchStatus(0, 0);
            }
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runJsonSearch(event.shiftKey ? 'prev' : 'next', true);
            }
        });
    }

    editorContainer.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        const mode = typeof jsonEditor?.getMode === 'function' ? jsonEditor.getMode() : '';
        if (mode !== 'code' && mode !== 'text' && mode !== 'preview') {
            return;
        }

        const query = (searchInput?.value || '').trim();
        if (!query) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        runJsonSearch(event.shiftKey ? 'prev' : 'next', false);
    }, true);
}

function initApp() {
    if (initialized) {
        console.warn('应用已经初始化，跳过重复初始化');
        return;
    }
    initialized = true;
    
    console.log('页面加载完成');
    console.log('Tauri API 状态:', window.__TAURI__);
    
    loadConversionTimezonePreference();
    loadTimezones();
    startCurrentTimeTimer();
    setupTabSwitching();
    setupJSONTools();
    
    document.getElementById("convert-timestamp-btn").addEventListener("click", convertTimestamp);
    document.getElementById("convert-datetime-btn").addEventListener("click", convertDatetime);
    
    document.getElementById("timestamp-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            convertTimestamp();
        }
    });
    
    document.getElementById("datetime-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            convertDatetime();
        }
    });
    
    document.querySelectorAll(".copy-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetId = btn.dataset.target;
            copyToClipboard(targetId);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
