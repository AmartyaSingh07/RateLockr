import { useState, useEffect } from "react";
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

// =============================================================================
// useStats — Custom Hook using native state, interval polling & active flag guards
// =============================================================================

export function useStats(clientId?: string | null) {
  const [data, setData] = useState<Stats | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      try {
        const url = clientId ? `/stats?clientId=${encodeURIComponent(clientId)}` : "/stats";
        const { data: resData } = await apiClient.get<Stats>(url);
        if (active) {
          setData(resData);
          setIsLoading(false);
          setIsError(false);
        }
      } catch (err) {
        console.error("Failed to fetch stats:", err);
        if (active) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    fetchStats();

    // Poll every 2 seconds
    const intervalId = setInterval(fetchStats, 2_000);

    const handleRefetch = () => {
      fetchStats();
    };

    window.addEventListener("refetch-stats", handleRefetch);

    return () => {
      active = false;
      window.removeEventListener("refetch-stats", handleRefetch);
      clearInterval(intervalId);
    };
  }, [clientId]);

  return { data, isLoading, isError };
}
