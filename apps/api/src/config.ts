import { z } from 'zod';

const OriginSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch { return false; }
});
const ConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  appOrigin: OriginSchema.default('http://localhost:5173'),
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
});
export type AppConfig = z.infer<typeof ConfigSchema>;
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = ConfigSchema.safeParse({ port: env.PORT, appOrigin: env.APP_ORIGIN, nodeEnv: env.NODE_ENV });
  if (!result.success) throw new Error('Invalid application configuration');
  return result.data;
}

const DatabaseSchema = z.object({
  ordinaryUrl: z.url({ protocol: /^postgres(?:ql)?$/ }),
  privilegedUrl: z.url({ protocol: /^postgres(?:ql)?$/ }),
});
export type DatabaseConfig = z.infer<typeof DatabaseSchema>;
export function loadDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig {
  const result = DatabaseSchema.safeParse({
    ordinaryUrl: env.DATABASE_URL ?? 'postgresql://gs_app:local-app-only@127.0.0.1:54329/greenstate',
    privilegedUrl: env.ADMIN_DATABASE_URL ?? 'postgresql://gs_admin:local-admin-only@127.0.0.1:54329/greenstate',
  });
  if (!result.success) throw new Error('Invalid database configuration');
  return result.data;
}
