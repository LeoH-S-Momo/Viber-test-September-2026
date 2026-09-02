import { z } from "zod";
import { PasswordSchema } from "../auth/auth.schema";

export const InviteStaffSchema = z.object({
  email: z.string().email(),
  password: PasswordSchema,
  fullName: z.string().min(2).max(120),
});
export type InviteStaffInput = z.infer<typeof InviteStaffSchema>;
