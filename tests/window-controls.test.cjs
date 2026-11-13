const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function createWindow(userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)') {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            hidden: true, classes: new Set(), handlers: {}, attributes: {},
            classList: { toggle(name, enabled) { enabled ? element(id).classes.add(name) : element(id).classes.delete(name); } },
            addEventListener(name, callback) { this.handlers[name] = callback; },
            setAttribute(name, value) { this.attributes[name] = value; },
        });
        return elements.get(id);
    }
    let size = { width: 1800, height: 1400 };
    const workArea = { width: 3024, height: 1800 };
    let resized;
    let nativeQueries = 0;
    let toggleCalls = 0;
    let windowAccesses = 0;
    let resizeSubscriptions = 0;
    const appWindow = {
        async isMaximized() {
            nativeQueries++;
            // The problematic macOS call emits another resize while checking its state.
            if (userAgent.includes('Mac')) throw new Error('Unsafe native isMaximized query');
            return size.width === workArea.width && size.height === workArea.height;
        },
        async onResized(callback) { resizeSubscriptions++; resized = callback; },
        async toggleMaximize() {
            toggleCalls++;
            size = size.width === workArea.width ? { width: 1800, height: 1400 } : workArea;
            await resized?.();
        },
    };
    const context = vm.createContext({
        document: { addEventListener() {}, getElementById: element, documentElement: element('html') },
        localStorage: { getItem: () => null }, navigator: { userAgent }, console,
        window: { __TAURI__: { window: { getCurrentWindow: () => { windowAccesses++; return appWindow; } } } },
    });
    vm.runInContext(source, context);
    return {
        context, appWindow, element,
        resize: () => resized(),
        setSize: value => { size = value; },
        get nativeQueries() { return nativeQueries; },
        get toggleCalls() { return toggleCalls; },
        get windowAccesses() { return windowAccesses; },
        get resizeSubscriptions() { return resizeSubscriptions; },
    };
}

test('macOS reserves native traffic lights and never installs custom controls or resize queries', async () => {
    const app = createWindow('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    await app.context.setupWindowControls();
    assert.equal(app.element('html').classes.has('platform-macos'), true);
    assert.equal(app.element('window-controls').hidden, true);
    assert.equal(app.element('window-maximize').handlers.click, undefined);
    assert.equal(app.nativeQueries, 0);
    assert.equal(app.windowAccesses, 0);
    assert.equal(app.resizeSubscriptions, 0);
});

test('Windows resize bursts coalesce and manual resizing updates custom controls', async () => {
    const app = createWindow();
    await app.context.setupWindowControls();
    await Promise.all(Array.from({ length: 50 }, () => app.resize()));
    assert.equal(app.nativeQueries, 2, 'one initial read and one read for the resize burst');
    assert.equal(app.resizeSubscriptions, 1);
    assert.equal(app.element('window-controls').hidden, false);
    assert.equal(app.element('html').classes.has('platform-macos'), false);
    app.setSize({ width: 3024, height: 1800 });
    await app.resize();
    assert.equal(app.element('window-maximize').attributes['aria-label'], '还原');
    app.setSize({ width: 2200, height: 1500 });
    await app.resize();
    assert.equal(app.element('window-maximize').attributes['aria-label'], '最大化');
    assert.equal(app.element('html').classes.has('is-maximized'), false);
});

test('Windows maximize and restore buttons remain synchronized after native resize notifications', async () => {
    const app = createWindow();
    await app.context.setupWindowControls();
    const button = app.element('window-maximize');
    await button.handlers.click();
    assert.equal(button.title, '还原');
    assert.equal(button.classes.has('is-maximized'), true);
    await button.handlers.click();
    assert.equal(button.title, '最大化');
    assert.equal(button.classes.has('is-maximized'), false);
    assert.equal(app.toggleCalls, 2);
});

test('other desktop platforms keep their native maximized-state query', async () => {
    const app = createWindow('Mozilla/5.0 (X11; Linux x86_64)');
    app.setSize({ width: 3024, height: 1800 });
    await app.context.setupWindowControls();
    assert.equal(app.nativeQueries, 1);
    assert.equal(app.element('window-maximize').title, '还原');
});
