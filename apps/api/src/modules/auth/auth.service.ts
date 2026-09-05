import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import type { RegisterInput, RegisterOrganizerInput, LoginInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { generateUniqueSlug } from '../../common/utils/slug';
import { UsersService, USER_WITH_ROLES_INCLUDE } from '../users/users.service';
import { TokensService, type IssuedTokens, type UserForToken } from './tokens.service';

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_EXPIRES_IN_MS = 60 * 60 * 1000; // 1h

export interface AuthResult {
  user: UserForToken & { fullName: string; status: string };
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly tokensService: TokensService,
    private readonly auditLog: AuditLogService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.usersService.findByEmailWithRoles(input.email);
    if (existing) {
      throw new ConflictException('Ja existe uma conta com este e-mail.');
    }

    const passwordHash = await this.usersService.hashPassword(input.password);
    const user = await this.usersService.createUserWithRole({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      roleKey: RoleKey.PASSENGER,
    });

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'user.registered',
      entityType: 'User',
      entityId: user.id,
    });

    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async registerOrganizer(input: RegisterOrganizerInput): Promise<AuthResult> {
    const [existingUser, existingOrganizer] = await Promise.all([
      this.usersService.findByEmailWithRoles(input.adminEmail),
      this.prisma.organizer.findUnique({ where: { email: input.organizerEmail } }),
    ]);

    if (existingUser) {
      throw new ConflictException('Ja existe uma conta com este e-mail.');
    }
    if (existingOrganizer) {
      throw new ConflictException('Ja existe um organizador com este e-mail.');
    }

    const passwordHash = await this.usersService.hashPassword(input.adminPassword);

    const { organizer, user } = await this.prisma.$transaction(async (tx) => {
      const slug = await generateUniqueSlug(input.organizerName, async (candidate) =>
        Boolean(await tx.organizer.findUnique({ where: { slug: candidate } })),
      );

      const organizer = await tx.organizer.create({
        data: {
          name: input.organizerName,
          slug,
          email: input.organizerEmail,
          phone: input.organizerPhone,
          status: 'PENDING',
        },
      });

      const role = await tx.role.findUniqueOrThrow({ where: { key: RoleKey.ORGANIZER_ADMIN } });
      const user = await tx.user.create({
        data: {
          email: input.adminEmail,
          passwordHash,
          fullName: input.adminFullName,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          roles: { create: { roleId: role.id, organizerId: organizer.id } },
        },
        include: USER_WITH_ROLES_INCLUDE,
      });

      return { organizer, user };
    });

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'organizer.registered',
      entityType: 'Organizer',
      entityId: organizer.id,
      metadata: { status: organizer.status },
    });

    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.usersService.findByEmailWithRoles(input.email);

    // Mesma mensagem generica para "usuario nao existe" e "senha errada" —
    // evita permitir enumeracao de contas por tentativa e erro.
    if (!user) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const passwordMatches = await this.usersService.verifyPassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    // Aqui, diferente do caso acima, o usuario ja provou que tem a senha
    // correta — informar o motivo da recusa nao ajuda um atacante a
    // enumerar contas, e ajuda um usuario legitimo a entender o problema.
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Conta ${user.status === 'SUSPENDED' ? 'suspensa' : 'pendente de verificacao'}.`);
    }

    const tokens = await this.tokensService.issueTokenPair(user);
    return { user, tokens };
  }

  async refresh(rawRefreshToken: string): Promise<AuthResult> {
    const { userId, tokens } = await this.tokensService.rotateRefreshToken(rawRefreshToken);
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario nao encontrado.');
    }
    return { user, tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    await this.tokensService.revokeRefreshToken(rawRefreshToken);
  }

  /**
   * Sempre retorna sucesso, exista ou nao o e-mail — evita enumeracao de
   * contas. Em ambiente de desenvolvimento (sem servico de e-mail
   * configurado) o token e retornado na resposta e logado, para permitir
   * demonstrar o fluxo completo sem depender de um provedor externo.
   */
  async forgotPassword(email: string): Promise<{ devToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {};
    }

    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRES_IN_MS),
      },
    });

    // So loga o token cru fora de producao (mesmo guard do controller pro `devToken` da
    // resposta) — sem isto, todo POST /auth/forgot-password gravava a credencial que da acesso
    // total a troca de senha da conta em texto puro no log estruturado, em qualquer ambiente,
    // incluindo producao (mesma classe de bug do JWT/cookie em log ja corrigida — ver
    // docs/architecture/decisions/0020-hardening.md — so que pra este segredo especifico).
    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(
        `[DEV] Token de recuperacao de senha para ${email}: ${rawToken} ` +
          '(em producao isto seria enviado por e-mail, nunca logado ou retornado na API)',
      );
    }

    return { devToken: rawToken };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token de recuperacao invalido ou expirado.');
    }

    const passwordHash = await this.usersService.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Uma troca de senha e um sinal de possivel comprometimento da conta —
    // por seguranca, todas as sessoes existentes sao encerradas.
    await this.tokensService.revokeAllUserRefreshTokens(resetToken.userId);

    await this.auditLog.record({
      actorUserId: resetToken.userId,
      action: 'user.password_reset',
      entityType: 'User',
      entityId: resetToken.userId,
    });
  }
}
