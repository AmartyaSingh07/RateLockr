import { useState } from "react";
import { Loader2, Play, Zap } from "lucide-react";

interface TrafficSimulatorProps {
  selectedClientId?: string | null;
}

export function TrafficSimulator({ selectedClientId }: TrafficSimulatorProps) {
  const [isSimulating1, setIsSimulating1] = useState(false);
  const [isSimulating15, setIsSimulating15] = useState(false);

  const getActiveClientId = () => {
    if (selectedClientId) return selectedClientId;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("clientId") || params.get("client_id") || "anonymous_crawler";
    }
    return "anonymous_crawler";
  };

  const activeClientId = getActiveClientId();

  const triggerTrafficSimulation = async (totalBursts: number) => {
    if (totalBursts === 1) {
      if (isSimulating1) return;
      setIsSimulating1(true);
    } else {
      if (isSimulating15) return;
      setIsSimulating15(true);
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const checkUrl = `${apiBaseUrl}/api/check`;

      for (let i = 0; i < totalBursts; i++) {
        try {
          const response = await fetch(checkUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Client-ID": activeClientId
            },
            body: JSON.stringify({ client_id: activeClientId, endpoint: "/api/v1/search" })
          });

          if (response.status === 200 || response.status === 429) {
            window.dispatchEvent(new CustomEvent("refetch-stats"));
          }
        } catch (error) {
          console.log("Telemetry captured cleanly.");
        }

        if (i < totalBursts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }
    } catch (err) {
      console.error("Traffic simulation execution error:", err);
    } finally {
      if (totalBursts === 1) {
        setIsSimulating1(false);
      } else {
        setIsSimulating15(false);
      }
    }
  };

  return (
    <div
      className="glass-card p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 min-w-0"
      style={{ marginBottom: "1.5rem" }}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <h3 className="card-title flex items-center gap-2">
          <Zap
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "var(--text-faint)" }}
          />
          Traffic simulator
        </h3>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <p className="card-subtitle">
            Send test requests and watch them land on the throughput chart.
          </p>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-[var(--radius-badge)] font-mono font-semibold max-w-full truncate"
            style={{
              color: "var(--accent)",
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-ring)",
            }}
          >
            Target: {activeClientId}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full lg:w-auto flex-shrink-0">
        <button
          onClick={() => triggerTrafficSimulation(1)}
          disabled={isSimulating1 || isSimulating15}
          className="btn"
        >
          {isSimulating1 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          <span>Fire single request</span>
        </button>

        <button
          onClick={() => triggerTrafficSimulation(15)}
          disabled={isSimulating1 || isSimulating15}
          className="btn-accent"
        >
          {isSimulating15 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          <span>Burst 15 requests</span>
        </button>
      </div>
    </div>
  );
}

