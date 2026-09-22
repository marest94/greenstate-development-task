import { expect, it } from 'vitest';
import { Passwords } from './passwords.js';
const passwords = new Passwords();
it('uses independently salted Argon2id hashes with explicit cost and exact password verification', async () => {
  const input = 'A long, Unicode passphrase: 雨 and space ';
  const one = await passwords.hash(input); const two = await passwords.hash(input);
  expect(one).not.toBe(two); expect(one.split('$').slice(1, 3)).toEqual(['argon2id', 'v=19']); expect(one.split('$')[3]!.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
  expect(await passwords.verify(one, input)).toBe(true);
  expect(await passwords.verify(one, input.trim())).toBe(false);
});
