import { z } from "zod";
import { PaginationQuerySchema } from "../catalog/pagination.schema";

export const ReviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "HIDDEN"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

export const ModerateReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "HIDDEN"]),
  note: z.string().max(500).optional(),
});
export type ModerateReviewInput = z.infer<typeof ModerateReviewSchema>;

export const ReviewModerationQuerySchema = PaginationQuerySchema.extend({
  status: ReviewStatusSchema.optional(),
});
export type ReviewModerationQuery = z.infer<typeof ReviewModerationQuerySchema>;

/** Ver GET /reviews/highlights (secao de depoimentos + contador da home publica). */
export const ReviewHighlightsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6),
});
export type ReviewHighlightsQuery = z.infer<typeof ReviewHighlightsQuerySchema>;
