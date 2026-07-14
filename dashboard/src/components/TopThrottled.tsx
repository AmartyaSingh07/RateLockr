import { useMemo } from "react";
import { ShieldX, ShieldCheck } from "lucide-react";
import type { Stats } from "../hooks/useStats";
import { ScrambledText } from "./ScrambledText";

// =============================================================================
// Top Throttled Clients — Ranked Violation Leaderboard
// =============================================================================
// Reads the topThrottled array (string[]) from the Stats polling payload.
// =============================================================================

interface TopThrottledProps {
  stats: Stats | undefined;
}

export function TopThrottled({ stats }: TopThrottledProps) {
  const throttledClients = useMemo(
    () => stats?.topThrottled ?? [],
    [stats?.topThrottled],
  );

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0 flex flex-col">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="card-title">Top throttled</h2>
          <p className="card-subtitle">Clients with the most denials</p>
        </div>
        <ShieldX
          className="w-4 h-4 flex-shrink-0 mt-0.5"
          style={{ color: "var(--text-faint)" }}
        />
      </div>

      {/* ─── Ranked List ─── */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 min-w-0">
        {throttledClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[200px] text-center px-4">
            <ShieldCheck
              className="w-6 h-6"
              style={{ color: "var(--success)" }}
            />
            <p
              className="text-sm font-medium font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              Everyone's within limits
            </p>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Clients appear here once they start getting denied.
            </p>
          </div>
        ) : (
          throttledClients.map((clientId, index) => (
            /* No per-row "Throttled" badge — the card is titled Top throttled;
               repeating it on every row is noise. Rank carries the ordering. */
            <div
              key={clientId}
              className="flex items-center gap-3 px-3 py-2.5 border border-transparent transition-colors duration-200 hover:bg-[var(--surface-2)] hover:border-[var(--border)]"
              style={{ borderRadius: "var(--radius-control)" }}
            >
              <span
                className="text-xs font-bold w-5 text-center flex-shrink-0 font-mono"
                style={{ color: "var(--text-faint)" }}
              >
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span
                className="text-sm font-medium truncate min-w-0 flex-1"
                style={{ color: "var(--text)" }}
              >
                <ScrambledText>{clientId}</ScrambledText>
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "var(--danger)" }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
