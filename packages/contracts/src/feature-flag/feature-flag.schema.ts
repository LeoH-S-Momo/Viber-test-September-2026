import { z } from "zod";

export const FeatureFlagKeySchema = z.enum([
  "ADVANCED_ANALYTICS",
  "EARLY_CHECKIN_WINDOW",
  "CUSTOM_BRANDING",
  "LOYALTY_POINTS",
  "MULTI_CURRENCY_PRICING",
  "DYNAMIC_PRICING",
  "GROUP_BOOKING_DISCOUNTS",
  "VIRTUAL_CABIN_TOUR",
  "LIVE_CHAT_SUPPORT",
  "SOCIAL_SHARE_REVIEWS",
  "CABIN_WAITLIST",
  "CARBON_OFFSET",
  "REFERRAL_PROGRAM",
]);
export type FeatureFlagKey = z.infer<typeof FeatureFlagKeySchema>;

export const SetFeatureFlagSchema = z.object({
  enabled: z.boolean(),
});
export type SetFeatureFlagInput = z.infer<typeof SetFeatureFlagSchema>;

export interface FeatureFlagView {
  key: FeatureFlagKey;
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: string | null;
}
