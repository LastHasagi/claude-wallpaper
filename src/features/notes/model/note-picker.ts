import type { Lang } from '../../../shared/i18n';
import type { Rng } from '../../../shared/rng';
import type { HostStorage } from '../../../host/host';

export interface Fact {
  id: string;
  topic: string;
  pt: string;
  en: string;
  /** Custom card title (default "Você sabia?"), e.g. for app announcements. */
  title?: { pt: string; en: string };
  /** Custom hint under the text (default "clique para fechar"). */
  cta?: { pt: string; en: string };
}

export const SEEN_KEY = 'clawd.notes.seen';
export const FALLBACK_TOPIC = 'general';

export function factText(f: Fact, lang: Lang): string {
  return f[lang] || f.en || f.pt;
}

/**
 * Picks curiosities without repeating any until every one has been shown. Prefers the mission's
 * topic, then 'general', then anything unseen. History survives restarts via host storage.
 */
export class NotePicker {
  private seen: Set<string>;

  constructor(private readonly facts: readonly Fact[], private readonly storage: HostStorage, private readonly rng: Rng) {
    this.seen = new Set(this.load().filter((id) => facts.some((f) => f.id === id)));
  }

  pick(topic: string): Fact {
    if (!this.facts.length) throw new Error('no facts available');
    const unseen = (t?: string) => this.facts.filter((f) => !this.seen.has(f.id) && (t === undefined || f.topic === t));
    let pool = unseen(topic);
    if (!pool.length) pool = unseen(FALLBACK_TOPIC);
    if (!pool.length) pool = unseen();
    if (!pool.length) {
      // Everything was shown: start a new cycle, but never repeat the very last fact right away.
      const last = [...this.seen].at(-1);
      this.seen.clear();
      pool = this.facts.filter((f) => f.id !== last && f.topic === topic);
      if (!pool.length) pool = this.facts.filter((f) => f.id !== last);
      if (!pool.length) pool = [...this.facts];
    }
    const fact = this.rng.pick(pool);
    this.seen.add(fact.id);
    this.storage.set(SEEN_KEY, JSON.stringify([...this.seen]));
    return fact;
  }

  get seenCount(): number {
    return this.seen.size;
  }

  private load(): string[] {
    try {
      const v = JSON.parse(this.storage.get(SEEN_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
}

/** Greedy word wrap to `cols` columns; words longer than a line are hard-split. */
export function wrap(text: string, cols: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while ([...word].length > cols) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push([...word].slice(0, cols).join(''));
      word = [...word].slice(cols).join('');
    }
    const candidate = line ? `${line} ${word}` : word;
    if ([...candidate].length > cols) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
