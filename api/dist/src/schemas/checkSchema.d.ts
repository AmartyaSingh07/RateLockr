import { z } from "zod";
export declare const checkSchema: z.ZodObject<{
    client_id: z.ZodString;
    endpoint: z.ZodString;
    algorithm: z.ZodOptional<z.ZodEnum<["token_bucket", "sliding_window", "fixed_window"]>>;
}, "strict", z.ZodTypeAny, {
    client_id: string;
    endpoint: string;
    algorithm?: "token_bucket" | "sliding_window" | "fixed_window" | undefined;
}, {
    client_id: string;
    endpoint: string;
    algorithm?: "token_bucket" | "sliding_window" | "fixed_window" | undefined;
}>;
export type CheckRequest = z.infer<typeof checkSchema>;
//# sourceMappingURL=checkSchema.d.ts.map