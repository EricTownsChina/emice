import { JSONPath } from 'jsonpath-plus';

export const JSONPATH_PAGE_SIZE = 50;
export const JSONPATH_PREVIEW_LIMIT = 200000;
const CHILD_PAGE_SIZE = 100;

function describeNode(value, key, path) {
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const count = type === 'array' ? value.length : type === 'object' ? Object.keys(value).length : 0;
    const text = type === 'object' || type === 'array' ? '' : type === 'string' ? JSON.stringify(value.slice(0, 1000)) : String(value);
    return { key: String(key), path, type, count, text: type === 'object' || type === 'array' ? '' : text, shortened: type === 'string' && value.length > 1000 };
}

function validatePath(path) {
    if (!path || !/^\$(?:$|\.|\[)/u.test(path)) throw new Error('JSONPath 表达式应以 $ 开头');
    const brackets = [];
    let quote = '';
    let escaped = false;
    let regex = false;
    let regexClass = false;
    for (let index = 0; index < path.length; index++) {
        const char = path[index];
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (quote) { if (char === quote) quote = ''; continue; }
        if (regex) {
            if (char === '[') regexClass = true;
            if (char === ']') regexClass = false;
            if (char === '/' && !regexClass) regex = false;
            continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '/' && /[(:,=!?&|~]\s*$/u.test(path.slice(0, index))) { regex = true; continue; }
        if (char === '[' || char === '(') brackets.push(char);
        if ((char === ']' && brackets.pop() !== '[') || (char === ')' && brackets.pop() !== '(')) {
            throw new Error('JSONPath 中的括号不匹配');
        }
    }
    if (quote || regex || escaped || brackets.length) throw new Error('JSONPath 表达式尚未完成，请检查引号和括号');
}

// One document and one query per worker; pagination never parses or queries again.
export function createJsonPathEngine() {
    let source;
    let document;
    let expression;
    let matches;
    return ({ raw, path, mode = 'value', page = 0, copy = false, children }) => {
        if (raw !== undefined && raw !== source) {
            source = undefined;
            document = undefined;
            matches = undefined;
            expression = undefined;
            if (!raw.trim()) throw new Error('请先输入 JSON');
            try {
                document = JSON.parse(raw);
            } catch (error) {
                throw new Error(`JSON 格式有误：${error.message}`);
            }
            source = raw;
        }
        if (source === undefined) throw new Error('请先输入 JSON');
        validatePath(path);
        if (!matches || expression !== path) {
            matches = undefined;
            // Bound the library's expression cache during long editing sessions.
            JSONPath.cache = {};
            const result = path === '$' ? [{ path: '$', value: document }]
                : JSONPath({ json: document, path, resultType: 'all', wrap: true, eval: 'safe' }) || [];
            matches = result;
            expression = path;
        }
        const select = match => mode === 'path' ? match.path : match.value;
        if (children) {
            const [matchIndex, ...keys] = children.nodePath;
            if (!matches[matchIndex]) throw new Error('查询结果已更新，请重新展开节点');
            let value = select(matches[matchIndex]);
            for (const key of keys) {
                if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('节点不存在');
                value = value[key];
            }
            if (value === null || typeof value !== 'object') throw new Error('该节点不能展开');
            const isArray = Array.isArray(value);
            const childKeys = isArray ? null : Object.keys(value);
            const count = isArray ? value.length : childKeys.length;
            const offset = Math.max(0, Math.min(count, Math.trunc(children.offset) || 0));
            const end = Math.min(count, offset + CHILD_PAGE_SIZE);
            const nodes = [];
            for (let index = offset; index < end; index++) {
                const key = isArray ? index : childKeys[index];
                nodes.push(describeNode(value[key], key, [...children.nodePath, key]));
            }
            return { nodes, count, nextOffset: end };
        }
        if (copy) return { text: JSON.stringify(matches.map(select), null, 2), total: matches.length };
        const total = matches.length;
        const pages = Math.max(1, Math.ceil(total / JSONPATH_PAGE_SIZE));
        const currentPage = Math.max(0, Math.min(Math.trunc(page) || 0, pages - 1));
        const start = currentPage * JSONPATH_PAGE_SIZE;
        const pageMatches = matches.slice(start, start + JSONPATH_PAGE_SIZE);
        const nodes = pageMatches.map((match, index) => describeNode(select(match), start + index, [start + index]));
        // Serialize one match at a time so a page cannot accumulate a huge string.
        const parts = [];
        let length = 4;
        for (const match of pageMatches) {
            const text = JSON.stringify(select(match), null, 2);
            const indented = text.replace(/^/gmu, '  ');
            if (length + indented.length > JSONPATH_PREVIEW_LIMIT) {
                const preview = parts.length ? `[\n${parts.join(',\n')}\n]` : text.slice(0, JSONPATH_PREVIEW_LIMIT);
                return { text: preview, nodes, total, page: currentPage, pages, start, shown: parts.length, truncated: true };
            }
            parts.push(indented);
            length += indented.length + 2;
        }
        return { text: parts.length ? `[\n${parts.join(',\n')}\n]` : '[]', nodes, total, page: currentPage, pages, start, shown: parts.length, truncated: false };
    };
}
