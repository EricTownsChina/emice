const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function createApp() {
    const state = { active: true, selection: null, searches: [] };
    const input = { value: '{"name":"测试 [a.*]", "other":"测试 [a.*]"}', selectionStart: 9, selectionEnd: 17 };
    const search = {
        value: 'existing query',
        focus() { document.activeElement = this; },
        select() { this.selected = true; },
    };
    const elements = {
        'json-tab': { classList: { contains: () => state.active } },
        'json-source-tools': { hidden: false },
        'json-preview': { hidden: true },
        'json-input': input,
        'json-search-input': search,
        'json-tree': { contains: node => node?.inTree === true },
    };
    const document = { activeElement: input, addEventListener() {}, getElementById: id => elements[id] };
    const context = vm.createContext({
        document, window: { getSelection: () => state.selection },
        localStorage: { getItem: () => null },
    });
    vm.runInContext(source, context);
    context.applyJsonSearch = () => state.searches.push(search.value);
    return {
        state, input, search, document, elements, context,
        press(overrides = {}) {
            const event = { key: 'f', ctrlKey: true, preventDefault() { this.defaultPrevented = true; }, ...overrides };
            context.handleJsonSearchShortcut(event);
            return event;
        },
    };
}

for (const modifier of ['ctrlKey', 'metaKey']) {
    test(`${modifier}+F searches the exact textarea selection and focuses the search field`, () => {
        const app = createApp();
        const selected = app.input.value.slice(app.input.selectionStart, app.input.selectionEnd);
        const event = app.press({ ctrlKey: false, [modifier]: true, key: 'F' });
        assert.equal(event.defaultPrevented, true);
        assert.equal(app.search.value, selected);
        assert.equal(app.document.activeElement, app.search);
        assert.equal(app.search.selected, true);
        assert.deepEqual(app.state.searches, [selected]);
        assert.equal(app.context.findJsonMatches(app.input.value, selected).length, 2);
    });
}

test('view selections are read before focusing search and highlighting changes the tree', () => {
    const app = createApp();
    app.elements['json-preview'].hidden = false;
    app.state.selection = {
        rangeCount: 1, isCollapsed: false, toString: () => '测试 [a.*]',
        getRangeAt: () => ({ startContainer: { inTree: true }, endContainer: { inTree: true } }),
    };
    app.press();
    assert.deepEqual(app.state.searches, ['测试 [a.*]']);
    assert.equal(app.document.activeElement, app.search);
});

test('no selection retains the current query and stale textarea selections are ignored after blur', () => {
    const app = createApp();
    app.document.activeElement = app.search;
    app.press();
    assert.deepEqual(app.state.searches, ['existing query']);
    app.document.activeElement = app.input;
    app.input.selectionEnd = app.input.selectionStart;
    app.press();
    assert.equal(app.search.value, 'existing query');
    assert.equal(app.search.selected, true);
});

test('a selection that crosses outside the JSON tree does not replace the query', () => {
    const app = createApp();
    app.elements['json-preview'].hidden = false;
    app.state.selection = {
        rangeCount: 1, isCollapsed: false, toString: () => 'unrelated text',
        getRangeAt: () => ({ startContainer: { inTree: true }, endContainer: {} }),
    };
    app.press();
    assert.deepEqual(app.state.searches, ['existing query']);
});

test('inactive tools, hidden search, IME and other shortcuts are left alone', () => {
    for (const configure of [
        app => { app.state.active = false; },
        app => { app.elements['json-source-tools'].hidden = true; },
        () => ({ ctrlKey: false, metaKey: false }),
        () => ({ altKey: true }),
        () => ({ isComposing: true }),
        () => ({ defaultPrevented: true }),
        () => ({ key: 'g' }),
    ]) {
        const app = createApp();
        app.press(configure(app));
        assert.deepEqual(app.state.searches, []);
        assert.equal(app.document.activeElement, app.input);
    }
});
