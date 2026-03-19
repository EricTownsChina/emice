
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

function stopCurrentTimeTimer() {
    if (currentTimeTimer) {
        clearInterval(currentTimeTimer);
        currentTimeTimer = null;
    }
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
        tab.addEventListener("click", async () => {
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            
            tab.classList.add("active");
            const targetId = tab.dataset.tab + "-tab";
            document.getElementById(targetId).classList.add("active");
            
            const tabName = tab.dataset.tab;
            updateTheme(tabName);
            if (tabName === 'time') {
                startCurrentTimeTimer();
            } else {
                stopCurrentTimeTimer();
            }
            if (tabName === 'json') {
                await ensureJsonEditor();
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
let jsonEditorReady = false;
const jsonFoldState = {
    formatted: false,
    sourceText: '',
    foldRanges: new Map(),
    collapsedLines: new Set(),
    lineMap: [],
    visibleLines: [],
};
const gutterState = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    paddingTop: 12,
    paddingRight: 6,
    lineHeightPx: 20.8,
    fontSizePx: 13,
    foldColWidth: 16,
    totalLines: 1,
    fontFamily: '',
    numberFont: '',
    symbolFont: '',
    cacheCanvas: null,
    cacheCtx: null,
    cacheDirty: true,
    cacheEnabled: true,
    maxCacheHeightCss: 20000,
};
let gutterRenderTimer = 0;
let gutterRenderRaf = 0;

function updateJsonEditorStats(value) {
    const lineCount = document.getElementById('json-line-count');
    const charCount = document.getElementById('json-char-count');
    if (!lineCount || !charCount) {
        return;
    }

    const content = value ?? '';
    const lines = countLines(content);
    lineCount.textContent = `${lines} 行`;
    charCount.textContent = `${content.length} 字符`;
}

function countLines(text) {
    if (!text) {
        return 1;
    }
    let lines = 1;
    for (let i = 0; i < text.length; i += 1) {
        if (text.charCodeAt(i) === 10) {
            lines += 1;
        }
    }
    return lines;
}

function formatJsonText(rawText, pretty = true) {
    if (!rawText) {
        return '';
    }
    try {
        const parsed = JSON.parse(rawText);
        return pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
    } catch (_) {
        return rawText;
    }
}

function buildFoldRanges(text) {
    const ranges = new Map();
    const stack = [];
    let line = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];

        if (char === '\n') {
            line += 1;
            continue;
        }

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (char === '{' || char === '[') {
            stack.push({ char, line });
        } else if (char === '}' || char === ']') {
            const open = stack.pop();
            if (open && open.line < line) {
                ranges.set(open.line, { endLine: line });
            }
        }
    }

    return ranges;
}

function updateGutterMetrics(textarea) {
    const style = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize) || 13;
    let lineHeight = Number.parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight)) {
        lineHeight = fontSize * 1.6;
    }
    const paddingTop = Number.parseFloat(style.paddingTop) || 12;
    gutterState.fontSizePx = fontSize;
    gutterState.lineHeightPx = lineHeight;
    gutterState.paddingTop = paddingTop;
    gutterState.fontFamily = style.fontFamily;
    gutterState.numberFont = `${gutterState.fontSizePx}px ${gutterState.fontFamily}`;
    gutterState.symbolFont = `${gutterState.fontSizePx + 2}px ${gutterState.fontFamily}`;
}

function markGutterCacheDirty() {
    gutterState.cacheDirty = true;
}

function updateGutterCanvasSize() {
    const canvas = gutterState.canvas;
    const ctx = gutterState.ctx;
    if (!canvas || !ctx) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (gutterState.width === rect.width && gutterState.height === rect.height && gutterState.dpr === dpr) {
        return;
    }
    gutterState.dpr = dpr;
    gutterState.width = rect.width;
    gutterState.height = rect.height;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    markGutterCacheDirty();
}

