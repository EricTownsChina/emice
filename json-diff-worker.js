import { createJsonDiffEngine } from './json-diff-engine.mjs';

const compare = createJsonDiffEngine();
self.onmessage = ({ data }) => {
    const started = performance.now();
    try {
        self.postMessage({ id: data.id, ...compare(data), elapsed: performance.now() - started });
    } catch (error) {
        self.postMessage({ id: data.id, error: error instanceof RangeError ? 'JSON 嵌套过深，请减少层级后重试' : String(error.message || error) });
    }
};
