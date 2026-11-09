const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function createApp() {
    let now = 1700000000000;
    let nextTimer = 0;
    let writes = 0;
    let backendCalls = 0;
    const timers = new Map();
    const timestamp = {
        value: null,
        set textContent(value) { this.value = String(value); writes++; },
    };
    const state = { timeActive: true, hidden: false };
    const document = {
        get hidden() { return state.hidden; },
        getElementById(id) {
            if (id === 'current-timestamp') return timestamp;
            if (id === 'time-tab') return { classList: { contains: () => state.timeActive } };
            throw new Error(`Unexpected element: ${id}`);
        },
        addEventListener() {},
    };
    const context = vm.createContext({
        document,
        // A slow or unavailable backend must not accumulate clock requests.
        window: { __TAURI__: { core: { invoke() { backendCalls++; return new Promise(() => {}); } } } },
        localStorage: { getItem: () => null },
        Date: class extends Date { static now() { return now; } },
        setInterval(callback, delay) {
            const id = ++nextTimer;
            timers.set(id, { callback, delay, next: now + delay });
            return id;
        },
        clearInterval(id) { timers.delete(id); },
    });
    vm.runInContext(source, context);
    return {
        state, timestamp,
        sync: () => context.syncCurrentTimeTimer(),
        get writes() { return writes; },
        get backendCalls() { return backendCalls; },
        get timerCount() { return timers.size; },
        advance(milliseconds) {
            const end = now + milliseconds;
            while (timers.size) {
                const timer = [...timers.values()].sort((a, b) => a.next - b.next)[0];
                if (timer.next > end) break;
                now = timer.next;
                timer.next += timer.delay;
                timer.callback();
            }
            now = end;
        },
    };
}

test('visible timestamp remains current without backend requests or duplicate timers', () => {
    const app = createApp();
    app.sync();
    app.sync();
    assert.equal(app.timerCount, 1);
    app.advance(5000);
    assert.equal(app.timestamp.value, '1700000005000');
    assert.equal(app.backendCalls, 0);
});

test('leaving the time tool stops all clock work during an hour of JSON use', () => {
    const app = createApp();
    app.sync();
    app.state.timeActive = false;
    app.sync();
    const writes = app.writes;
    app.advance(3600000);
    assert.equal(app.timerCount, 0);
    assert.equal(app.writes, writes);
    assert.equal(app.backendCalls, 0);
    app.state.timeActive = true;
    app.sync();
    assert.equal(app.timestamp.value, '1700003600000');
    assert.equal(app.timerCount, 1);
});

test('hiding the document suspends the clock and returning refreshes immediately', () => {
    const app = createApp();
    app.sync();
    app.state.hidden = true;
    app.sync();
    const writes = app.writes;
    app.advance(60000);
    assert.equal(app.timerCount, 0);
    assert.equal(app.writes, writes);
    app.state.hidden = false;
    app.sync();
    assert.equal(app.timestamp.value, '1700000060000');
    assert.equal(app.timerCount, 1);
});
