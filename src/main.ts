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

if (inTauri) void watchForUpdates();

/** Desktop app only: tray item + settings banner, and Clawd brings a note once per new version. */
async function watchForUpdates(): Promise<void> {
  const [{ invoke }, { getVersion }, { startUpdateChecks }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/app'),
    import('./desktop/updates'),
  ]);
  const config = await invoke<{ checkUpdates: boolean }>('get_config');
  if (!config.checkUpdates) return;
  startUpdateChecks(await getVersion(), (u) => {
    void invoke('set_update_available', { version: u.version, url: u.url }).catch(() => {});
    const key = 'clawd.update.announced';
    if (host.storage.get(key) === u.version) return;
    host.storage.set(key, u.version);
    engine.notes.announce(
      {
        id: `update-${u.version}`,
        topic: 'app',
        title: { pt: 'Novidade!', en: 'New version!' },
        pt: `Saiu a versão ${u.version} do Clawd Pet! Clique aqui para ver as novidades e baixar.`,
        en: `Clawd Pet ${u.version} is out! Click here to see what's new and download it.`,
        cta: { pt: 'clique para abrir a página', en: 'click to open the page' },
      },
      () => void invoke('open_update_page').catch(() => {}),
    );
  });
}
