import { z } from "zod";

export const RefundStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);
export type RefundStatus = z.infer<typeof RefundStatusSchema>;

export const IssueRefundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(3).max(300),
});
export type IssueRefundInput = z.infer<typeof IssueRefundSchema>;
