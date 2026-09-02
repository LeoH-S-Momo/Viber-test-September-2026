import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";

/**
 * Requer Postgres/Redis reais no ar (ver infra/docker-compose.test.yml) —
 * sobe o AppModule completo e bate na API real via HTTP, validando o fluxo
 * controller -> service -> Prisma/Redis, nao apenas a unidade isolada.
 */
describe("Health (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health responds with a status payload", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty("status");
    expect(response.body).toHaveProperty("details");
  });
});
