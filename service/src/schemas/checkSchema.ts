import { z } from "zod";

export const checkSchema = z.object({
  client_id: z.string().max(128),
  endpoint: z.string().max(256),
  algorithm: z.enum(["token_bucket", "sliding_window", "fixed_window"]).optional(),
}).strict();

export type CheckRequest = z.infer<typeof checkSchema>;
