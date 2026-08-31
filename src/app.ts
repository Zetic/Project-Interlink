import { renderWorkspaceShell } from './ui/workspaceShell.js';

function elementById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function resolveSeed(): string {
  const input = elementById<HTMLInputElement>('seed-input');
  const requested = input?.value.trim();
  return requested || String(Math.floor(Math.random() * 1_000_000_000));
}

function enterPlayerWorkspace(): void {
  const seed = resolveSeed();
  const landing = elementById<HTMLElement>('landing-screen');
  const playerView = elementById<HTMLElement>('player-view');
  const breadcrumbs = elementById<HTMLElement>('ws-breadcrumbs');
  const main = elementById<HTMLElement>('ws-main');

  if (!playerView || !breadcrumbs || !main) return;

  landing?.remove();
  playerView.style.removeProperty('display');
  breadcrumbs.innerHTML = '<span class="ws-breadcrumb--active">Planet Map</span>';

  renderWorkspaceShell(main, {
    title: 'Planet Map',
    subtitle: `Seed ${seed} · TypeScript map workspace`,
  });
}

function installLandingScreen(): void {
  elementById<HTMLButtonElement>('generate-btn')?.addEventListener('click', enterPlayerWorkspace);
  elementById<HTMLInputElement>('seed-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') enterPlayerWorkspace();
  });
}

document.addEventListener('DOMContentLoaded', installLandingScreen);
