import { z } from "zod";

/**
 * Senha exigida em cadastro/reset — nao no login (login so precisa bater com
 * o hash, nao precisa reatender a politica atual).
 */
export const PasswordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(72, "A senha deve ter no maximo 72 caracteres") // limite do bcrypt
  .regex(/[a-z]/, "A senha deve ter pelo menos uma letra minuscula")
  .regex(/[A-Z]/, "A senha deve ter pelo menos uma letra maiuscula")
  .regex(/[0-9]/, "A senha deve ter pelo menos um numero");

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: PasswordSchema,
  fullName: z.string().min(2).max(120),
  phone: z.string().min(8).max(20).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const RegisterOrganizerSchema = z.object({
  organizerName: z.string().min(2).max(120),
  organizerEmail: z.string().email(),
  organizerPhone: z.string().min(8).max(20).optional(),
  adminEmail: z.string().email(),
  adminPassword: PasswordSchema,
  adminFullName: z.string().min(2).max(120),
});
export type RegisterOrganizerInput = z.infer<typeof RegisterOrganizerSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  status: z.string(),
  roles: z.array(
    z.object({
      key: z.string(),
      organizerId: z.string().nullable(),
    }),
  ),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
