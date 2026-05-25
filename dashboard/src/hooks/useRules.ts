import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";

// =============================================================================
// Rule Interface — matches the Zod ruleSchema on the backend
// =============================================================================

export interface Rule {
  client_id: string;
  endpoint: string;
  limit: number;
  window_seconds: number;
  algorithm: "token_bucket" | "sliding_window" | "fixed_window";
}

interface RulesResponse {
  rules: Rule[];
}

// =============================================================================
// useRules — Polls GET /rules every 5 seconds for the admin rules table
// =============================================================================

async function fetchRules(): Promise<Rule[]> {
  const { data } = await apiClient.get<RulesResponse>("/rules");
  return data.rules ?? [];
}

export function useRules() {
  return useQuery<Rule[]>({
    queryKey: ["rules"],
    queryFn: fetchRules,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

// =============================================================================
// useCreateRule — POST /rules mutation with auto-invalidation
// =============================================================================

export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Rule) => {
      const { data } = await apiClient.post("/rules", rule);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// =============================================================================
// useDeleteRule — DELETE /rules/:client_id/:endpoint with auto-invalidation
// =============================================================================

export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      client_id,
      endpoint,
    }: {
      client_id: string;
      endpoint: string;
    }) => {
      const { data } = await apiClient.delete(
        `/rules/${encodeURIComponent(client_id)}/${encodeURIComponent(endpoint)}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
