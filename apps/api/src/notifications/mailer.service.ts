import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Wrapper fino sobre nodemailer/SMTP — em dev aponta pro MailHog local
 * (SMTP :1025, UI web em http://localhost:8025, ver ADR-0019 e
 * .claude/skills/seapass-local-infra/SKILL.md), em produção seria as
 * credenciais reais de um provedor SMTP. Nao esconde falha nenhuma: se o
 * SMTP estiver fora do ar, `sendMail` rejeita e quem chamou (sempre
 * `NotificationsProcessor`, nunca o request-path — ver ADR-0019) decide o
 * que fazer (BullMQ retry).
 */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM', 'SeaPass <no-reply@seapass.com>');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: this.config.get<string>('SMTP_USER')
        ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') }
        : undefined,
    });
  }

  async sendMail(input: SendMailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    this.logger.debug(`E-mail enviado para ${input.to}: "${input.subject}"`);
  }

  onModuleDestroy() {
    this.transporter.close();
  }
}
