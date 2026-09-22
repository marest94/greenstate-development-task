import { z } from 'zod';
const limit = z.coerce.number().int().min(1).max(100_000);
const SecurityConfigSchema = z.object({
  loginIpLimit: limit.default(30), loginAccountLimit: limit.default(10), registrationIpLimit: limit.default(10),
  passwordActorLimit: limit.default(10), windowMs: z.coerce.number().int().min(1000).max(86_400_000).default(900_000),
  maxBuckets: z.coerce.number().int().min(1).max(100_000).default(10_000),
  trustProxyHops: z.coerce.number().int().min(0).max(1).default(0),
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export const SECURITY_CONFIG = Symbol('SECURITY_CONFIG');
export const APP_CONFIG = Symbol('APP_CONFIG');
export function loadSecurityConfig(env: Record<string, string | undefined> = process.env): SecurityConfig {
  const result = SecurityConfigSchema.safeParse({ loginIpLimit: env.AUTH_LOGIN_IP_LIMIT, loginAccountLimit: env.AUTH_LOGIN_ACCOUNT_LIMIT,
    registrationIpLimit: env.AUTH_REGISTRATION_IP_LIMIT, passwordActorLimit: env.AUTH_PASSWORD_ACTOR_LIMIT,
    windowMs: env.AUTH_WINDOW_MS, maxBuckets: env.AUTH_MAX_BUCKETS, trustProxyHops: env.TRUST_PROXY_HOPS });
  if (!result.success) throw new Error('Invalid authentication configuration');
  return result.data;
}
