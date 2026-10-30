export const RELEASES_API = 'https://api.github.com/repos/LastHasagi/claude-wallpaper/releases/latest';
export const RELEASES_PAGE = 'https://github.com/LastHasagi/claude-wallpaper/releases';
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;
  url: string;
}

/** Parses "v1.2.3" / "1.2.3" (ignores pre-release suffixes). Null when it isn't a version. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a strictly newer version than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/**
 * Asks GitHub for the latest release. Returns it only when newer than `current` and its page is
 * this project's (never trusts an arbitrary URL from the response).
 */
export async function findUpdate(current: string, fetchImpl: typeof fetch = fetch): Promise<UpdateInfo | null> {
  const res = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
  if (typeof body.tag_name !== 'string' || body.draft === true || body.prerelease === true) return null;
  if (!isNewer(body.tag_name, current)) return null;
  const url = typeof body.html_url === 'string' && body.html_url.startsWith(RELEASES_PAGE) ? body.html_url : RELEASES_PAGE;
  return { version: body.tag_name.replace(/^v/, ''), url };
}

/** Checks now and then every 6 h; `onUpdate` fires once per newly found version. */
export function startUpdateChecks(current: string, onUpdate: (u: UpdateInfo) => void, firstDelayMs = 15_000): () => void {
  let announced = '';
  const check = async () => {
    try {
      const u = await findUpdate(current);
      if (u && u.version !== announced) {
        announced = u.version;
        onUpdate(u);
      }
    } catch {
      /* offline or rate-limited: try again next time */
    }
  };
  const first = setTimeout(check, firstDelayMs);
  const every = setInterval(check, CHECK_EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
