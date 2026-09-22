import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { recoverPlatformAdmin } from '../src/admin/recover-platform-admin.js';
import { Passwords } from '../src/identity/passwords.js';
import { adminHarness, cookie, csrf, password, type AdminHarness, type AdminFixture } from './admin-fixtures.js';
let h: AdminHarness; let f: AdminFixture; const replacement = 'A recovered private platform password';
beforeAll(async () => { h = await adminHarness(); }); beforeEach(async () => { f = await h.fixture(); }); afterEach(() => vi.restoreAllMocks()); afterAll(async () => { await h?.close(); });
const login = (value: string) => request(h.app.getHttpServer()).post('/api/v1/admin/auth/login').set(csrf).send({ email: f.admin.user.email, password: value });
function cli(args: string[], input = replacement, url: string | undefined = h.db.urls.owner, rootCommand = false) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const env = { ...process.env }; delete env.RECOVERY_DATABASE_URL; if (url) env.RECOVERY_DATABASE_URL = url;
    const executable = rootCommand ? 'npm' : process.execPath;
    const command = rootCommand ? ['run', 'admin:recover', '--', ...args] : [fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)), fileURLToPath(new URL('../src/admin/recover-platform-admin.ts', import.meta.url)), ...args];
    const child = spawn(executable, command, { env, cwd: fileURLToPath(new URL('../../../', import.meta.url)), stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', value => { output += value.toString(); }); child.stderr.on('data', value => { output += value.toString(); });
    child.once('error', reject); child.once('close', code => resolve({ code, output })); child.stdin.end(`${input}\n`);
  });
}
it('recovers an existing account using owner credentials, revoking old sessions and enabling the chosen password', async () => {
  await recoverPlatformAdmin(h.db.urls.owner, f.admin.user.email, replacement);
  await login(password).expect(401); await request(h.app.getHttpServer()).get('/api/v1/admin/auth/me').set('Cookie', f.admin.cookie).expect(401);
  const response = await login(replacement).expect(200); expect(response.body.mustChangePassword).toBe(false);
  expect((await h.db.admin.platformUser.findUniqueOrThrow({ where: { id: f.admin.user.id } })).credentialVersion).toBe(2);
});
it('requires administrative database ownership and never creates an unknown account', async () => {
  for (const url of [h.db.urls.app, h.db.urls.admin]) await expect(recoverPlatformAdmin(url, f.admin.user.email, replacement)).rejects.toThrow();
  await expect(recoverPlatformAdmin(h.db.urls.owner, 'unknown@example.test', replacement)).rejects.toThrow();
  expect(await h.db.admin.platformUser.count({ where: { email: 'unknown@example.test' } })).toBe(0); await login(password).expect(200);
});
it('accepts a controlled stdin password without printing it, a hash, token or connection URL', async () => {
  const result = await cli(['--email', f.admin.user.email]); expect(result.code).toBe(0); expect(result.output).toContain('Password recovered.');
  for (const value of [replacement, password, h.db.urls.owner, '$argon2', f.admin.cookie.split('=')[1]!]) expect(result.output).not.toContain(value);
  await login(replacement).expect(200);
});
it('rejects password flags, missing credentials and unknown accounts with safe output', async () => {
  const cases = [await cli(['--email', f.admin.user.email, '--password', replacement]), await cli(['--email', f.admin.user.email], replacement, ''), await cli(['--email', 'unknown@example.test']), await cli(['--email', f.admin.user.email], 'short'), await cli(['--email', f.admin.user.email], replacement, h.db.urls.admin)];
  for (const result of cases) { expect(result.code).toBe(1); expect(result.output).toContain('Recovery failed.'); expect(result.output).not.toContain(replacement); expect(result.output).not.toContain(h.db.urls.owner); expect(result.output).not.toContain('$argon2'); }
  await login(password).expect(200);
});
it('does not let an already-verified old login survive recovery', async () => {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const passwords = h.app.get(Passwords); const verify = passwords.verify.bind(passwords);
  vi.spyOn(passwords, 'verify').mockImplementationOnce(async (hash, value) => { const valid = await verify(hash, value); entered.resolve(); await release.promise; return valid; });
  const old = login(password).then(r => r);
  try { await entered.promise; await recoverPlatformAdmin(h.db.urls.owner, f.admin.user.email, replacement); release.resolve(); expect((await old).status).toBe(401); const result = await login(replacement).expect(200); await request(h.app.getHttpServer()).get('/api/v1/admin/auth/me').set('Cookie', cookie(result)).expect(200); }
  finally { release.resolve(); await old; }
});

it('supports the documented root npm command with safe stdin forwarding', async () => {
  const result = await cli(['--email', f.admin.user.email], replacement, h.db.urls.owner, true);
  expect(result.code).toBe(0); expect(result.output).toContain('Password recovered.'); expect(result.output).not.toContain(replacement); expect(result.output).not.toContain(h.db.urls.owner); await login(replacement).expect(200);
});
