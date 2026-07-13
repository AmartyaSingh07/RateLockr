import { useState, useEffect, useCallback, useRef } from "react";
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

// Minimum gap between event-triggered refetches. The TrafficSimulator emits a
// "refetch-stats" event per burst request; without coalescing, a 20-request
// burst fires dozens of concurrent /api/stats calls (each doing Redis SCANs)
// and the API times out under its own telemetry load.
const EVENT_THROTTLE_MS = 750;

// =============================================================================
// useStats — Custom Hook using native state, interval polling & active flag guards
// =============================================================================

export function useStats(clientId?: string | null) {
  const [data, setData] = useState<Stats | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const inFlightRef = useRef(false);
  const lastEventFetchRef = useRef(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    // Drop the request if one is already on the wire — the fresh result is
    // seconds away anyway, and stacking calls melts the serverless API.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const url = clientId ? `/api/stats?clientId=${encodeURIComponent(clientId)}` : "/api/stats";
      const { data: resData } = await apiClient.get<Stats>(url);
      setData(resData);
      setIsLoading(false);
      setIsError(false);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      setIsError(true);
      setIsLoading(false);
    } finally {
      inFlightRef.current = false;
    }
  }, [clientId]);

  useEffect(() => {
    fetchStats();

    // Poll every 2 seconds
    const intervalId = setInterval(fetchStats, 2_000);

    // Coalesce burst-driven refetch events: fetch at most once per
    // EVENT_THROTTLE_MS, with a trailing fetch so the final burst state
    // always lands on the chart.
    const handleRefetch = () => {
      const now = Date.now();
      const elapsed = now - lastEventFetchRef.current;

      if (elapsed >= EVENT_THROTTLE_MS) {
        lastEventFetchRef.current = now;
        fetchStats();
      } else if (!trailingTimerRef.current) {
        trailingTimerRef.current = setTimeout(() => {
          trailingTimerRef.current = null;
          lastEventFetchRef.current = Date.now();
          fetchStats();
        }, EVENT_THROTTLE_MS - elapsed);
      }
    };

    window.addEventListener("refetch-stats", handleRefetch);

    return () => {
      window.removeEventListener("refetch-stats", handleRefetch);
      clearInterval(intervalId);
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
    };
  }, [fetchStats]);

  return { data, isLoading, isError, refetch: fetchStats };
}
