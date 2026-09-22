import { ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, Principal } from '@greenstate/contracts';
import { AppError } from '../common/http/errors.js';
const PERMISSIONS = Symbol('PERMISSIONS');
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const { principal } = context.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!principal) throw new UnauthorizedException();
    if (principal.mustChangePassword) throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password before continuing.');
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, [context.getHandler(), context.getClass()]);
    if (!required?.length || !required.every(permission => principal.permissions.includes(permission))) throw new ForbiddenException();
    return true;
  }
}
