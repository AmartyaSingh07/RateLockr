import { z } from "zod";

export const ruleSchema = z.object({
  client_id: z.string().max(128),
  endpoint: z.string().max(256),
  limit: z.number().int().min(1),
  window_seconds: z.number().int().min(1),
  algorithm: z.enum(["token_bucket", "sliding_window", "fixed_window"]),
}).strict();

export type RuleRequest = z.infer<typeof ruleSchema>;
