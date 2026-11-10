const assert = require('node:assert/strict');
const test = require('node:test');

const engineModule = import('../jsonpath-engine.mjs');
const sample = {
    store: { book: [
        { title: '中文 <title>', price: 8, available: false },
        { title: 'Second', price: 12, available: true },
        { title: 'Third', price: 5, available: true },
    ] },
    'a.b': { value: null },
};

test('JSONPath supports fields, wildcards, recursive lookup, filters, unions and slices', async () => {
    const { createJsonPathEngine } = await engineModule;
    const query = createJsonPathEngine();
    const run = path => JSON.parse(query({ raw: JSON.stringify(sample), path }).text);
    assert.deepEqual(run('$.store.book[*].title'), ['中文 <title>', 'Second', 'Third']);
    assert.deepEqual(run('$..price'), [8, 12, 5]);
    assert.deepEqual(run('$.store.book[?(@.price < 10)].title'), ['中文 <title>', 'Third']);
    assert.deepEqual(run('$.store.book[0,2].price'), [8, 5]);
    assert.deepEqual(run('$.store.book[0:3:2].price'), [8, 5]);
    assert.deepEqual(run("$['a.b'].value"), [null]);
    assert.deepEqual(run('$.store.book[0].available'), [false]);
    assert.deepEqual(run('$.missing'), []);
    assert.deepEqual(run('$'), [sample]);
});

test('JSONPath pages and copies all results without resending the source', async () => {
    const { createJsonPathEngine } = await engineModule;
    const query = createJsonPathEngine();
    const values = Array.from({ length: 123 }, (_, i) => i);
    const first = query({ raw: JSON.stringify(values), path: '$[*]' });
    assert.equal(first.total, 123);
    assert.equal(first.pages, 3);
    assert.deepEqual(JSON.parse(first.text), values.slice(0, 50));
    const last = query({ path: '$[*]', page: 2 });
    assert.deepEqual(JSON.parse(last.text), values.slice(100));
    assert.deepEqual(JSON.parse(query({ path: '$[*]', copy: true }).text), values);
    assert.deepEqual(JSON.parse(query({ path: '$[*]', mode: 'path', page: 2 }).text), values.slice(100).map(i => `$[${i}]`));
    assert.equal(JSON.parse(query({ raw: '[999]', path: '$[*]' }).text)[0], 999);
});

test('JSONPath preserves root scalars, reports errors, and recovers after invalid input', async () => {
    const { createJsonPathEngine } = await engineModule;
    const query = createJsonPathEngine();
    for (const value of [null, false, 0, '', 'text']) {
        assert.deepEqual(JSON.parse(query({ raw: JSON.stringify(value), path: '$' }).text), [value]);
    }
    assert.throws(() => query({ raw: '{', path: '$' }), /JSON 格式有误/);
    assert.throws(() => query({ path: '$' }), /请先输入/);
    assert.throws(() => query({ raw: '{}', path: 'invalid' }), /以 \$ 开头/);
    assert.throws(() => query({ path: '$.store[' }), /尚未完成/);
    assert.throws(() => query({ raw: JSON.stringify(sample), path: '$.store.book[?(@.price <)]' }));
    assert.equal(query({ path: '$.store.book' }).total, 1);
});

test('large previews are bounded while full copy retains original data', async () => {
    const { createJsonPathEngine, JSONPATH_PREVIEW_LIMIT } = await engineModule;
    const query = createJsonPathEngine();
    const value = 'x'.repeat(JSONPATH_PREVIEW_LIMIT + 100);
    const preview = query({ raw: JSON.stringify({ value }), path: '$' });
    assert.equal(preview.truncated, true);
    assert.ok(preview.text.length <= JSONPATH_PREVIEW_LIMIT);
    assert.deepEqual(JSON.parse(query({ path: '$', copy: true }).text), [{ value }]);
});

test('result trees load nested children in bounded pages, including oversized results', async () => {
    const { createJsonPathEngine, JSONPATH_PREVIEW_LIMIT } = await engineModule;
    const query = createJsonPathEngine();
    const value = { 'a.b/<&': Array.from({ length: 250 }, (_, i) => ({ index: i })), long: 'x'.repeat(JSONPATH_PREVIEW_LIMIT + 10), nil: null, empty: [] };
    const result = query({ raw: JSON.stringify(value), path: '$' });
    assert.equal(result.truncated, true);
    assert.equal(result.nodes[0].type, 'object');
    assert.equal(result.nodes[0].count, 4);
    const children = query({ path: '$', children: { nodePath: [0], offset: 0 } });
    assert.deepEqual(children.nodes.map(node => node.key), ['a.b/<&', 'long', 'nil', 'empty']);
    assert.equal(children.nodes[1].shortened, true);
    assert.ok(children.nodes[1].text.length < 1100);
    assert.equal(children.nodes[2].text, 'null');
    const list = query({ path: '$', children: { nodePath: [0, 'a.b/<&'], offset: 0 } });
    assert.equal(list.nodes.length, 100);
    assert.equal(list.nextOffset, 100);
    assert.equal(list.count, 250);
    const last = query({ path: '$', children: { nodePath: [0, 'a.b/<&'], offset: 200 } });
    assert.equal(last.nodes.length, 50);
    assert.equal(last.nodes[0].key, '200');
    const leaf = query({ path: '$', children: { nodePath: [0, 'a.b/<&', 200], offset: 0 } });
    assert.equal(leaf.nodes[0].text, '200');
    assert.throws(() => query({ path: '$', children: { nodePath: [0, 'missing'], offset: 0 } }), /节点不存在/);
});
