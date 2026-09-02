import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { RoleKey } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { parseDurationToMs } from '../../common/utils/duration';
import type { EnvConfig } from '../../config/env.schema';
import type { JwtPayload, JwtRoleClaim } from './types/jwt-payload';

export interface UserForToken {
  id: string;
  email: string;
  roles: Array<{ role: { key: RoleKey }; organizerId: string | null }>;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  private toRoleClaims(user: UserForToken): JwtRoleClaim[] {
    return user.roles.map((r) => ({ key: r.role.key, organizerId: r.organizerId }));
  }

  private hashToken(rawToken: string): string {
    const secret = this.configService.get('JWT_REFRESH_SECRET', { infer: true });
    return createHmac('sha256', secret).update(rawToken).digest('hex');
  }

  getRefreshTokenMaxAgeMs(): number {
    return parseDurationToMs(this.configService.get('JWT_REFRESH_EXPIRES_IN', { infer: true }));
  }

  signAccessToken(user: UserForToken): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: this.toRoleClaims(user),
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
    });
  }

  async issueRefreshToken(userId: string): Promise<string> {
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresInMs = parseDurationToMs(
      this.configService.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + expiresInMs),
      },
    });

    return rawToken;
  }

  async issueTokenPair(user: UserForToken): Promise<IssuedTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      Promise.resolve(this.signAccessToken(user)),
      this.issueRefreshToken(user.id),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * Troca um refresh token valido por um par novo, revogando o antigo
   * (rotacao). Se o token apresentado ja estiver revogado, isso indica
   * possivel reuso de um token roubado — como defesa, revoga TODOS os
   * refresh tokens ativos do usuario, forcando novo login em todo lugar.
   */
  async rotateRefreshToken(rawToken: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Refresh token invalido.');
    }

    if (existing.revokedAt) {
      await this.revokeAllUserRefreshTokens(existing.userId);
      throw new UnauthorizedException('Refresh token ja utilizado. Faca login novamente.');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuario nao encontrado ou inativo.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokenPair(user);
    return { userId: user.id, tokens };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
