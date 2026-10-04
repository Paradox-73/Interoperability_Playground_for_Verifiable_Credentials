/**
 * The recorded reference runs in `packages/protocol/fixtures/*.recorded.json`, written by
 * `npm run smoke -- --export <file>` (see `packages/server/README.md`). The UI tests and playback read
 * them, so they must stay valid exports of real runs, with every secret redacted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RunExportSchema } from '@inji-playground/protocol';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../../protocol/fixtures/', import.meta.url));
const files = readdirSync(dir).filter((name) => name.endsWith('.recorded.json'));

describe('recorded reference runs', () => {
  it('there are at least two, one per mandatory format', () => {
    const formats = files.map(
      (name) => RunExportSchema.parse(JSON.parse(readFileSync(dir + name, 'utf8'))).run.config.format,
    );
    expect(new Set(formats)).toEqual(new Set(['ldp_vc', 'vc+sd-jwt']));
  });

  it.each(files)('%s is a redacted export of a passing run with every exchange recorded', (name) => {
    const text = readFileSync(dir + name, 'utf8');
    const exported = RunExportSchema.parse(JSON.parse(text));
    expect(exported.redacted).toBe(true);
    expect(exported.redactions).toBeGreaterThan(0);
    expect(exported.run.report).toMatchObject({ verdict: 'pass', outcome: 'VALID' });
    expect(exported.exchanges.map((exchange) => exchange.step)).toEqual(
      expect.arrayContaining([
        'issuer.offer',
        'issuer.metadata',
        'token',
        'credential',
        'wallet.fetch-request',
        'wallet.submit',
      ]),
    );
    expect(exported.events.filter((event) => event.type === 'exchange')).toHaveLength(
      exported.exchanges.length,
    );
    // Tokens, codes and private key members never appear in clear.
    expect(text).not.toMatch(/Bearer (?!\[redacted)/);
    expect(text).not.toMatch(/"(access_token|pre-authorized_code|c_nonce|code|d)"\s*:\s*"(?!\[redacted)/);
    expect(text).not.toMatch(/pre-authorized_code=(?!%5Bredacted)/);
  });
});