function refreshGutterLayout() {
    const textarea = document.getElementById('json-editor-textarea');
    if (!textarea) {
        return;
    }
    updateGutterMetrics(textarea);
    updateGutterCanvasSize();
}

function ensureGutterCache(totalLines) {
    if (!gutterState.cacheDirty) {
        return;
    }

    const width = gutterState.width;
    const dpr = gutterState.dpr || 1;
    const lineHeight = gutterState.lineHeightPx;
    const paddingTop = gutterState.paddingTop;
    const cacheHeightCss = Math.ceil(paddingTop * 2 + totalLines * lineHeight);

    if (cacheHeightCss > gutterState.maxCacheHeightCss) {
        gutterState.cacheEnabled = false;
        return;
    }

    gutterState.cacheEnabled = true;

    if (!gutterState.cacheCanvas) {
        gutterState.cacheCanvas = document.createElement('canvas');
        gutterState.cacheCtx = gutterState.cacheCanvas.getContext('2d');
    }

    const cacheCanvas = gutterState.cacheCanvas;
    const cacheCtx = gutterState.cacheCtx;
    if (!cacheCanvas || !cacheCtx) {
        gutterState.cacheEnabled = false;
        return;
    }

    cacheCanvas.width = Math.max(1, Math.floor(width * dpr));
    cacheCanvas.height = Math.max(1, Math.floor(cacheHeightCss * dpr));
    cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cacheCtx.clearRect(0, 0, width, cacheHeightCss);

    cacheCtx.font = gutterState.numberFont;
    cacheCtx.textBaseline = 'top';
    cacheCtx.textAlign = 'right';
    cacheCtx.fillStyle = 'rgba(74, 100, 136, 0.7)';
    const numberX = width - gutterState.foldColWidth - gutterState.paddingRight;

    for (let lineIndex = 0; lineIndex < totalLines; lineIndex += 1) {
        const y = paddingTop + lineIndex * lineHeight;
        const textY = y + (lineHeight - gutterState.fontSizePx) / 2;
        cacheCtx.fillText(`${lineIndex + 1}`, numberX, textY);
    }

    if (jsonFoldState.formatted) {
        cacheCtx.font = gutterState.symbolFont;
        cacheCtx.textAlign = 'center';
        cacheCtx.fillStyle = '#4a6488';
        const symbolX = width - gutterState.foldColWidth / 2;
        for (let lineIndex = 0; lineIndex < totalLines; lineIndex += 1) {
            const mapItem = jsonFoldState.lineMap[lineIndex];
            const foldLine = mapItem?.foldLine;
            if (!Number.isInteger(foldLine)) {
                continue;
            }
            const isCollapsed = jsonFoldState.collapsedLines.has(foldLine);
            const y = paddingTop + lineIndex * lineHeight;
            const symbolY = y + (lineHeight - (gutterState.fontSizePx + 2)) / 2;
            cacheCtx.fillText(isCollapsed ? '+' : '−', symbolX, symbolY);
        }
    }

    gutterState.cacheDirty = false;
}

