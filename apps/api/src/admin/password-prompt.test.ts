import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { readHiddenPassword } from './password-prompt.js';
it('reads a terminal password without echo or history and restores raw mode', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn((mode: boolean) => { input.isRaw = mode; return input; }) }); const output = new PassThrough(); let printed = ''; output.on('data', chunk => { printed += chunk.toString(); });
  const pending = readHiddenPassword(input, output); input.write('A private terminal password\r');
  expect(await pending).toBe('A private terminal password'); expect(printed).not.toContain('private terminal'); expect(printed).toContain('New password:'); expect(input.setRawMode.mock.calls.map(call => call[0])).toEqual([true, false]); expect(input.isRaw).toBe(false);
});
it('rejects cancelled terminal input without leaving the terminal in raw mode', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: (mode: boolean) => { input.isRaw = mode; return input; } });
  const pending = readHiddenPassword(input, new PassThrough()); const rejected = expect(pending).rejects.toThrow(); input.write('\u0003'); await rejected; expect(input.isRaw).toBe(false);
});
it('accepts controlled piped input without trimming password spaces and rejects missing input', async () => {
  const input = new PassThrough(); const output = new PassThrough(); let printed = ''; output.on('data', chunk => { printed += chunk.toString(); }); const pending = readHiddenPassword(input, output); input.end('  A private pipe password  \n'); expect(await pending).toBe('  A private pipe password  '); expect(printed).toBe('');
  const empty = new PassThrough(); const missing = expect(readHiddenPassword(empty, output)).rejects.toThrow(); empty.end(); await missing;
});
