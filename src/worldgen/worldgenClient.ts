import {
  WORLDGEN_PROTOCOL_VERSION,
  validateSyntheticRequest,
  worldgenCommand,
  type WorldgenEvent,
  type WorldgenSyntheticRequest,
  type WorldgenSyntheticResult,
} from './protocol.js';

interface PendingRequest {
  resolve: (result: WorldgenSyntheticResult) => void;
  reject: (error: Error) => void;
}

export interface WorldgenClient {
  generateSynthetic(request: WorldgenSyntheticRequest): Promise<WorldgenSyntheticResult>;
  dispose(): void;
}

export function createWorldgenClient(): WorldgenClient {
  const worker = new Worker(new URL('./worldgenWorker.js', import.meta.url), { type: 'module' });
  const pending = new Map<number, PendingRequest>();
  let nextRequestId = 1;
  let disposed = false;

  function rejectAll(message: string): void {
    for (const request of pending.values()) request.reject(new Error(message));
    pending.clear();
  }

  worker.addEventListener('message', (event: MessageEvent<WorldgenEvent>) => {
    const message = event.data;
    if (!message || message.protocolVersion !== WORLDGEN_PROTOCOL_VERSION) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.type === 'error') request.reject(new Error(message.payload.message));
    else request.resolve(message.payload);
  });

  worker.addEventListener('error', event => {
    rejectAll(event.message || 'Planet Engine Worker failed.');
  });

  return {
    generateSynthetic(request) {
      if (disposed) return Promise.reject(new Error('Planet Engine client is disposed.'));
      validateSyntheticRequest(request);
      const requestId = nextRequestId++;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        worker.postMessage(worldgenCommand(requestId, request));
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      rejectAll('Planet Engine client was disposed.');
    },
  };
}