function renderGutter() {
    const canvas = gutterState.canvas;
    const ctx = gutterState.ctx;
    const textarea = document.getElementById('json-editor-textarea');
    if (!canvas || !ctx || !textarea) {
        return;
    }

    if (!gutterState.numberFont) {
        refreshGutterLayout();
    }

    const totalLines = jsonFoldState.formatted
        ? (jsonFoldState.visibleLines.length || 1)
        : (gutterState.totalLines || 1);
    ensureGutterCache(totalLines);

    const scrollTop = textarea.scrollTop;
    const lineHeight = gutterState.lineHeightPx;
    const paddingTop = gutterState.paddingTop;
    const viewHeight = gutterState.height - paddingTop * 2;
    const startLine = Math.max(0, Math.floor(scrollTop / lineHeight));
    const endLine = Math.min(totalLines, startLine + Math.ceil(viewHeight / lineHeight) + 1);

    ctx.clearRect(0, 0, gutterState.width, gutterState.height);

    if (gutterState.cacheEnabled && gutterState.cacheCanvas) {
        const srcYCss = Math.max(0, Math.min(scrollTop, Math.max(0, (gutterState.cacheCanvas.height / gutterState.dpr) - gutterState.height)));
        const srcYPx = Math.floor(srcYCss * gutterState.dpr);
        const srcWPx = gutterState.cacheCanvas.width;
        const srcHPx = Math.floor(gutterState.height * gutterState.dpr);
        ctx.drawImage(
            gutterState.cacheCanvas,
            0,
            srcYPx,
            srcWPx,
            srcHPx,
            0,
            0,
            gutterState.width,
            gutterState.height,
        );
        return;
    }

    ctx.font = gutterState.numberFont;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(74, 100, 136, 0.7)';

    const numberX = gutterState.width - gutterState.foldColWidth - gutterState.paddingRight;

    for (let lineIndex = startLine; lineIndex < endLine; lineIndex += 1) {
        const y = paddingTop + lineIndex * lineHeight - scrollTop;
        const textY = y + (lineHeight - gutterState.fontSizePx) / 2;
        const lineNumber = jsonFoldState.formatted && jsonFoldState.lineMap[lineIndex]
            ? jsonFoldState.lineMap[lineIndex].sourceLine + 1
            : lineIndex + 1;
        ctx.fillText(`${lineNumber}`, numberX, textY);
    }

    if (jsonFoldState.formatted) {
        ctx.font = gutterState.symbolFont;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4a6488';
        const symbolX = gutterState.width - gutterState.foldColWidth / 2;
        for (let lineIndex = startLine; lineIndex < endLine; lineIndex += 1) {
            const mapItem = jsonFoldState.lineMap[lineIndex];
            const foldLine = mapItem?.foldLine;
            if (!Number.isInteger(foldLine)) {
                continue;
            }
            const isCollapsed = jsonFoldState.collapsedLines.has(foldLine);
            const y = paddingTop + lineIndex * lineHeight - scrollTop;
            const symbolY = y + (lineHeight - (gutterState.fontSizePx + 2)) / 2;
            ctx.fillText(isCollapsed ? '+' : '−', symbolX, symbolY);
        }
    }
}

function scheduleGutterRenderDebounced() {
    if (gutterRenderTimer) {
        clearTimeout(gutterRenderTimer);
    }
    gutterRenderTimer = window.setTimeout(() => {
        gutterRenderTimer = 0;
        markGutterCacheDirty();
        renderGutter();
    }, 60);
}

function scheduleGutterRenderFrame() {
    if (gutterRenderRaf) {
        return;
    }
    gutterRenderRaf = window.requestAnimationFrame(() => {
        gutterRenderRaf = 0;
        renderGutter();
    });
}

function renderFormattedView() {
    const textarea = document.getElementById('json-editor-textarea');
    if (!textarea) {
        return;
    }

    const lines = jsonFoldState.sourceText.split(/\r?\n/);
    const visibleLines = [];
    const lineMap = [];

    for (let i = 0; i < lines.length; i += 1) {
        const range = jsonFoldState.foldRanges.get(i);
        if (jsonFoldState.collapsedLines.has(i) && range) {
            const trimmed = lines[i].trimEnd();
            const collapsedLine = trimmed.endsWith('{') || trimmed.endsWith('[')
                ? `${trimmed} ...`
                : `${trimmed} ...`;
            visibleLines.push(collapsedLine);
            lineMap.push({ sourceLine: i, foldLine: i });
            i = range.endLine;
            continue;
        }

        visibleLines.push(lines[i]);
        lineMap.push({ sourceLine: i, foldLine: range ? i : null });
    }

    jsonFoldState.lineMap = lineMap;
    jsonFoldState.visibleLines = visibleLines;
    textarea.value = visibleLines.join('\n');
    updateJsonEditorStats(textarea.value);
    markGutterCacheDirty();
    scheduleGutterRenderFrame();
}

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

