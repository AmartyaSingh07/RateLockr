import { z } from "zod";
export declare const ruleSchema: z.ZodObject<{
    client_id: z.ZodString;
    endpoint: z.ZodString;
    limit: z.ZodNumber;
    window_seconds: z.ZodNumber;
    algorithm: z.ZodEnum<["token_bucket", "sliding_window", "fixed_window"]>;
}, "strict", z.ZodTypeAny, {
    client_id: string;
    endpoint: string;
    algorithm: "token_bucket" | "sliding_window" | "fixed_window";
    limit: number;
    window_seconds: number;
}, {
    client_id: string;
    endpoint: string;
    algorithm: "token_bucket" | "sliding_window" | "fixed_window";
    limit: number;
    window_seconds: number;
}>;
export type RuleRequest = z.infer<typeof ruleSchema>;
//# sourceMappingURL=ruleSchema.d.ts.map