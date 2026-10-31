import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/release-notes.mjs';

function run(tag: string, changelog?: string): { ok: boolean; out: string } {
  const args = [SCRIPT, tag];
  if (changelog !== undefined) {
    const file = join(mkdtempSync(join(tmpdir(), 'notes-')), 'CHANGELOG.md');
    writeFileSync(file, changelog);
    args.push(file);
  }
  try {
    return { ok: true, out: execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
}

const SAMPLE = [
  '# Novidades',
  '',
  '## v0.3.0 — 2026-11-01',
  '### Novo',
  '- cursor do Clawd',
  '',
  '## v0.2.1',
  '- correção',
  '',
  '## v0.2.10',
  '- outra',
].join('\n');

describe('release notes', () => {
  it("publishes only the tag's own section, plus the install instructions", () => {
    const r = run('v0.3.0', SAMPLE);
    expect(r.ok).toBe(true);
    expect(r.out).toContain('- cursor do Clawd');
    expect(r.out).not.toContain('correção');
    expect(r.out).toContain('## Instalar');
  });

  it('matches the exact version (v0.2.1 is not v0.2.10)', () => {
    const r = run('v0.2.1', SAMPLE);
    expect(r.out).toContain('- correção');
    expect(r.out).not.toContain('- outra');
  });

  it('fails when the version has no entry, so a release never ships without notes', () => {
    expect(run('v9.9.9', SAMPLE).ok).toBe(false);
    expect(run('v0.4.0', '## v0.4.0\n\n## v0.3.0\n- x').ok).toBe(false);
  });

  it('the real CHANGELOG has an entry for the current app version', () => {
    const { version } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as { version: string };
    expect(run(`v${version}`).ok).toBe(true);
  });
});
