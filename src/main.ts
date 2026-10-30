import { bootstrap } from './app/bootstrap';
import { BrowserHost } from './host/browser-host';
import type { HostAdapter } from './host/host';

const params = new URLSearchParams(location.search);
const inTauri = '__TAURI_INTERNALS__' in window;
// The Tauri bridge is only loaded inside the desktop app.
const host: HostAdapter = inTauri ? new (await import('./host/tauri-host')).TauriHost(params) : new BrowserHost(params);
const engine = bootstrap(host, params, document);

// Exposed for E2E checks and manual poking in devtools.
(window as unknown as { clawd: typeof engine }).clawd = engine;