function setJsonSearchQueryState(query) {
    const wrapper = document.querySelector('.json-search-input-wrap');
    if (!wrapper) {
        return;
    }
    if (query) {
        wrapper.classList.add('has-query');
    } else {
        wrapper.classList.remove('has-query');
    }
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

function showJsonSearch() {
    const editorContainer = document.getElementById('json-editor-container');
    const searchPanel = document.getElementById('json-search-panel');
    if (!editorContainer) {
        return;
    }
    editorContainer.classList.add('show-search');
    if (searchPanel) {
        searchPanel.setAttribute('aria-hidden', 'false');
    }
    focusJsonSearchInput();
}

function hideJsonSearch() {
    const editorContainer = document.getElementById('json-editor-container');
    const searchPanel = document.getElementById('json-search-panel');
    if (!editorContainer) {
        return;
    }
    editorContainer.classList.remove('show-search');
    if (searchPanel) {
        searchPanel.setAttribute('aria-hidden', 'true');
    }
}

function setupJsonSearchDrag() {
    const editorContainer = document.getElementById('json-editor-container');
    const searchPanel = document.getElementById('json-search-panel');
    const dragHandle = document.querySelector('.json-search-drag-handle');
    if (!editorContainer || !searchPanel || !dragHandle) {
        return;
    }

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseMove = (event) => {
        if (!isDragging) {
            return;
        }
        const containerRect = editorContainer.getBoundingClientRect();
        const panelRect = searchPanel.getBoundingClientRect();

        let nextLeft = event.clientX - containerRect.left - offsetX;
        let nextTop = event.clientY - containerRect.top - offsetY;

        const maxLeft = containerRect.width - panelRect.width - 8;
        const maxTop = containerRect.height - panelRect.height - 8;

        if (nextLeft < 8) nextLeft = 8;
        if (nextTop < 8) nextTop = 8;
        if (nextLeft > maxLeft) nextLeft = maxLeft;
        if (nextTop > maxTop) nextTop = maxTop;

        searchPanel.style.left = `${nextLeft}px`;
        searchPanel.style.top = `${nextTop}px`;
        searchPanel.style.right = 'auto';
    };

    const onMouseUp = () => {
        if (!isDragging) {
            return;
        }
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    dragHandle.addEventListener('mousedown', (event) => {
        if (event.button !== 0) {
            return;
        }
        const panelRect = searchPanel.getBoundingClientRect();
        offsetX = event.clientX - panelRect.left;
        offsetY = event.clientY - panelRect.top;
        isDragging = true;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
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
        setJsonSearchQueryState('');
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
    setJsonSearchQueryState(query);

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

async function setupJSONTools() {
    const editorContainer = document.getElementById('json-editor-container');
    const searchInput = document.getElementById('json-search-input');
    const searchPrevBtn = document.getElementById('json-search-prev-btn');
    const searchNextBtn = document.getElementById('json-search-next-btn');
    const textarea = document.getElementById('json-editor-textarea');
    if (!editorContainer) {
        console.error('找不到JSON编辑器容器');
        return;
    }

    if (jsonEditorReady) {
        return;
    }

    if (!textarea) {
        console.error('找不到JSON编辑器文本区域');
        return;
    }

    gutterState.canvas = document.getElementById('json-gutter-canvas');
    gutterState.ctx = gutterState.canvas ? gutterState.canvas.getContext('2d') : null;

    jsonEditor = {
        textarea,
        getMode: () => 'text',
        focus: () => textarea.focus(),
    };

    jsonEditorReady = true;
    updateJsonEditorStats(textarea.value);
    gutterState.totalLines = countLines(textarea.value);
    refreshGutterLayout();
    markGutterCacheDirty();
    scheduleGutterRenderFrame();

    if (searchPrevBtn) {
        searchPrevBtn.addEventListener('click', () => runJsonSearch('prev', true));
    }
    if (searchNextBtn) {
        searchNextBtn.addEventListener('click', () => runJsonSearch('next', true));
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            setJsonSearchQueryState(query);
            if (!query) {
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

    textarea.addEventListener('input', () => {
        if (jsonFoldState.formatted) {
            jsonFoldState.formatted = false;
            jsonFoldState.sourceText = '';
            jsonFoldState.foldRanges.clear();
            jsonFoldState.collapsedLines.clear();
            jsonFoldState.visibleLines = [];
        }

        updateJsonEditorStats(textarea.value);
        gutterState.totalLines = countLines(textarea.value);
        scheduleGutterRenderDebounced();
    });

    textarea.addEventListener('scroll', () => {
        scheduleGutterRenderFrame();
    }, { passive: true });


    textarea.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
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

    setupJsonSearchDrag();

    const formatButton = document.getElementById('json-view-toggle');
    if (formatButton) {
        formatButton.addEventListener('click', () => {
            const formatted = formatJsonText(textarea.value, true);
            if (!formatted) {
                return;
            }
            jsonFoldState.formatted = true;
            jsonFoldState.sourceText = formatted;
            jsonFoldState.foldRanges = buildFoldRanges(formatted);
            jsonFoldState.collapsedLines.clear();
            markGutterCacheDirty();
            renderFormattedView();
        });
    }

    if (gutterState.canvas) {
        gutterState.canvas.addEventListener('click', (event) => {
            if (!jsonFoldState.formatted) {
                return;
            }
            const rect = gutterState.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const paddingTop = gutterState.paddingTop;
            const lineHeight = gutterState.lineHeightPx;
            const scrollTop = textarea.scrollTop;
            const lineIndex = Math.floor((scrollTop + y - paddingTop) / lineHeight);
            if (lineIndex < 0 || lineIndex >= jsonFoldState.visibleLines.length) {
                return;
            }
            if (x < gutterState.width - gutterState.foldColWidth) {
                return;
            }
            const mapItem = jsonFoldState.lineMap[lineIndex];
            const foldLine = mapItem?.foldLine;
            if (!Number.isInteger(foldLine)) {
                return;
            }
            if (jsonFoldState.collapsedLines.has(foldLine)) {
                jsonFoldState.collapsedLines.delete(foldLine);
            } else {
                jsonFoldState.collapsedLines.add(foldLine);
            }
            markGutterCacheDirty();
            renderFormattedView();
        });
    }

    window.addEventListener('resize', () => {
        refreshGutterLayout();
        markGutterCacheDirty();
        scheduleGutterRenderFrame();
    });

    document.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') {
            return;
        }
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab || activeTab.dataset.tab !== 'json') {
            return;
        }
        event.preventDefault();
        const editorContainer = document.getElementById('json-editor-container');
        if (!editorContainer) {
            return;
        }
        if (editorContainer.classList.contains('show-search')) {
            hideJsonSearch();
        } else {
            showJsonSearch();
        }
    });
}

async function ensureJsonEditor() {
    if (jsonEditor) {
        refreshGutterLayout();
        markGutterCacheDirty();
        scheduleGutterRenderFrame();
        return;
    }

    const editorContainer = document.getElementById('json-editor-container');
    if (editorContainer) {
        editorContainer.classList.add('is-loading');
    }

    try {
        await setupJSONTools();
    } catch (error) {
        console.error('JSON 编辑器初始化失败:', error);
    } finally {
        if (editorContainer) {
            editorContainer.classList.remove('is-loading');
        }
    }
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
    setupTabSwitching();
    
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

    const activeTab = document.querySelector('.tab.active');
    const activeTabName = activeTab ? activeTab.dataset.tab : '';
    if (activeTabName === 'time') {
        startCurrentTimeTimer();
    }


    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            stopCurrentTimeTimer();
            return;
        }

        const currentActiveTab = document.querySelector('.tab.active');
        if (currentActiveTab && currentActiveTab.dataset.tab === 'time') {
            startCurrentTimeTimer();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
