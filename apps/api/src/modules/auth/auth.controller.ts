import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterOrganizerSchema,
  RegisterSchema,
  ResetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type RegisterOrganizerInput,
  type ResetPasswordInput,
} from '@seapass/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/jwt-payload';
import { AuthService, type AuthResult } from './auth.service';
import { TokensService } from './tokens.service';
import { UsersService } from '../users/users.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly usersService: UsersService,
  ) {}

  private respondWithAuthResult(res: Response, result: AuthResult) {
    setRefreshCookie(
      res,
      result.tokens.refreshToken,
      this.tokensService.getRefreshTokenMaxAgeMs(),
    );
    return {
      accessToken: result.tokens.accessToken,
      user: this.toPublicUser(result.user),
    };
  }

  private toPublicUser(user: AuthResult['user']) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles: user.roles.map((r) => ({ key: r.role.key, organizerId: r.organizerId })),
    };
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(body);
    return this.respondWithAuthResult(res, result);
  }

  @Public()
  @Post('register/organizer')
  async registerOrganizer(
    @Body(new ZodValidationPipe(RegisterOrganizerSchema)) body: RegisterOrganizerInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerOrganizer(body);
    return this.respondWithAuthResult(res, result);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body);
    return this.respondWithAuthResult(res, result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = readRefreshCookie(req);
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token ausente.');
    }
    const result = await this.authService.refresh(rawRefreshToken);
    return this.respondWithAuthResult(res, result);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = readRefreshCookie(req);
    await this.authService.logout(rawRefreshToken);
    clearRefreshCookie(res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput) {
    const result = await this.authService.forgotPassword(body.email);
    return {
      message: 'Se o e-mail existir, um link de recuperacao foi enviado.',
      // So preenchido fora de producao — ver AuthService.forgotPassword.
      ...(process.env.NODE_ENV !== 'production' && result.devToken
        ? { devToken: result.devToken }
        : {}),
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput) {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { message: 'Senha atualizada com sucesso.' };
  }

  // Sem @Public() — protegida pelo JwtAuthGuard global (ver app.module.ts).
  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersService.findByIdWithRoles(currentUser.sub);
    if (!user) {
      throw new UnauthorizedException('Usuario nao encontrado.');
    }
    return this.toPublicUser(user);
  }
}
