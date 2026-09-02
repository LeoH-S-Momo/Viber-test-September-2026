import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  const configService = app.get(ConfigService<EnvConfig, true>);

  app.enableCors({
    origin: configService.get('WEB_APP_URL', { infer: true }),
    credentials: true,
  });

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

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
