import { bootstrap } from './app/bootstrap';
import { BrowserHost } from './host/browser-host';

const params = new URLSearchParams(location.search);
const host = new BrowserHost(params);
const engine = bootstrap(host, params, document);

// Exposed for E2E checks and manual poking in devtools.
(window as unknown as { clawd: typeof engine }).clawd = engine;
