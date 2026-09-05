import { Test } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from '../../src/health/health.controller';
import { PrismaHealthIndicator } from '../../src/health/indicators/prisma.health-indicator';
import { RedisHealthIndicator } from '../../src/health/indicators/redis.health-indicator';

describe('HealthController', () => {
  it('aggregates the database and redis checks', async () => {
    const healthCheckService = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
    const databaseIndicator = { isHealthy: jest.fn().mockResolvedValue({ database: { status: 'up' } }) };
    const redisIndicator = { isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: databaseIndicator },
        { provide: RedisHealthIndicator, useValue: redisIndicator },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.check();

    expect(result).toEqual({ status: 'ok' });
    expect(healthCheckService.check).toHaveBeenCalledWith([expect.any(Function), expect.any(Function)]);

    // Sem isto, um refactor que checasse redis duas vezes (ou trocasse a ordem/o nome da chave)
    // ainda passaria — `toHaveBeenCalledWith(expect.any(Function))` so prova que DUAS funcoes
    // foram passadas, nunca que sao as funcoes certas, delegando pro indicator certo.
    const indicators = healthCheckService.check.mock.calls[0]![0] as Array<() => unknown>;
    expect(databaseIndicator.isHealthy).not.toHaveBeenCalled();
    await indicators[0]!();
    expect(databaseIndicator.isHealthy).toHaveBeenCalledWith('database');
    expect(redisIndicator.isHealthy).not.toHaveBeenCalled();
    await indicators[1]!();
    expect(redisIndicator.isHealthy).toHaveBeenCalledWith('redis');
  });
});
