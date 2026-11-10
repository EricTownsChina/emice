const assert = require('node:assert/strict');
const test = require('node:test');

const engineModule = import('../json-diff-engine.mjs');
async function setup(left, right) {
    const { createJsonDiffEngine } = await engineModule;
    const engine = createJsonDiffEngine();
    const result = engine({ left: JSON.stringify(left), right: JSON.stringify(right) });
    const children = (id = result.root.id, onlyChanges = false, offset = 0) => engine({ children: { id, onlyChanges, offset } });
    return { engine, result, children };
}

test('structural comparison ignores whitespace and object key order at every depth', async () => {
    const { engine, result, children } = await setup({ a: [1, { c: 3, b: 2 }] }, { a: [1, { b: 2, c: 3 }] });
    assert.equal(result.root.status, 'same');
    assert.deepEqual(result.counts, { added: 0, removed: 0, changed: 0 });
    assert.equal(children(undefined, true).total, 0);
    assert.equal(children().nodes[0].status, 'same');
    assert.equal(engine({ left: '{"x": 1}', right: '{\n  "x": 1\n}' }).root.status, 'same');
});

test('nested fields report additions, deletions, values and type changes', async () => {
    const { result, children } = await setup(
        { person: { age: 20, gone: false }, nil: null, flag: false, same: '' },
        { person: { age: 21, added: { deep: [1, 2] } }, nil: {}, flag: 0, same: '' },
    );
    assert.deepEqual(result.counts, { added: 1, removed: 1, changed: 3 });
    const fields = children(undefined, true).nodes;
    assert.deepEqual(fields.map(node => node.left.key), ['person', 'nil', 'flag']);
    const person = children(fields[0].id).nodes;
    assert.deepEqual(person.map(node => node.status), ['changed', 'removed', 'added']);
    assert.equal(person[1].right, null);
    assert.equal(person[2].left, null);
    const addedChild = children(person[2].id).nodes[0];
    assert.equal(addedChild.status, 'added');
    assert.equal(addedChild.right.key, 'deep');
    assert.equal(children(addedChild.id).nodes[1].right.text, '2');
});

test('array insertions align unchanged elements without a cascade of modifications', async () => {
    const { result, children } = await setup(
        [{ id: 1, name: 'first' }, { id: 2, name: 'second' }, { id: 3, name: 'third' }],
        [{ id: 1, name: 'edited' }, { id: 9 }, { name: 'second', id: 2 }, { id: 3, name: 'third' }],
    );
    assert.deepEqual(result.counts, { added: 1, removed: 0, changed: 1 });
    assert.deepEqual(children().nodes.map(node => [node.left?.key, node.right?.key, node.status]), [
        ['0', '0', 'changed'], [undefined, '1', 'added'], ['1', '2', 'same'], ['2', '3', 'same'],
    ]);
    assert.equal(children(undefined, true).total, 2);
    const removed = await setup([1, 2, 2, 3], [1, 2, 3]);
    assert.deepEqual(removed.result.counts, { added: 0, removed: 1, changed: 0 });
});

test('large array alignment uses bounded memory and child results are paged', async () => {
    const left = Array.from({ length: 4000 }, (_, id) => ({ id, unchanged: true }));
    const right = [{ new: true }, ...left.map(item => ({ ...item })), 'last'];
    right[2001] = { id: 2000, unchanged: false };
    const { result, children } = await setup(left, right);
    assert.deepEqual(result.counts, { added: 2, removed: 0, changed: 1 });
    const first = children();
    assert.equal(first.nodes.length, 100);
    assert.equal(first.total, 4002);
    assert.equal(first.nextOffset, 100);
    const last = children(undefined, false, 4000);
    assert.equal(last.nodes.length, 2);
    assert.equal(last.nodes[1].right.text, '"last"');
    assert.equal(children(undefined, true).total, 3);
});

test('scalars, empty containers and container type replacements remain distinct', async () => {
    for (const value of [null, false, 0, '', [], {}]) {
        const { result } = await setup(value, value);
        assert.equal(result.root.status, 'same');
    }
    const { result, children } = await setup({ x: 1 }, [1]);
    assert.deepEqual(result.counts, { added: 0, removed: 0, changed: 1 });
    assert.deepEqual(children().nodes.map(node => node.status), ['removed', 'added']);
    const primitive = await setup(false, 'false');
    assert.equal(primitive.result.root.expandable, false);
    assert.equal(primitive.result.root.status, 'changed');
    assert.equal((await setup({}, { missing: null })).result.counts.added, 1);
});

test('special keys and long strings retain accurate paths and bounded previews', async () => {
    const { createJsonDiffEngine } = await engineModule;
    const engine = createJsonDiffEngine();
    const result = engine({ left: '{"__proto__":{"x":1},"constructor":null,"a.b/<&":"old"}', right: JSON.stringify({ constructor: null, 'a.b/<&': 'x'.repeat(250000) }) });
    assert.deepEqual(result.counts, { added: 0, removed: 1, changed: 1 });
    const fields = engine({ children: { id: result.root.id, onlyChanges: true } }).nodes;
    assert.equal(fields[0].left.key, '__proto__');
    assert.equal(fields[0].right, null);
    assert.equal(fields[1].right.path, '$["a.b/<&"]');
    assert.equal(fields[1].right.shortened, true);
    assert.ok(fields[1].right.text.length < 1100);
    assert.equal({}.x, undefined);
});

test('invalid input identifies its side and subsequent comparisons recover', async () => {
    const { createJsonDiffEngine } = await engineModule;
    const engine = createJsonDiffEngine();
    assert.throws(() => engine({ left: '', right: '{}' }), /左侧输入/);
    assert.throws(() => engine({ left: '{', right: '{}' }), /左侧 JSON 格式有误/);
    assert.throws(() => engine({ left: '{}', right: '[' }), /右侧 JSON 格式有误/);
    assert.throws(() => engine({ children: { id: 999 } }), /已更新/);
    assert.equal(engine({ left: '{}', right: '{}' }).root.status, 'same');
});
