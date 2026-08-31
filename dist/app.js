import { renderWorkspaceShell } from './ui/workspaceShell.js';
function elementById(id) {
    return document.getElementById(id);
}
function resolveSeed() {
    const input = elementById('seed-input');
    const requested = input?.value.trim();
    return requested || String(Math.floor(Math.random() * 1_000_000_000));
}
function enterPlayerWorkspace() {
    const seed = resolveSeed();
    const landing = elementById('landing-screen');
    const playerView = elementById('player-view');
    const breadcrumbs = elementById('ws-breadcrumbs');
    const main = elementById('ws-main');
    if (!playerView || !breadcrumbs || !main)
        return;
    landing?.remove();
    playerView.style.removeProperty('display');
    breadcrumbs.innerHTML = '<span class="ws-breadcrumb--active">Planet Map</span>';
    renderWorkspaceShell(main, {
        title: 'Planet Map',
        subtitle: `Seed ${seed} · TypeScript map workspace`,
    });
}
function installLandingScreen() {
    elementById('generate-btn')?.addEventListener('click', enterPlayerWorkspace);
    elementById('seed-input')?.addEventListener('keydown', event => {
        if (event.key === 'Enter')
            enterPlayerWorkspace();
    });
}
document.addEventListener('DOMContentLoaded', installLandingScreen);
