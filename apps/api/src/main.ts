import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const app = await createApp();
  await app.listen(config.port, '0.0.0.0');
} catch {
  process.stderr.write('Application startup failed. Check configuration and service availability.\n');
  process.exitCode = 1;
}
