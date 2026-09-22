import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '../../config.js';
import { APP_CONFIG, SECURITY_CONFIG, type SecurityConfig } from './security-config.js';
import { CsrfGuard } from './csrf.guard.js';
import { RateLimiter } from './rate-limiter.js';
import { Passwords } from '../../identity/passwords.js';
import { SessionCookies } from '../../identity/session-cookies.js';
import { AuthLimits } from '../../identity/auth-limits.js';
@Global()
@Module({})
export class SecurityModule {
  static register(config: AppConfig, security: SecurityConfig): DynamicModule {
    return { module: SecurityModule, providers: [{ provide: APP_CONFIG, useValue: config }, { provide: SECURITY_CONFIG, useValue: security }, CsrfGuard, RateLimiter, Passwords, SessionCookies, AuthLimits], exports: [APP_CONFIG, SECURITY_CONFIG, CsrfGuard, RateLimiter, Passwords, SessionCookies, AuthLimits] };
  }
}
