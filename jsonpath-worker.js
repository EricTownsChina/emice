import { createJsonPathEngine } from './jsonpath-engine.mjs';

const evaluate = createJsonPathEngine();
self.onmessage = ({ data }) => {
    const started = performance.now();
    try {
        self.postMessage({ id: data.id, ...evaluate(data), elapsed: performance.now() - started });
    } catch (error) {
        self.postMessage({ id: data.id, error: String(error.message || error) });
    }
};
