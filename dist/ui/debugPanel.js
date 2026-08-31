import { createDebugSnapshot } from '../debug/debugModel.js';
function section(title, values) {
    const container = document.createElement('section');
    container.className = 'ws-debug-section';
    const heading = document.createElement('div');
    heading.className = 'ws-debug-section-title';
    heading.textContent = title;
    container.appendChild(heading);
    for (const [label, value] of Object.entries(values)) {
        const row = document.createElement('div');
        row.className = 'ws-debug-metric';
        const left = document.createElement('span');
        left.textContent = label;
        const right = document.createElement('span');
        right.textContent = value;
        right.title = value;
        row.append(left, right);
        container.appendChild(row);
    }
    return container;
}
export function installDebugPanel(root, store) {
    const body = root.querySelector('#ws-debug-body');
    if (!body)
        return;
    store.subscribe(state => {
        const snapshot = createDebugSnapshot(state);
        body.replaceChildren(section('World', snapshot.world), section('Camera', snapshot.camera), section('Graph', snapshot.graph), section('Selection', snapshot.selection), section('Runtime', snapshot.runtime));
    });
}
