const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function createApp(document = { addEventListener() {} }) {
    const context = vm.createContext({ document, localStorage: { getItem: () => null } });
    vm.runInContext(source, context);
    return context;
}

test('response JSON keeps long multiline and encrypted values folded on first view', () => {
    const app = createApp();
    const instructions = 'A long instruction line.\n'.repeat(900) + 'END_OF_INSTRUCTIONS';
    const encrypted = 'abcdef0123456789'.repeat(160);
    const response = { instructions, output: [{ encrypted_content: encrypted }, { text: '正常短文本' }] };
    const copies = [];
    const html = app.nodeLabel(response, null, 0, copies);
    const strings = [...html.matchAll(/<details class="tree-node tree-long-string"([^>]*)><summary>(.*?)<\/summary><div class="tree-string-content">([\s\S]*?)<\/div><\/details>/g)];
    assert.equal(strings.length, 2);
    for (const [, attributes, summary] of strings) {
        assert.doesNotMatch(attributes, /\bopen\b/);
        assert.ok(summary.length < 700, 'the initial visible row stays small');
        assert.doesNotMatch(summary, /\n/);
    }
    assert.ok(copies.includes(instructions));
    assert.ok(copies.includes(encrypted));
    assert.ok(html.includes('END_OF_INSTRUCTIONS'), 'search can still find the complete hidden value');
    assert.ok(html.includes(encrypted), 'expanding and copying retain the complete encrypted string');
    assert.equal(app.findJsonMatches(instructions, 'END_OF_INSTRUCTIONS').length, 1);
});

test('long root strings escape HTML and preserve exact values for copy', () => {
    const app = createApp();
    const value = '<img src=x onerror=alert(1)>\n"&'.repeat(100);
    const copies = [];
    const html = app.nodeLabel(value, null, 0, copies);
    assert.match(html, /class="tree-node tree-long-string"/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
    assert.equal(copies[0], value);
    assert.match(html, /tree-root-label/);
});

test('ordinary strings and scalar values retain their existing tree display', () => {
    const app = createApp();
    const copies = [];
    const html = app.nodeLabel({ text: 'hello\nworld', empty: '', count: 3, enabled: false, value: null }, null, 0, copies);
    assert.doesNotMatch(html, /tree-long-string/);
    assert.match(html, /type-string">"hello\nworld"/);
    assert.match(html, /type-number">3/);
    assert.match(html, /type-boolean">false/);
    assert.match(html, /type-null">null/);
});

test('finding text near the end of a folded string opens it and scrolls its own viewport', () => {
    const root = { id: 'json-tree', clientHeight: 600, clientWidth: 900, scrollTop: 100, scrollLeft: 0, getBoundingClientRect: () => ({ top: 70, left: 0 }) };
    const details = { tagName: 'DETAILS', open: false, parentElement: root };
    const stringViewport = { tagName: 'DIV', parentElement: details, clientHeight: 240, scrollTop: 0, getBoundingClientRect: () => ({ top: 200, height: 240, left: 20, right: 850 }) };
    const mark = { parentElement: stringViewport, closest: () => stringViewport, getClientRects: () => [{ top: 1000, height: 20 }] };
    const app = createApp({ addEventListener() {}, getElementById: () => root });
    vm.runInContext("jsonSearchState.panel = 'view'", app);
    app.revealJsonMatch(mark);
    assert.equal(details.open, true);
    assert.equal(stringViewport.scrollTop, 690);
    assert.equal(root.scrollTop, 50);
});
