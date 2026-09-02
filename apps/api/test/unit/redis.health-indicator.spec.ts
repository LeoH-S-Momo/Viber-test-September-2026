import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from '../../src/health/indicators/redis.health-indicator';
import { RedisService } from '../../src/redis/redis.service';

describe('RedisHealthIndicator', () => {
  it('reports healthy when ping replies PONG', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') } as unknown as RedisService;
    const indicator = new RedisHealthIndicator(redis);

    await expect(indicator.isHealthy('redis')).resolves.toEqual({ redis: { status: 'up' } });
  });

  it('throws HealthCheckError when ping rejects', async () => {
    const redis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as RedisService;
    const indicator = new RedisHealthIndicator(redis);

    await expect(indicator.isHealthy('redis')).rejects.toBeInstanceOf(HealthCheckError);
  });

  it('throws HealthCheckError when ping replies something other than PONG', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('WRONG') } as unknown as RedisService;
    const indicator = new RedisHealthIndicator(redis);

    await expect(indicator.isHealthy('redis')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
