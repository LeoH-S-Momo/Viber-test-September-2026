import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.schema';

/**
 * Sem isto, um erro fora do pipeline de request do Nest (uma promise
 * esquecida sem `.catch`, um bug no bootstrap) derruba o processo sem
 * nenhum log — ou, pior, deixa o processo vivo num estado indefinido. Loga
 * e encerra de proposito (`process.exit(1)`) em vez de tentar continuar:
 * um estado corrompido nao detectado e mais perigoso que um restart (o
 * orquestrador — PM2, Kubernetes, systemd — reinicia o processo).
 */
function registerProcessSafetyNets(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection] processo encerrando:', reason);
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    console.error('[uncaughtException] processo encerrando:', error);
    process.exit(1);
  });
}

async function bootstrap(): Promise<void> {
  registerProcessSafetyNets();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());

  const configService = app.get(ConfigService<EnvConfig, true>);

  app.enableCors({
    origin: configService.get('WEB_APP_URL', { infer: true }),
    credentials: true,
  });

  // So em dev/test — em producao, o mapa completo de rotas/DTOs facilita reconhecimento pra
  // quem for tentar abusar da API (ex.: os endpoints sem rate limit, ver ThrottlerModule
  // abaixo), sem nenhum ganho real (o time ja tem o Swagger disponivel localmente).
  if (configService.get('NODE_ENV', { infer: true }) !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SeaPass API')
      .setDescription(
        'API da plataforma SeaPass — cruzeiros temáticos.\n\n' +
          'Autenticação: envie o `accessToken` retornado por `/auth/login` como ' +
          '`Authorization: Bearer <token>`. O refresh token e enviado automaticamente via ' +
          'cookie httpOnly (`seapass_refresh_token`, escopado a `/auth`) — nao precisa ser ' +
          'passado manualmente.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
