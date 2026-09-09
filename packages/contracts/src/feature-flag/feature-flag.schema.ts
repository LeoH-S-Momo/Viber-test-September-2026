import { z } from "zod";

export const FeatureFlagKeySchema = z.enum([
  "ADVANCED_ANALYTICS",
  "EARLY_CHECKIN_WINDOW",
  "CUSTOM_BRANDING",
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
