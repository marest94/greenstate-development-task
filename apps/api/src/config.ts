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
