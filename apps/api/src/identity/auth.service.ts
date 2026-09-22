import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { permissionsFor, TenantPrincipalSchema, type PasswordChangeInput, type LoginInput } from '@greenstate/contracts';
import type { Prisma, TenantUser } from '../generated/prisma/client.js';
import { AppError } from '../common/http/errors.js';
import { Clock } from '../common/time/clock.js';
import { Passwords } from './passwords.js';
import { SessionsRepository } from './sessions.repository.js';
import { newSession, tokenHash } from './session-token.js';
import { invalidCredentials, sameCredentials } from './credentials.js';
@Injectable()
export class AuthService {
  constructor(@Inject(SessionsRepository) private readonly sessions: SessionsRepository, @Inject(Passwords) private readonly passwords: Passwords, @Inject(Clock) private readonly clock: Clock) {}
  principal(user: TenantUser) {
    const role = user.role === 'host' ? 'host' : 'client';
    return TenantPrincipalSchema.parse({ id: user.id, email: user.email, realm: 'tenant', tenantId: user.tenantId, role, mustChangePassword: user.mustChangePassword, permissions: permissionsFor(role) });
  }
  private async issue(tx: Prisma.TransactionClient, user: TenantUser) {
    const session = newSession(this.clock.now());
    await tx.tenantSession.create({ data: { ...session.record, userId: user.id, tenantId: user.tenantId } });
    return { principal: this.principal(user), token: session.token };
  }
  async register(tenantId: string, input: LoginInput) {
    const passwordHash = await this.passwords.hash(input.password);
    return this.sessions.write(tenantId, async tx => {
      // Prisma includes schema defaults in create(); ordinary registration must not write role/state.
      const inserted = await tx.$queryRaw<{ id: string }[]>`INSERT INTO tenant_users (tenant_id, email, password_hash)
        VALUES (${tenantId}::uuid, ${input.email}, ${passwordHash}) ON CONFLICT (tenant_id, email) DO NOTHING RETURNING id`;
      if (!inserted[0]) throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
      const user = await tx.tenantUser.findUniqueOrThrow({ where: { id: inserted[0].id, tenantId } });
      return this.issue(tx, user);
    });
  }

  async login(tenantId: string, input: LoginInput) {
    const verified = await this.sessions.read(tenantId, tx => tx.tenantUser.findUnique({ where: { tenantId_email: { tenantId, email: input.email } } }));
    const valid = await this.passwords.verify(verified?.passwordHash ?? await this.passwords.dummyHash(), input.password);
    if (!valid || !verified || verified.disabledAt) return invalidCredentials();
    return this.sessions.write(tenantId, async tx => {
      const user = await this.sessions.lock(tx, tenantId, verified.id);
      if (!user || user.disabledAt || !sameCredentials(user, verified)) return invalidCredentials();
      return this.issue(tx, user);
    });
  }
  private async active(tx: Prisma.TransactionClient, tenantId: string, token: string) {
    const session = await tx.tenantSession.findUnique({ where: { tokenHash: tokenHash(token), tenantId }, include: { user: true } });
    if (!session || session.expiresAt <= this.clock.now() || session.user.disabledAt) throw new UnauthorizedException();
    return session;
  }
  async me(tenantId: string, token: string) { return this.principal((await this.sessions.read(tenantId, tx => this.active(tx, tenantId, token))).user); }
  async password(tenantId: string, token: string, input: PasswordChangeInput) {
    const verified = (await this.sessions.read(tenantId, tx => this.active(tx, tenantId, token))).user;
    if (!await this.passwords.verify(verified.passwordHash, input.currentPassword)) throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'The current password is incorrect.');
    const passwordHash = await this.passwords.hash(input.newPassword);
    return this.sessions.write(tenantId, async tx => {
      const user = await this.sessions.lock(tx, tenantId, verified.id);
      if (!user || user.disabledAt || !sameCredentials(user, verified)) throw new UnauthorizedException();
      await this.active(tx, tenantId, token);
      const changed = await tx.tenantUser.update({ where: { id: user.id, tenantId }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: false } });
      await tx.tenantSession.deleteMany({ where: { tenantId, userId: user.id } });
      return this.issue(tx, changed);
    });
  }
  async logout(tenantId: string, token: string) {
    const verified = (await this.sessions.read(tenantId, tx => this.active(tx, tenantId, token))).user;
    await this.sessions.write(tenantId, async tx => {
      await this.sessions.lock(tx, tenantId, verified.id);
      await this.active(tx, tenantId, token);
      await tx.tenantSession.delete({ where: { tokenHash: tokenHash(token), tenantId } });
    });
  }
}
