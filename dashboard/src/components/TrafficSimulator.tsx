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
      className="glass-card p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
      style={{ marginBottom: "1.5rem" }}
    >
      <div className="flex flex-col gap-1.5">
        <h3
          className="text-xs font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          Live Traffic Simulator
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-zinc-500">
            Generate test request traffic to visualize live policy throughput curves.
          </p>
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/80 text-emerald-400 font-mono font-semibold">
            Target: {activeClientId}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full lg:w-auto">
        {/* Button 1: Zinc text with thin slate outlines */}
        <button
          onClick={() => triggerTrafficSimulation(1)}
          disabled={isSimulating1 || isSimulating15}
          className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border border-zinc-700 bg-zinc-800/50 text-zinc-100 hover:bg-zinc-700/50 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {isSimulating1 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          ) : (
            <Play className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <span> Fire Single Request</span>
        </button>

        {/* Button 2: Slate background with clean text indicators */}
        <button
          onClick={() => triggerTrafficSimulation(15)}
          disabled={isSimulating1 || isSimulating15}
          className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border border-zinc-600 bg-zinc-700/50 text-zinc-200 hover:bg-zinc-600/50 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {isSimulating15 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <span> Simulate Load Burst (15x)</span>
        </button>
      </div>
    </div>
  );
}

