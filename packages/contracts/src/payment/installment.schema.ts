import { z } from "zod";

export const InstallmentOptionsQuerySchema = z.object({
  amount: z.coerce.number().positive(),
});
export type InstallmentOptionsQuery = z.infer<typeof InstallmentOptionsQuerySchema>;

export interface InstallmentOptionView {
  installments: number;
  installmentAmount: string;
  totalAmount: string;
  interestRate: number;
}
