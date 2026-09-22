import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../time/clock.js';
import { SECURITY_CONFIG, type SecurityConfig } from './security-config.js';
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; expires: number }>();
  constructor(@Inject(Clock) private readonly clock: Clock, @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig) {}
  // Returns seconds to wait, or zero when the attempt is allowed. Fixed windows never slide.
  consume(key: string, limit: number): number {
    const now = this.clock.now().getTime();
    let bucket = this.buckets.get(key);
    if (bucket && bucket.expires <= now) { this.buckets.delete(key); bucket = undefined; }
    if (!bucket) {
      if (this.buckets.size >= this.config.maxBuckets) {
        for (const [oldKey, old] of this.buckets) if (old.expires <= now) this.buckets.delete(oldKey);
        if (this.buckets.size >= this.config.maxBuckets) return Math.max(1, Math.ceil(this.config.windowMs / 1000));
      }
      bucket = { count: 0, expires: now + this.config.windowMs }; this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.expires - now) / 1000));
    bucket.count++; return 0;
  }
}
