import { describe, expect, it } from 'vitest';
import { asciiBar, findUpdate, isNewer, parseVersion, RELEASES_PAGE } from '../../src/desktop/updates';

const reply = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('versions', () => {
  it('parses tags with or without v', () => {
    expect(parseVersion('v0.2.0')).toEqual([0, 2, 0]);
    expect(parseVersion('1.10.3-beta.1')).toEqual([1, 10, 3]);
    expect(parseVersion('latest')).toBeNull();
  });

  it('compares numerically, not as text', () => {
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('v0.1.9', '0.2.0')).toBe(false);
    expect(isNewer('v1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('garbage', '0.1.0')).toBe(false);
  });
});

describe('findUpdate', () => {
  it('reports a newer release with its page', async () => {
    const url = `${RELEASES_PAGE}/tag/v0.3.0`;
    expect(await findUpdate('0.2.0', reply({ tag_name: 'v0.3.0', html_url: url }))).toEqual({ version: '0.3.0', url });
  });

  it('ignores same/older versions, drafts, pre-releases and HTTP errors', async () => {
    expect(await findUpdate('0.2.0', reply({ tag_name: 'v0.2.0' }))).toBeNull();
    expect(await findUpdate('0.2.0', reply({ tag_name: 'v0.3.0', prerelease: true }))).toBeNull();
    expect(await findUpdate('0.2.0', reply({ tag_name: 'v0.3.0', draft: true }))).toBeNull();
    expect(await findUpdate('0.2.0', reply({ message: 'rate limited' }, false))).toBeNull();
  });

  it('never trusts a foreign URL from the response', async () => {
    const u = await findUpdate('0.2.0', reply({ tag_name: 'v0.3.0', html_url: 'https://evil.example/download' }));
    expect(u).toEqual({ version: '0.3.0', url: RELEASES_PAGE });
  });
});

describe('asciiBar', () => {
  it('fills in proportion and clamps', () => {
    expect(asciiBar(0, 4)).toBe('[░░░░] 0%');
    expect(asciiBar(50, 4)).toBe('[██░░] 50%');
    expect(asciiBar(140, 4)).toBe('[████] 100%');
  });

  it('shows an empty bar while the size is unknown', () => {
    expect(asciiBar(null, 4)).toBe('[░░░░] …');
  });
});
