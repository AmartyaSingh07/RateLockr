import { useMemo } from "react";
import { ShieldX } from "lucide-react";
import type { Stats } from "../hooks/useStats";
import { ScrambledText } from "./ScrambledText";

// =============================================================================
// Top Throttled Clients — Ranked Violation Leaderboard
// =============================================================================
// Extracts the topThrottled array (string[]) from the Stats polling payload
// and renders a compact rank list of client IDs with a scramble hover effect.
//
// Color System (Google Stitch):
//   Surface:  #1E293B   Border:  #334155
//   Row Hover: rgba(15, 23, 42, 0.5)
//   Badge:    #f43f5e on rgba(244, 63, 94, 0.1)
// =============================================================================

interface TopThrottledProps {
  stats: Stats | undefined;
}

export function TopThrottled({ stats }: TopThrottledProps) {
  const throttledClients = useMemo(() => stats?.topThrottled ?? [], [stats?.topThrottled]);

  return (
    <div
      className="rounded-2xl p-6 h-full flex flex-col transition-all duration-300 hover:shadow-lg glass-card"
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight uppercase">
            Top Throttled
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            Clients with highest denial counts
          </p>
        </div>
        <div
          className="p-1.5 rounded-lg"
          style={{
            backgroundColor: "rgba(244, 63, 94, 0.1)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
          }}
        >
          <ShieldX className="w-3.5 h-3.5" style={{ color: "#fb7185" }} />
        </div>
      </div>

      {/* ─── Ranked List ─── */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {throttledClients.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <p className="text-sm font-medium" style={{ color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
              No active violators
            </p>
          </div>
        ) : (
          throttledClients.map((clientId, index) => (
            <div
              key={clientId}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: "transparent",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.5)";
                e.currentTarget.style.borderColor = "rgba(51, 65, 85, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }}
            >
              {/* Rank + Client ID with Scramble Effect */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="text-xs font-bold w-5 text-center flex-shrink-0"
                  style={{
                    color: "#475569",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {(index + 1).toString().padStart(2, "0")}
                </span>
                <span
                  className="text-sm font-medium truncate"
                  style={{
                    color: "#e2e8f0",
                  }}
                >
                  <ScrambledText>{clientId}</ScrambledText>
                </span>
              </div>

              {/* Status Badge */}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-3 tracking-widest uppercase"
                style={{
                  color: "#f43f5e",
                  backgroundColor: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.2)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Throttled
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
