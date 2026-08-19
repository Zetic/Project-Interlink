/**
 * Application entry point.
 *
 * World creation is deliberately kept separate from the recursive workspace
 * UI: World and Knowledge are created together, then the shared workspace
 * shell becomes the only game interface.
 */

import { createWorld } from './core/world/worldState.js';
import { createKnowledge } from './core/world/knowledgeState.js';
import { initWorkspace } from './workspace/workspaceUI.js';

function el(id) {
  return document.getElementById(id);
}

function generateWorld() {
  const seed = el('seed-input')?.value.trim() || String(Math.floor(Math.random() * 1e9));
  const world = createWorld(seed);
  const knowledge = createKnowledge(world);
  el('landing-screen')?.remove();
  el('player-view')?.style.removeProperty('display');
  initWorkspace(world, knowledge);
}

document.addEventListener('DOMContentLoaded', () => {
  el('generate-btn')?.addEventListener('click', generateWorld);
  el('seed-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') generateWorld();
  });
});
