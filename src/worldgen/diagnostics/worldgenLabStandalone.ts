import { createWorldgenClient } from '../worldgenClient.js';
import type { WorldgenSyntheticResult } from '../protocol.js';

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Worldgen Lab is missing #${id}.`);
  return target as T;
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function fieldColor(value: number): readonly [number, number, number] {
  const t = value / 65_535;
  if (t < 0.33) {
    const local = t / 0.33;
    return [byte(16 + 32 * local), byte(34 + 94 * local), byte(73 + 82 * local)];
  }
  if (t < 0.66) {
    const local = (t - 0.33) / 0.33;
    return [byte(48 + 128 * local), byte(128 + 40 * local), byte(155 - 77 * local)];
  }
  const local = (t - 0.66) / 0.34;
  return [byte(176 + 70 * local), byte(168 + 72 * local), byte(78 + 160 * local)];
}

function renderField(canvas: HTMLCanvasElement, result: WorldgenSyntheticResult): void {
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Worldgen Lab could not acquire a 2D canvas context.');
  const image = context.createImageData(result.width, result.height);
  for (let index = 0; index < result.values.length; index += 1) {
    const [red, green, blue] = fieldColor(result.values[index]!);
    const offset = index * 4;
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function metric(container: HTMLElement, label: string, value: string): void {
  const item = document.createElement('div');
  const key = document.createElement('strong');
  key.textContent = label;
  const detail = document.createElement('span');
  detail.textContent = value;
  item.append(key, detail);
  container.appendChild(item);
}

function renderMetrics(container: HTMLElement, result: WorldgenSyntheticResult): void {
  container.replaceChildren();
  metric(container, 'Engine', `v${result.engineVersion}`);
  metric(container, 'Stage', `${result.stage.id}@${result.stage.version}`);
  metric(container, 'Field', `${result.width} × ${result.height}`);
  metric(container, 'Samples', result.statistics.sampleCount.toLocaleString());
  metric(container, 'Min / max', `${result.statistics.minimum.toLocaleString()} / ${result.statistics.maximum.toLocaleString()}`);
  metric(container, 'Mean', result.statistics.mean.toFixed(3));
  metric(container, 'Field hash', result.statistics.fieldHash);
  metric(container, 'Stage seed', result.stage.stageSeed);
  metric(container, 'Worker + WASM', `${result.stage.durationMs.toFixed(2)} ms`);
}

function install(): void {
  const seed = element<HTMLInputElement>('worldgen-seed');
  const width = element<HTMLInputElement>('worldgen-width');
  const height = element<HTMLInputElement>('worldgen-height');
  const generate = element<HTMLButtonElement>('worldgen-generate');
  const status = element<HTMLElement>('worldgen-status');
  const metrics = element<HTMLElement>('worldgen-metrics');
  const canvas = element<HTMLCanvasElement>('worldgen-field');
  const client = createWorldgenClient();

  async function run(): Promise<void> {
    generate.disabled = true;
    status.className = 'worldgen-lab-status';
    status.textContent = 'Generating deterministic WG-0 synthetic field in the Rust/WASM Worker…';
    try {
      const result = await client.generateSynthetic({
        seed: seed.value.trim() || 'wg0-lab',
        width: Number(width.value),
        height: Number(height.value),
      });
      renderField(canvas, result);
      renderMetrics(metrics, result);
      status.className = 'worldgen-lab-status worldgen-lab-status--ok';
      status.textContent = 'Planet Engine path active. This field is architectural diagnostics, not terrain.';
    } catch (error) {
      status.className = 'worldgen-lab-status worldgen-lab-status--error';
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      generate.disabled = false;
    }
  }

  generate.addEventListener('click', () => { void run(); });
  seed.addEventListener('keydown', event => { if (event.key === 'Enter') void run(); });
  window.addEventListener('beforeunload', () => client.dispose(), { once: true });
  void run();
}

document.addEventListener('DOMContentLoaded', install);
