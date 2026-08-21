/**
 * Player-facing paused engineering mode.
 *
 * Physical world time advances only through explicit requests. The historical
 * RAF-driven loop in workspaceController remains a compatibility surface during
 * this migration, but this module cancels that presentation scheduler whenever
 * a workspace shell is installed and keeps world simulation paused between
 * advancement requests.
 */

import { wsState } from '../workspaceState.js';
import { pauseWorldSimulation } from '../../simulation/worldSimulation.js';
import { advanceWorldBy } from '../../simulation/advancement/advancementScheduler.js';

let advanceInProgress = false;
let lastAdvanceResult = null;
let lastAdvanceError = null;

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(seconds % 3600 === 0 ? 0 : 2)} h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(seconds % 60 === 0 ? 0 : 2)} min`;
  return `${seconds.toFixed(seconds < 1 ? 1 : 1)} s`;
}

function formatWallMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatFactor(value) {
  if (value === Number.POSITIVE_INFINITY) return '∞×';
  return Number.isFinite(value) ? `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)}×` : '—';
}

function stopLegacyRealtimeScheduling() {
  wsState.simRunning = false;
  if (wsState.simRafId != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(wsState.simRafId);
  }
  wsState.simRafId = null;
  wsState.simLastTime = null;
  wsState.simAccumulatedS = 0;
  if (wsState.world) pauseWorldSimulation(wsState.world);

  const legacyToggle = document.getElementById('ws-world-toggle');
  if (legacyToggle) {
    legacyToggle.disabled = true;
    legacyToggle.textContent = '⏸ Engineering Mode';
    legacyToggle.title = 'World time is paused. Use explicit Advance controls to run the simulation.';
  }
}

function setText(root, selector, value) {
  root.querySelectorAll(selector).forEach(element => { element.textContent = value; });
}

function setControlsDisabled(root, disabled) {
  root.querySelectorAll('[data-world-advance-seconds], [data-world-advance-custom-submit], [data-world-advance-custom]')
    .forEach(element => { element.disabled = Boolean(disabled); });
}

function renderLastAdvance(root) {
  const worldTime = wsState.world?.simulation?.elapsedSeconds ?? 0;
  setText(root, '[data-world-time]', `${worldTime.toFixed(1)} s`);

  const toolbarStatus = root.querySelector('[data-world-advance-status]');
  if (toolbarStatus) {
    if (advanceInProgress) toolbarStatus.textContent = 'Simulating…';
    else if (lastAdvanceError) toolbarStatus.textContent = lastAdvanceError;
    else if (lastAdvanceResult) {
      toolbarStatus.textContent = `+${formatDuration(lastAdvanceResult.advancedSeconds)} · ${formatWallMs(lastAdvanceResult.elapsedWallMs)} · ${formatFactor(lastAdvanceResult.throughputRealtimeFactor)}`;
    } else toolbarStatus.textContent = 'Simulation paused';
  }

  const result = lastAdvanceResult;
  setText(root, '[data-advance-stat="mode"]', advanceInProgress ? 'Advancing' : 'Paused');
  setText(root, '[data-advance-stat="requested"]', result ? formatDuration(result.requestedSeconds) : '—');
  setText(root, '[data-advance-stat="compute"]', result ? formatWallMs(result.elapsedWallMs) : '—');
  setText(root, '[data-advance-stat="throughput"]', result ? formatFactor(result.throughputRealtimeFactor) : '—');
  setText(root, '[data-advance-stat="fixed-equivalent"]', result ? String(result.fixedEquivalentSteps) : '0');
  setText(root, '[data-advance-stat="operations"]', result ? String(result.schedulerOperations) : '0');
  setText(root, '[data-advance-stat="compression"]', result ? formatFactor(result.scheduleCompressionRatio) : '—');
  setText(root, '[data-advance-stat="detailed"]', result ? String(result.detailedFixedSteps) : '0');
  setText(root, '[data-advance-stat="linear"]', result ? `${result.linearBatchOperations} ops / ${result.linearEquivalentSteps} steps` : '0');
  setText(root, '[data-advance-stat="quiescent"]', result ? `${result.quiescentFastForwardOperations} ops / ${result.quiescentEquivalentSteps} steps` : '0');
  const segmentKind = result?.operatingSegment?.activeSegment?.kind ?? 'none';
  setText(root, '[data-advance-stat="segment"]', segmentKind);
}

function parseRequestedSeconds(root, button) {
  if (button?.dataset?.worldAdvanceSeconds != null) {
    return Number(button.dataset.worldAdvanceSeconds);
  }
  const input = root.querySelector('[data-world-advance-custom]');
  return Number(input?.value ?? NaN);
}

async function refreshWorkspace() {
  const { renderWorkspace } = await import('../workspaceController.js');
  renderWorkspace();
}

async function runAdvance(root, seconds) {
  if (advanceInProgress || !wsState.world) return;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    lastAdvanceError = 'Advance time must be a positive multiple of 0.1 s.';
    renderLastAdvance(root);
    return;
  }

  advanceInProgress = true;
  lastAdvanceError = null;
  stopLegacyRealtimeScheduling();
  setControlsDisabled(root, true);
  renderLastAdvance(root);

  try {
    lastAdvanceResult = await advanceWorldBy(wsState.world, seconds, {
      yieldEveryOperations: 20,
      onProgress(progress) {
        const status = root.querySelector('[data-world-advance-status]');
        if (!status) return;
        status.textContent = `Simulating ${formatDuration(progress.advancedSeconds)} / ${formatDuration(progress.requestedSeconds)}…`;
      },
    });
  } catch (error) {
    lastAdvanceError = error?.message ?? String(error);
  } finally {
    advanceInProgress = false;
    stopLegacyRealtimeScheduling();
  }

  await refreshWorkspace();
}

function installButtons(root) {
  root.querySelectorAll('[data-world-advance-seconds]').forEach(button => {
    button.addEventListener('click', () => runAdvance(root, parseRequestedSeconds(root, button)));
  });
  root.querySelectorAll('[data-world-advance-custom-submit]').forEach(button => {
    button.addEventListener('click', () => runAdvance(root, parseRequestedSeconds(root, button)));
  });
  root.querySelectorAll('[data-world-advance-custom]').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      runAdvance(root, Number(event.currentTarget.value));
    });
  });
}

export function installEngineeringModeControls(root) {
  if (!root) return;
  stopLegacyRealtimeScheduling();
  // initWorkspace historically starts its RAF immediately after the first shell
  // render. Cancel it again after the current call stack so engineering mode wins
  // without making workspace presentation own physical time.
  queueMicrotask(stopLegacyRealtimeScheduling);
  installButtons(root);
  setControlsDisabled(root, advanceInProgress);
  renderLastAdvance(root);
}

export function engineeringModeSnapshot() {
  return {
    advanceInProgress,
    lastAdvanceResult: lastAdvanceResult ? { ...lastAdvanceResult } : null,
    lastAdvanceError,
  };
}
