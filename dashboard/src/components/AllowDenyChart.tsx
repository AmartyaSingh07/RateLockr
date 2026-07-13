import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useStats } from "../hooks/useStats";
import type { Stats } from "../hooks/useStats";

// =============================================================================
// Streaming Allow / Deny Throughput Chart
// =============================================================================
// Maps directly to the timeline array buffer provided by the server payload.
//
// Color Mapping (Google Stitch):
//   Emerald (#10b981) — allowed throughput
//   Crimson (#f43f5e) — blocked request drops
//   Surface:  #1E293B   Border:  #334155
// =============================================================================

interface ChartDataPoint {
  time: string;
  allowed: number;
  denied: number;
}

interface AllowDenyChartProps {
  stats: Stats | undefined;
  clientId: string | null;
  onClearFilter?: () => void;
}

export function AllowDenyChart({ stats, clientId, onClearFilter }: AllowDenyChartProps) {
  // useStats already listens for "refetch-stats" internally (throttled), so no
  // extra listener here — a second one just doubles the load on the API.
  const { data } = useStats(clientId);

  const activeStats = data || stats;

  // Map the timeline directly from server response
  const dataPoints: ChartDataPoint[] = useMemo(() => {
    return (activeStats?.timeline ?? []).map((point) => ({
      time: point.timestamp,
      allowed: point.allowed,
      denied: point.denied,
    }));
  }, [activeStats?.timeline]);

  return (
    <div
      className="rounded-2xl p-6 h-full transition-all duration-300 hover:shadow-lg glass-card"
    >
      {/* ─── Chart Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight uppercase flex items-center gap-2">
            Request Throughput
            {clientId && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 normal-case font-normal">
                {clientId}
              </span>
            )}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {clientId ? (
              <span className="flex items-center gap-1.5">
                Filtered view ·{" "}
                <button
                  onClick={() => onClearFilter?.()}
                  className="text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                >
                  Reset to Global
                </button>
              </span>
            ) : (
              "Rolling 30-snapshot window · 2 s polling interval"
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-0.5 rounded-full"
              style={{ backgroundColor: "#10b981" }}
            />
            <span style={{ color: "#94a3b8" }}>Allowed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-0.5 rounded-full"
              style={{ backgroundColor: "#f43f5e" }}
            />
            <span style={{ color: "#94a3b8" }}>Denied</span>
          </div>
        </div>
      </div>

      {/* ─── Recharts Line Chart ─── */}
      <div className="w-full min-w-0 overflow-hidden h-[300px] bg-transparent">
        <ResponsiveContainer width="99%" height="100%">
          <LineChart
            data={dataPoints}
            margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(51, 65, 85, 0.3)"
              vertical={false}
            />

            <XAxis
              dataKey="time"
              stroke="#475569"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
            <YAxis
              stroke="#475569"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              domain={[0, "auto"]}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#0F172A",
                border: "1px solid #334155",
                borderRadius: "12px",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "#e2e8f0",
                padding: "8px 12px",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
              }}
              labelStyle={{
                color: "#94a3b8",
                fontWeight: 600,
                marginBottom: "4px",
              }}
            />

            {/* Emerald — allowed throughput */}
            <Line
              type="monotone"
              dataKey="allowed"
              name="Allowed"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              animationDuration={400}
              animationEasing="ease-out"
              activeDot={{
                r: 4.5,
                fill: "#10b981",
                stroke: "#0F172A",
                strokeWidth: 2,
              }}
            />

            {/* Crimson — blocked request drops */}
            <Line
              type="monotone"
              dataKey="denied"
              name="Denied"
              stroke="#f43f5e"
              strokeWidth={2}
              dot={false}
              animationDuration={400}
              animationEasing="ease-out"
              activeDot={{
                r: 4.5,
                fill: "#f43f5e",
                stroke: "#0F172A",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
