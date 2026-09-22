import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimiter } from '../common/http/rate-limiter.js';
import { AppError } from '../common/http/errors.js';
import { SECURITY_CONFIG, type SecurityConfig } from '../common/http/security-config.js';
@Injectable()
export class AuthLimits {
  constructor(@Inject(RateLimiter) private readonly limiter: RateLimiter, @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig) {}
  private enforce(res: Response, limits: [string, number][]) {
    const retry = Math.max(...limits.map(([key, limit]) => this.limiter.consume(createHash('sha256').update(key).digest('hex'), limit)));
    if (retry > 0) { res.setHeader('Retry-After', retry); throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'); }
  }
  login(req: Request, res: Response, realm: string, email: string) {
    this.enforce(res, [[`login:ip:${req.ip}`, this.config.loginIpLimit], [`login:account:${realm}:${email}`, this.config.loginAccountLimit]]);
  }
  register(req: Request, res: Response) { this.enforce(res, [[`register:ip:${req.ip}`, this.config.registrationIpLimit]]); }
  password(res: Response, realm: string, actor: string, target = actor) {
    this.enforce(res, [[`password:actor:${realm}:${actor}`, this.config.passwordActorLimit], [`password:target:${realm}:${target}`, this.config.passwordActorLimit]]);
  }
}
