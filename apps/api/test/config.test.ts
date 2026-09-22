import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
describe('Startup configuration', () => {
  it('provides a valid local default', () => { expect(loadConfig({})).toMatchObject({ port: 3000, appOrigin: 'http://localhost:5173', nodeEnv: 'development' }); });
  it.each(['0', '-1', '65536', 'nope'])('rejects an invalid server port %s', (port) => { expect(() => loadConfig({ PORT: port })).toThrow('Invalid application configuration'); });
  it.each(['https://example.test/private', 'http://name:password@example.test', 'ftp://example.test'])('rejects an origin that is not a plain HTTP origin: %s', (origin) => { expect(() => loadConfig({ APP_ORIGIN: origin })).toThrow('Invalid application configuration'); });
});
