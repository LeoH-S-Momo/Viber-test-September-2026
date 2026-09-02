import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * Requer Postgres/Redis reais no ar (ver infra/docker-compose.test.yml) — cada
 * teste usa e-mails unicos (timestamp) para nao depender de estado de seed
 * nem de testes anteriores.
 */
describe('Auth (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const uniqueEmail = (label: string) => `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;

  function firstSetCookie(response: request.Response): string {
    const cookie = response.headers['set-cookie']?.[0];
    if (!cookie) {
      throw new Error('Resposta nao trouxe Set-Cookie.');
    }
    return cookie;
  }

  it('registers a passenger, returns an access token and a PASSENGER role', async () => {
    const email = uniqueEmail('passenger');

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: 'Passageiro Teste' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.roles).toEqual([{ key: 'PASSENGER', organizerId: null }]);
    expect(response.headers['set-cookie']?.[0]).toMatch(/seapass_refresh_token=.+HttpOnly/);
  });

  it('rejects registering the same e-mail twice', async () => {
    const email = uniqueEmail('dup');
    const payload = { email, password: 'SenhaForte123', fullName: 'Dup' };

    await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);
    await request(app.getHttpServer()).post('/auth/register').send(payload).expect(409);
  });

  it('rejects a weak password with field-level validation errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('weak'), password: '123', fullName: 'Fraco' })
      .expect(400);

    expect(response.body.errors.password).toBeDefined();
  });

  it('never leaks whether an e-mail exists via login or forgot-password', async () => {
    const email = uniqueEmail('enum');
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: 'Existe' })
      .expect(201);

    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'SenhaErrada123' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail('missing'), password: 'SenhaErrada123' })
      .expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);

    const forgotExisting = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);
    const forgotMissing = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: uniqueEmail('missing2') })
      .expect(200);
    expect(forgotExisting.body.message).toBe(forgotMissing.body.message);
  });

  it('completes the password reset flow and invalidates the old password', async () => {
    const email = uniqueEmail('reset');
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SenhaAntiga123', fullName: 'Reset' })
      .expect(201);

    const forgot = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);
    const devToken = forgot.body.devToken;
    expect(devToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: devToken, newPassword: 'SenhaNova123' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'SenhaAntiga123' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'SenhaNova123' })
      .expect(200);

    // token de reset e de uso unico
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: devToken, newPassword: 'Outra123456' })
      .expect(401);
  });

  it('protects /auth/me and returns the current user when authenticated', async () => {
    const email = uniqueEmail('me');
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: 'Eu Mesmo' })
      .expect(201);

    await request(app.getHttpServer()).get('/auth/me').expect(401);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${register.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const email = uniqueEmail('refresh');

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: 'Refresh' })
      .expect(201);
    const firstCookie = firstSetCookie(register);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = firstSetCookie(refreshed);
    expect(secondCookie).not.toBe(firstCookie);

    // reapresentar o cookie ANTIGO (ja rotacionado) deve falhar...
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    // ...e, por deteccao de reuso, ate o cookie NOVO (legitimo) e revogado como defesa.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    const email = uniqueEmail('logout');
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: 'Logout' })
      .expect(201);

    await agent.post('/auth/logout').expect(204);
    await agent.post('/auth/refresh').expect(401);
  });
});
