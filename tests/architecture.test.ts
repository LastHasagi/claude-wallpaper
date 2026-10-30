import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** Resolve every relative import of a file to a path relative to src/, using '/' separators. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specs = [...text.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  return specs
    .filter((s) => s.startsWith('.'))
    .map((s) => relative(SRC, resolve(dirname(file), s)).split(sep).join('/'));
}

const files = walk(SRC).map((f) => ({ path: relative(SRC, f).split(sep).join('/'), imports: importsOf(f) }));

describe('architecture boundaries', () => {
  it('finds source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('features only use other features through their public index', () => {
    const violations: string[] = [];
    for (const f of files) {
      const own = f.path.match(/^features\/([^/]+)\//)?.[1];
      if (!own) continue;
      for (const imp of f.imports) {
        const m = imp.match(/^features\/([^/]+)(\/.*)?$/);
        if (!m || m[1] === own) continue;
        if (m[2] && m[2] !== '/index') violations.push(`${f.path} -> ${imp}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('shared and host never depend on features or app', () => {
    const violations = files
      .filter((f) => /^(shared|host)\//.test(f.path))
      .flatMap((f) => f.imports.filter((i) => /^(features|app)\//.test(i)).map((i) => `${f.path} -> ${i}`));
    expect(violations).toEqual([]);
  });

  it('features never depend on app', () => {
    const violations = files
      .filter((f) => f.path.startsWith('features/'))
      .flatMap((f) => f.imports.filter((i) => i.startsWith('app/')).map((i) => `${f.path} -> ${i}`));
    expect(violations).toEqual([]);
  });

  it('models stay free of DOM and canvas', () => {
    const violations = files
      .filter((f) => /^features\/[^/]+\/model\//.test(f.path))
      .filter((f) => /\b(document|window|HTMLCanvasElement|CanvasRenderingContext2D)\b/.test(readFileSync(join(SRC, f.path), 'utf8')))
      .map((f) => f.path);
    expect(violations).toEqual([]);
  });
});
