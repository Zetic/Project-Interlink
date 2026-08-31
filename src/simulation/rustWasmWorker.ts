import initWasm, {
  WasmPackedWorldRuntime,
  runtime_protocol_version as runtimeProtocolVersion,
} from '../wasm/interlink_wasm.js';
import { createRustWasmWorkerHost } from './rustWasmWorkerHost.js';
import {
  RUNTIME_EVENT_TYPES,
  createRuntimeEvent,
} from './runtimeProtocol.js';

const hostPromise = (async () => {
  await initWasm();
  return createRustWasmWorkerHost({
    WasmPackedWorldRuntime,
    runtimeProtocolVersion,
  });
})();

self.addEventListener('message', async event => {
  try {
    const host = await hostPromise;
    self.postMessage(host.handle(event.data));
  } catch (error) {
    self.postMessage(createRuntimeEvent(RUNTIME_EVENT_TYPES.ERROR, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? '' : '',
    }, event?.data?.requestId ?? null));
  }
});
