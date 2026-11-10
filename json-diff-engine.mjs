const CHILD_PAGE_SIZE = 100;
const LCS_CELL_LIMIT = 250000;

const typeOf = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
const isContainer = value => value !== null && typeof value === 'object';

// Exact matches anchor arrays; unmatched spans are compared by position. Large
// spans use unique anchors instead of allocating a quadratic LCS matrix.
function alignArrays(left, right, fingerprint) {
    const a = left.map(fingerprint);
    const b = right.map(fingerprint);
    const anchors = [];
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
        anchors.push([start, start]);
        start++;
    }
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const sizeA = endA - start;
    const sizeB = endB - start;
    if (sizeA && sizeB && (sizeA + 1) * (sizeB + 1) <= LCS_CELL_LIMIT) {
        const width = sizeB + 1;
        const scores = new Uint32Array((sizeA + 1) * width);
        for (let i = sizeA - 1; i >= 0; i--) {
            for (let j = sizeB - 1; j >= 0; j--) {
                scores[i * width + j] = a[start + i] === b[start + j]
                    ? scores[(i + 1) * width + j + 1] + 1
                    : Math.max(scores[(i + 1) * width + j], scores[i * width + j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < sizeA && j < sizeB) {
            if (a[start + i] === b[start + j]) { anchors.push([start + i++, start + j++]); }
            else if (scores[(i + 1) * width + j] >= scores[i * width + j + 1]) i++;
            else j++;
        }
    } else if (sizeA && sizeB) {
        const uniquePositions = (values, end) => {
            const positions = new Map();
            for (let i = start; i < end; i++) positions.set(values[i], positions.has(values[i]) ? -1 : i);
            return positions;
        };
        const positionsA = uniquePositions(a, endA);
        const positionsB = uniquePositions(b, endB);
        const candidates = [];
        for (let i = start; i < endA; i++) {
            const j = positionsB.get(a[i]);
            if (positionsA.get(a[i]) === i && j !== undefined && j >= 0) candidates.push([i, j]);
        }
        const tails = [];
        const previous = new Int32Array(candidates.length).fill(-1);
        candidates.forEach((pair, index) => {
            let low = 0;
            let high = tails.length;
            while (low < high) {
                const middle = (low + high) >>> 1;
                if (candidates[tails[middle]][1] < pair[1]) low = middle + 1;
                else high = middle;
            }
            if (low) previous[index] = tails[low - 1];
            tails[low] = index;
        });
        const sequence = [];
        for (let i = tails.at(-1); i !== undefined && i >= 0; i = previous[i]) sequence.push(candidates[i]);
        for (const pair of sequence.reverse()) anchors.push(pair);
    }
    for (let i = endA, j = endB; i < a.length; i++, j++) anchors.push([i, j]);
    anchors.push([a.length, b.length]);
    const pairs = [];
    let i = 0;
    let j = 0;
    for (const [nextA, nextB] of anchors) {
        while (i < nextA && j < nextB) pairs.push([i++, j++]);
        while (i < nextA) pairs.push([i++, null]);
        while (j < nextB) pairs.push([null, j++]);
        if (nextA < a.length) { pairs.push([nextA, nextB]); i++; j++; }
    }
    return pairs;
}

export function createJsonDiffEngine() {
    let nodes = new Map();
    let nextId = 0;
    let hashes = new WeakMap();

    function fingerprint(value) {
        if (isContainer(value) && hashes.has(value)) return hashes.get(value);
        let first = 2166136261;
        let second = 5381;
        const feed = text => {
            for (let i = 0; i < text.length; i++) {
                first = Math.imul(first ^ text.charCodeAt(i), 16777619);
                second = Math.imul(second, 33) ^ text.charCodeAt(i);
            }
        };
        feed(typeOf(value));
        if (isContainer(value)) {
            const keys = Object.keys(value);
            if (!Array.isArray(value)) keys.sort();
            keys.forEach(key => { feed(JSON.stringify(key)); feed(fingerprint(value[key])); });
        } else feed(JSON.stringify(value));
        const result = `${first >>> 0}:${second >>> 0}`;
        if (isContainer(value)) hashes.set(value, result);
        return result;
    }

    function equal(left, right) {
        if (left === right) return true;
        if (typeOf(left) !== typeOf(right) || !isContainer(left)) return false;
        if (fingerprint(left) !== fingerprint(right)) return false;
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
    }

    function makeNode(left, right, leftPath, rightPath, forcedStatus) {
        const status = forcedStatus || (leftPath === null ? 'added' : rightPath === null ? 'removed' : equal(left, right) ? 'same' : 'changed');
        const node = { id: ++nextId, left, right, leftPath, rightPath, status, children: null, filtered: null, counts: { added: 0, removed: 0, changed: 0 } };
        nodes.set(node.id, node);
        if (status === 'changed' && typeOf(left) === typeOf(right) && isContainer(left)) {
            node.children = pairedChildren(node);
            node.children.forEach(child => {
                for (const key of Object.keys(node.counts)) node.counts[key] += child.counts[key];
            });
        } else if (status !== 'same') node.counts[status] = 1;
        return node;
    }

    function pairedChildren(node) {
        const { left, right, leftPath, rightPath } = node;
        if (Array.isArray(left)) {
            return alignArrays(left, right, fingerprint).map(([a, b]) => makeNode(
                a === null ? undefined : left[a], b === null ? undefined : right[b],
                a === null ? null : [...leftPath, a], b === null ? null : [...rightPath, b],
            ));
        }
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        return [...keys].map(key => makeNode(left[key], right[key],
            Object.hasOwn(left, key) ? [...leftPath, key] : null,
            Object.hasOwn(right, key) ? [...rightPath, key] : null));
    }

    function childrenOf(node) {
        if (node.children) return node.children;
        if (node.status === 'same') node.children = pairedChildren(node);
        else {
            const leftKeys = node.leftPath !== null && isContainer(node.left) ? Object.keys(node.left) : [];
            const rightKeys = node.rightPath !== null && isContainer(node.right) ? Object.keys(node.right) : [];
            node.children = [
                ...leftKeys.map(key => makeNode(node.left[key], undefined, [...node.leftPath, key], null, 'removed')),
                ...rightKeys.map(key => makeNode(undefined, node.right[key], null, [...node.rightPath, key], 'added')),
            ];
        }
        return node.children;
    }

    function side(value, path) {
        if (path === null) return null;
        const type = typeOf(value);
        const count = type === 'array' ? value.length : type === 'object' ? Object.keys(value).length : 0;
        const text = isContainer(value) ? type === 'array' ? `Array(${count})` : `object {${count}}`
            : type === 'string' ? JSON.stringify(value.slice(0, 1000)) : String(value);
        const location = '$' + path.map(key => typeof key === 'number' ? `[${key}]` : `[${JSON.stringify(key)}]`).join('');
        return { key: path.length ? String(path.at(-1)) : 'root', path: location, type, text, shortened: type === 'string' && value.length > 1000 };
    }

    function describe(node) {
        return {
            id: node.id, status: node.status, left: side(node.left, node.leftPath), right: side(node.right, node.rightPath),
            expandable: (node.leftPath !== null && isContainer(node.left)) || (node.rightPath !== null && isContainer(node.right)),
        };
    }

    return data => {
        if (data.children) {
            const node = nodes.get(data.children.id);
            if (!node) throw new Error('对比内容已更新，请重新展开');
            if (data.children.onlyChanges && node.status === 'same') return { nodes: [], total: 0, nextOffset: 0 };
            let children = childrenOf(node);
            if (data.children.onlyChanges) children = node.filtered ||= children.filter(child => child.status !== 'same');
            const offset = Math.max(0, Math.min(children.length, Math.trunc(data.children.offset) || 0));
            return { nodes: children.slice(offset, offset + CHILD_PAGE_SIZE).map(describe), total: children.length, nextOffset: Math.min(children.length, offset + CHILD_PAGE_SIZE) };
        }
        const parse = (raw, label) => {
            if (!raw.trim()) throw new Error(`请在${label}输入 JSON`);
            try { return JSON.parse(raw); }
            catch (error) { throw new Error(`${label} JSON 格式有误：${error.message}`); }
        };
        const left = parse(data.left, '左侧');
        const right = parse(data.right, '右侧');
        nodes = new Map();
        hashes = new WeakMap();
        nextId = 0;
        const root = makeNode(left, right, [], []);
        return { root: describe(root), counts: root.counts };
    };
}
