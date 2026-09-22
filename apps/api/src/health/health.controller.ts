import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@greenstate/contracts';

@Controller('api/health')
export class HealthController {
  @Get('live')
  live(): HealthResponse { return { status: 'ok' }; }
}
