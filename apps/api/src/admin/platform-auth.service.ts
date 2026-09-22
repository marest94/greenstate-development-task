import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { permissionsFor, PlatformPrincipalSchema, type PasswordChangeInput, type LoginInput } from '@greenstate/contracts';
import type { Prisma, PlatformUser } from '../generated/prisma/client.js';
import { AppError } from '../common/http/errors.js';
import { Clock } from '../common/time/clock.js';
import { Passwords } from '../identity/passwords.js';
import { newSession, tokenHash } from '../identity/session-token.js';
import { invalidCredentials, sameCredentials } from '../identity/credentials.js';
import { PlatformSessionsRepository } from './platform-sessions.repository.js';
@Injectable()
export class PlatformAuthService {
  constructor(@Inject(PlatformSessionsRepository) private readonly sessions: PlatformSessionsRepository, @Inject(Passwords) private readonly passwords: Passwords, @Inject(Clock) private readonly clock: Clock) {}
  principal(user: PlatformUser) { return PlatformPrincipalSchema.parse({ id: user.id, email: user.email, realm: 'platform', tenantId: null, role: 'superadmin', mustChangePassword: user.mustChangePassword, permissions: permissionsFor('superadmin') }); }
  private async issue(tx: Prisma.TransactionClient, user: PlatformUser) {
    const session = newSession(this.clock.now()); await tx.platformSession.create({ data: { ...session.record, userId: user.id } });
    return { principal: this.principal(user), token: session.token };
  }
  async login(input: LoginInput) {
    const verified = await this.sessions.transaction(tx => tx.platformUser.findUnique({ where: { email: input.email } }));
    const valid = await this.passwords.verify(verified?.passwordHash ?? await this.passwords.dummyHash(), input.password);
    if (!valid || !verified) return invalidCredentials();
    return this.sessions.transaction(async tx => {
      const user = await this.sessions.lock(tx, verified.id);
      if (!user || !sameCredentials(user, verified)) return invalidCredentials();
      return this.issue(tx, user);
    });
  }
  private async active(tx: Prisma.TransactionClient, token: string) {
    const session = await tx.platformSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
    if (!session || session.expiresAt <= this.clock.now()) throw new UnauthorizedException(); return session;
  }
  async me(token: string) { return this.principal((await this.sessions.transaction(tx => this.active(tx, token))).user); }
  async password(token: string, input: PasswordChangeInput) {
    const verified = (await this.sessions.transaction(tx => this.active(tx, token))).user;
    if (!await this.passwords.verify(verified.passwordHash, input.currentPassword)) throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'The current password is incorrect.');
    const passwordHash = await this.passwords.hash(input.newPassword);
    return this.sessions.transaction(async tx => {
      const user = await this.sessions.lock(tx, verified.id);
      if (!user || !sameCredentials(user, verified)) throw new UnauthorizedException();
      await this.active(tx, token);
      const changed = await tx.platformUser.update({ where: { id: user.id }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: false } });
      await tx.platformSession.deleteMany({ where: { userId: user.id } }); return this.issue(tx, changed);
    });
  }
  async logout(token: string) {
    const verified = (await this.sessions.transaction(tx => this.active(tx, token))).user;
    await this.sessions.transaction(async tx => {
      await this.sessions.lock(tx, verified.id); await this.active(tx, token);
      await tx.platformSession.delete({ where: { tokenHash: tokenHash(token) } });
    });
  }
}
