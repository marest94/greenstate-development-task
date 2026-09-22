import { Global, Module, type DynamicModule } from '@nestjs/common';
import { Clock } from './clock.js';
@Global()
@Module({})
export class TimeModule {
  static register(clock: Clock): DynamicModule {
    return { module: TimeModule, providers: [{ provide: Clock, useValue: clock }], exports: [Clock] };
  }
}
