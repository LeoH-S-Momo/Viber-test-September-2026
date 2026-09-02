import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { AuthService } from '../../src/modules/auth/auth.service';

function buildDeps() {
  const prisma = {
    organizer: { findUnique: jest.fn(), create: jest.fn() },
    role: { findUniqueOrThrow: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const usersService = {
    findByEmailWithRoles: jest.fn(),
    findByIdWithRoles: jest.fn(),
    hashPassword: jest.fn().mockResolvedValue('hashed-password'),
    verifyPassword: jest.fn(),
    createUserWithRole: jest.fn(),
  };
  const tokensService = {
    issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllUserRefreshTokens: jest.fn(),
  };
  const auditLog = { record: jest.fn() };

  const service = new AuthService(
    prisma as never,
    usersService as never,
    tokensService as never,
    auditLog as never,
  );

  return { service, prisma, usersService, tokensService, auditLog };
}

describe('AuthService', () => {
  describe('register', () => {
    it('throws ConflictException when the email is already taken', async () => {
      const { service, usersService } = buildDeps();
      usersService.findByEmailWithRoles.mockResolvedValue({ id: 'u1' });

      await expect(
        service.register({ email: 'a@a.com', password: 'Aa123456', fullName: 'A' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashes the password and creates a PASSENGER user', async () => {
      const { service, usersService, tokensService, auditLog } = buildDeps();
      usersService.findByEmailWithRoles.mockResolvedValue(null);
      const createdUser = { id: 'u1', email: 'a@a.com', fullName: 'A', roles: [] };
      usersService.createUserWithRole.mockResolvedValue(createdUser);

      const result = await service.register({
        email: 'a@a.com',
        password: 'Aa123456',
        fullName: 'A',
      });

      expect(usersService.hashPassword).toHaveBeenCalledWith('Aa123456');
      expect(usersService.createUserWithRole).toHaveBeenCalledWith(
        expect.objectContaining({ roleKey: RoleKey.PASSENGER, passwordHash: 'hashed-password' }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.registered' }),
      );
      expect(tokensService.issueTokenPair).toHaveBeenCalledWith(createdUser);
      expect(result.tokens.accessToken).toBe('access');
    });
  });

  describe('login', () => {
    const activeUser = {
      id: 'u1',
      email: 'a@a.com',
      passwordHash: 'hashed',
      status: 'ACTIVE',
      roles: [],
    };

    it('throws UnauthorizedException with a generic message when the user does not exist', async () => {
      const { service, usersService } = buildDeps();
      usersService.findByEmailWithRoles.mockResolvedValue(null);

      await expect(service.login({ email: 'x@x.com', password: 'x' })).rejects.toThrow(
        'Credenciais invalidas.',
      );
    });

    it('throws the same generic message when the password is wrong (no user enumeration)', async () => {
      const { service, usersService } = buildDeps();
      usersService.findByEmailWithRoles.mockResolvedValue(activeUser);
      usersService.verifyPassword.mockResolvedValue(false);

      await expect(service.login({ email: 'a@a.com', password: 'wrong' })).rejects.toThrow(
        'Credenciais invalidas.',
      );
    });

    it('rejects a correct password for a suspended account with a specific reason', async () => {
      const { service, usersService } = buildDeps();
      usersService.findByEmailWithRoles.mockResolvedValue({ ...activeUser, status: 'SUSPENDED' });
      usersService.verifyPassword.mockResolvedValue(true);

      await expect(service.login({ email: 'a@a.com', password: 'correct' })).rejects.toThrow(
        /suspensa/,
      );
    });

    it('issues tokens for a correct password and an ACTIVE account', async () => {
      const { service, usersService, tokensService } = buildDeps();
      usersService.findByEmailWithRoles.mockResolvedValue(activeUser);
      usersService.verifyPassword.mockResolvedValue(true);

      const result = await service.login({ email: 'a@a.com', password: 'correct' });

      expect(tokensService.issueTokenPair).toHaveBeenCalledWith(activeUser);
      expect(result.user).toBe(activeUser);
    });
  });

  describe('forgotPassword / resetPassword', () => {
    it('returns no devToken when the email does not exist (no enumeration)', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('missing@x.com');

      expect(result).toEqual({});
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a reset token and returns it (dev-mode) when the email exists', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@a.com' });

      const result = await service.forgotPassword('a@a.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(result.devToken).toEqual(expect.any(String));
    });

    it('rejects an unknown/expired/used reset token', async () => {
      const { service, prisma } = buildDeps();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewPass123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('updates the password and revokes all refresh tokens on a valid reset', async () => {
      const { service, prisma, tokensService, auditLog } = buildDeps();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.$transaction.mockResolvedValue(undefined);

      await service.resetPassword('good-token', 'NewPass123');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tokensService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('u1');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.password_reset' }),
      );
    });
  });
});
