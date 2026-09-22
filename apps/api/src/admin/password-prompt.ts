import { createInterface } from 'node:readline';
import { Writable, type Readable } from 'node:stream';

export function readHiddenPassword(input: Readable & { isTTY?: boolean }, output: Writable): Promise<string> {
  const terminal = input.isTTY === true;
  // Readline owns terminal editing/raw-mode restoration; its output is deliberately muted.
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input, output: muted, terminal, historySize: 0 });
  if (terminal) output.write('New password: ');
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (value?: string) => {
      if (finished) return;
      finished = true;
      input.removeListener('error', fail);
      reader.close();
      if (terminal) output.write('\n');
      if (value === undefined) reject(new Error('Password input was cancelled or missing.'));
      else resolve(value);
    };
    const fail = () => finish();
    reader.once('line', finish);
    reader.once('SIGINT', fail);
    reader.once('close', fail);
    input.once('error', fail);
  });
}
