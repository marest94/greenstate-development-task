import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
@Injectable()
export class Passwords {
  hash(password: string): Promise<string> { return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }); }
  verify(digest: string, password: string): Promise<boolean> { return argon2.verify(digest, password); }
  // Unknown-account login still performs the same memory-hard verification.
  private dummy: Promise<string> | undefined;
  dummyHash(): Promise<string> { return this.dummy ??= this.hash('A dummy credential that cannot identify an account.'); }
}
