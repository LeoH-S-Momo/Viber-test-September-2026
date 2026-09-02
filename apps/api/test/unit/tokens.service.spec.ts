import { UnauthorizedException } from '@nestjs/common';
import { TokensService } from '../../src/modules/auth/tokens.service';

function buildService() {
  const jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
  const prisma = {
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn() },
  };
  const env: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  };
  const configService = { get: jest.fn((key: string) => env[key]) };

  const service = new TokensService(jwtService as never, prisma as never, configService as never);
  return { service, jwtService, prisma, configService };
}

const userForToken = {
  id: 'u1',
  email: 'a@a.com',
  roles: [{ role: { key: 'PASSENGER' }, organizerId: null }],
} as never;

describe('TokensService', () => {
  it('signs an access token including role claims', () => {
    const { service, jwtService } = buildService();

    const token = service.signAccessToken(userForToken);

    expect(token).toBe('signed-jwt');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        email: 'a@a.com',
        roles: [{ key: 'PASSENGER', organizerId: null }],
      }),
      expect.objectContaining({ secret: 'access-secret', expiresIn: '15m' }),
    );
  });

  it('creates a refresh token row with a hashed token, never the raw value', async () => {
    const { service, prisma } = buildService();

    const rawToken = await service.issueRefreshToken('u1');

    expect(rawToken).toEqual(expect.any(String));
    const createCall = prisma.refreshToken.create.mock.calls[0][0];
    expect(createCall.data.tokenHash).not.toBe(rawToken);
    expect(createCall.data.userId).toBe('u1');
  });

  it('rejects an unknown refresh token', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.rotateRefreshToken('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired refresh token', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.rotateRefreshToken('expired')).rejects.toThrow(/expirado/);
  });

  it('detects reuse of an already-revoked token and revokes every session as a defense measure', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 100_000),
    });

    await expect(service.rotateRefreshToken('stolen')).rejects.toThrow(/ja utilizado/);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rotates a valid token: revokes the old one and issues a new pair', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'ACTIVE',
      roles: [{ role: { key: 'PASSENGER' }, organizerId: null }],
    });

    const result = await service.rotateRefreshToken('valid-token');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.userId).toBe('u1');
    expect(result.tokens.accessToken).toBe('signed-jwt');
  });

  it('rejects rotation for a user that is no longer active', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'SUSPENDED', roles: [] });

    await expect(service.rotateRefreshToken('valid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
