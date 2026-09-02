import { Test } from "@nestjs/testing";
import { HealthCheckService } from "@nestjs/terminus";
import { HealthController } from "../../src/health/health.controller";
import { DatabaseHealthIndicator } from "../../src/health/indicators/database.health-indicator";
import { RedisHealthIndicator } from "../../src/health/indicators/redis.health-indicator";

describe("HealthController", () => {
  it("aggregates the database and redis checks", async () => {
    const healthCheckService = { check: jest.fn().mockResolvedValue({ status: "ok" }) };
    const databaseIndicator = { isHealthy: jest.fn() };
    const redisIndicator = { isHealthy: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: DatabaseHealthIndicator, useValue: databaseIndicator },
        { provide: RedisHealthIndicator, useValue: redisIndicator },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.check();

    expect(result).toEqual({ status: "ok" });
    expect(healthCheckService.check).toHaveBeenCalledWith([
      expect.any(Function),
      expect.any(Function),
    ]);
  });
});
