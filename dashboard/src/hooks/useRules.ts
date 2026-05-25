import { useState, useEffect } from "react";
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
// useRules — Custom Hook using native state & interval polling
// =============================================================================

export function useRules() {
  const [data, setData] = useState<Rule[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchRules = async () => {
      try {
        const { data: resData } = await apiClient.get<RulesResponse>("/rules");
        if (active) {
          setData(resData.rules ?? []);
          setIsLoading(false);
          setIsError(false);
        }
      } catch (err) {
        console.error("Failed to fetch rules:", err);
        if (active) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    fetchRules();

    // Polling every 5 seconds
    const intervalId = setInterval(fetchRules, 5_000);

    const handleRefetch = () => {
      fetchRules();
    };

    window.addEventListener("refetch-rules", handleRefetch);

    return () => {
      active = false;
      window.removeEventListener("refetch-rules", handleRefetch);
      clearInterval(intervalId);
    };
  }, []);

  return { data, isLoading, isError };
}

// =============================================================================
// useCreateRule — Custom Hook for POST /rules with event-based invalidation
// =============================================================================

export function useCreateRule() {
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);

  const mutate = async (rule: Rule, options?: { onSuccess?: () => void }) => {
    setIsPending(true);
    setIsError(false);
    try {
      await apiClient.post("/rules", rule);
      window.dispatchEvent(new Event("refetch-rules"));
      window.dispatchEvent(new Event("refetch-stats"));
      options?.onSuccess?.();
    } catch (err) {
      console.error("Failed to create rule:", err);
      setIsError(true);
    } finally {
      setIsPending(false);
    }
  };

  return { mutate, isPending, isError };
}

// =============================================================================
// useDeleteRule — Custom Hook for DELETE /rules with event-based invalidation
// =============================================================================

export function useDeleteRule() {
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);

  const mutate = async (
    { client_id, endpoint }: { client_id: string; endpoint: string },
    options?: { onSettled?: () => void }
  ) => {
    setIsPending(true);
    setIsError(false);
    try {
      await apiClient.delete(
        `/rules/${encodeURIComponent(client_id)}/${encodeURIComponent(endpoint)}`
      );
      window.dispatchEvent(new Event("refetch-rules"));
      window.dispatchEvent(new Event("refetch-stats"));
    } catch (err) {
      console.error("Failed to delete rule:", err);
      setIsError(true);
    } finally {
      setIsPending(false);
      options?.onSettled?.();
    }
  };

  return { mutate, isPending, isError };
}
