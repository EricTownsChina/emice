import { setupPanelSplitter } from './panel-splitter.js';

export function setupJsonPathSplitter() {
    const content = document.querySelector('.json-content');
    return setupPanelSplitter({
        content,
        separator: document.getElementById('jsonpath-splitter'),
        storageKey: 'emice-jsonpath-split-ratio-v1',
        defaultRatio: 0.55,
        onResize: ({ right }) => content.style.setProperty('--jsonpath-result-width', `${right}px`),
    });
}
