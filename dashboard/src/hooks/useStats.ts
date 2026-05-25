import { useQuery, keepPreviousData } from "@tanstack/react-query";
import apiClient from "../api/client";

// =============================================================================
// Stats Response Shape — Frontend Interface (matches camelCase backend stats payload)
// =============================================================================

export interface Stats {
  totalAllowed: number;
  totalDenied: number;
  activeRules: number;
  topThrottled: string[];
  timeline: Array<{ timestamp: string; allowed: number; denied: number }>;
}

async function fetchStats(clientId?: string | null): Promise<Stats> {
  const url = clientId ? `/stats?clientId=${encodeURIComponent(clientId)}` : "/stats";
  const { data } = await apiClient.get<Stats>(url);
  return data;
}

/**
 * Custom React Query hook that polls the backend's GET /stats endpoint
 * every 2 seconds to feed the live telemetry cards and streaming chart.
 * Supports optional filtering by client ID.
 */
export function useStats(clientId?: string | null) {
  return useQuery<Stats>({
    queryKey: ["stats", clientId],
    queryFn: () => fetchStats(clientId),
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
}
