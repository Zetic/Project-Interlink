/**
 * Application entry point.
 *
 * World creation is deliberately kept separate from the recursive workspace
 * UI: World and Knowledge are created together, then the shared workspace
 * shell becomes the only game interface.
 */

import { generateWorld } from './generator/generateWorld.js';
import { createKnowledge } from './core/world/knowledgeState.js';
import { installApparatusControlUI } from './workspace/inspector/apparatusControlUI.js';
import { initWorkspace } from './workspace/workspaceController.js';

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function createPlayerWorld() {
  const seed = el<HTMLInputElement>('seed-input')?.value.trim() || String(Math.floor(Math.random() * 1e9));
  const world = generateWorld(seed);
  const knowledge = createKnowledge(world);
  el('landing-screen')?.remove();
  el('player-view')?.style.removeProperty('display');
  initWorkspace(world, knowledge);
}

document.addEventListener('DOMContentLoaded', () => {
  installApparatusControlUI();
  el('generate-btn')?.addEventListener('click', createPlayerWorld);
  el('seed-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') createPlayerWorld();
  });
});
