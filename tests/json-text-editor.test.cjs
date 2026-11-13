const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createEditors() {
    const observers = [];
    const document = {
        createElement: () => element(),
        createDocumentFragment: () => ({ fragment: true, children: [], append(node) { this.children.push(node); } }),
    };
    function element() {
        return {
            ownerDocument: document, children: [], dataset: {}, attributes: {}, listeners: {},
            style: { setProperty(name, value) { this[name] = value; } },
            value: '', clientWidth: 400, offsetWidth: 400, clientHeight: 200, scrollTop: 0, scrollLeft: 0,
            getBoundingClientRect() { return { width: this.rectWidth ?? this.offsetWidth }; },
            append(...nodes) {
                for (const node of nodes) {
                    if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
                    this.children.push(node);
                    node.parentElement = this;
                }
            },
            before(node) {
                this.parentElement.children.splice(this.parentElement.children.indexOf(this), 0, node);
                node.parentElement = this.parentElement;
            },
            replaceChildren(fragment) { this.children = [...fragment.children]; },
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(name, listener) { this.listeners[name] = listener; },
        };
    }
    const context = vm.createContext({
        ResizeObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(input) { this.input = input; }
        },
    });
    const source = fs.readFileSync(path.join(__dirname, '..', 'json-text-editor.js'), 'utf8');
    vm.runInContext(source.replace('export function', 'function'), context);
    return {
        observers,
        make(id, value = '', readonly = false, highlights = null) {
            const host = element();
            const input = Object.assign(element(), { id, value, readOnly: readonly, selectionStart: 2, selectionEnd: 6 });
            host.append(input);
            const editor = context.setupJsonTextEditor(input, { highlights });
            return { editor, input, host, gutter: host.children[0].children[0] };
        },
        setup: context.setupJsonTextEditor,
    };
}

test('all JSON panes preserve native selection, readonly state and literal text while numbering logical lines', () => {
    const app = createEditors();
    const text = '<img src=x> & "示例" '.repeat(1000) + '\n\tsecond\n\n';
    for (const id of ['json-input', 'jsonpath-output', 'diff-left', 'diff-right']) {
        const { input, editor, gutter, host } = app.make(id, text, id === 'jsonpath-output');
        assert.equal(input.value, text);
        assert.equal(input.readOnly, id === 'jsonpath-output');
        assert.equal(input.selectionStart, 2);
        assert.equal(input.selectionEnd, 6);
        assert.equal(input.wrap, 'soft');
        assert.equal(gutter.children.length, 4);
        assert.equal(gutter.children[0].textContent, text.split('\n')[0]);
        assert.equal(gutter.children[2].dataset.line, '3');
        assert.equal(gutter.children[3].dataset.line, '4');
        assert.equal(gutter.attributes['aria-hidden'], 'true');
        assert.equal(app.setup(input), editor);
        assert.equal(host.children.length, 1, 'initializing twice must not duplicate the editor');
    }
});

test('query results, draft restores, swapping and clearing refresh numbers independently without user input events', () => {
    const app = createEditors();
    const left = app.make('diff-left');
    const right = app.make('jsonpath-output', '', true);
    const result = Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join('\n');
    left.editor.setValue(result);
    right.editor.setValue('first\nlast');
    assert.equal(left.gutter.children.length, 120);
    assert.match(left.gutter.style['--json-gutter-width'], /3ch/);
    assert.equal(right.gutter.children.length, 2);
    right.input.scrollTop = 80;
    right.editor.setValue('');
    assert.equal(right.gutter.children.length, 1);
    assert.equal(right.input.scrollTop, 0);
    assert.equal(right.gutter.scrollTop, 0);
    assert.equal(left.input.value, result);
});

test('scrolling and hidden-pane resizing synchronize gutters and highlights without rebuilding document rows', () => {
    const app = createEditors();
    const highlights = { hidden: false, style: {} };
    const { input, gutter } = app.make('json-input', 'one\ntwo', false, highlights);
    const first = gutter.children[0];
    input.scrollTop = 90;
    input.listeners.scroll();
    assert.equal(gutter.scrollTop, 90);
    assert.equal(highlights.scrollTop, 90);
    input.clientWidth = 0;
    input.offsetWidth = 0;
    app.observers[0].callback();
    input.clientWidth = 260;
    input.offsetWidth = 260;
    app.observers[0].callback();
    assert.equal(gutter.style['--json-line-width'], '240px');
    assert.equal(highlights.style.width, '260px');
    assert.equal(gutter.children[0], first);
    input.value += '\nthree';
    input.listeners.input();
    assert.equal(gutter.children.length, 3);
});

test('split-pane fractional widths exclude the native scrollbar without rounding text wrapping', () => {
    const app = createEditors();
    const highlights = { hidden: false, style: {} };
    const { input, gutter, editor } = app.make('json-input', 'long content', false, highlights);
    input.clientWidth = 604;
    input.offsetWidth = 621;
    input.rectWidth = 620.5625;
    editor.sync();
    assert.equal(gutter.style['--json-line-width'], '583.5625px');
    assert.equal(highlights.style.width, '603.5625px');
});
