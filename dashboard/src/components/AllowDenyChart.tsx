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
import { TriangleAlert, LineChart as LineChartIcon } from "lucide-react";
import type { Stats } from "../hooks/useStats";
import { useTheme, themeVar } from "../theme";

// =============================================================================
// Streaming Allow / Deny Throughput Chart
// =============================================================================
// Maps directly to the timeline array buffer provided by the server payload.
// SVG stroke/fill can't resolve CSS var(), so the theme tokens are resolved to
// literal colours through themeVar() and re-read whenever the theme flips.
//
// This component has no poller of its own: it renders whatever App's single
// useStats(selectedClientId) hands it. A second hook here meant a second
// interval hitting /api/stats every 2 s.
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
  isError?: boolean;
}

const CHART_HEIGHT = 300;

export function AllowDenyChart({
  stats,
  clientId,
  onClearFilter,
  isError,
}: AllowDenyChartProps) {
  const { theme } = useTheme();

  const activeStats = stats;

  const c = useMemo(
    () => ({
      grid: themeVar("--chart-grid"),
      allowed: themeVar("--chart-allowed"),
      denied: themeVar("--chart-denied"),
      axis: themeVar("--text-faint"),
      label: themeVar("--text-muted"),
      text: themeVar("--text"),
      surface: themeVar("--surface-solid"),
      border: themeVar("--border"),
    }),
    // themeVar() reads the DOM, so `theme` is the only thing that can change it.
    [theme],
  );

  // Map the timeline directly from server response
  const dataPoints: ChartDataPoint[] = useMemo(() => {
    return (activeStats?.timeline ?? []).map((point) => ({
      time: point.timestamp,
      allowed: point.allowed,
      denied: point.denied,
    }));
  }, [activeStats?.timeline]);

  return (
    <div className="glass-card p-4 sm:p-6 h-full min-w-0">
      {/* ─── Chart Header ─── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h2 className="card-title flex flex-wrap items-center gap-2">
            Request throughput
            {clientId && (
              <span
                className="badge normal-case font-normal max-w-[12rem] truncate"
                style={{
                  color: "var(--accent)",
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent-ring)",
                }}
              >
                {clientId}
              </span>
            )}
          </h2>
          <p className="card-subtitle">
            {clientId ? (
              <span className="flex items-center gap-1.5">
                Filtered view ·{" "}
                <button
                  onClick={() => onClearFilter?.()}
                  className="underline cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  Show all clients
                </button>
              </span>
            ) : (
              "Rolling 30-snapshot window · 2 s polling interval"
            )}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold font-mono">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-0.5 rounded-full"
              style={{ backgroundColor: "var(--chart-allowed)" }}
            />
            <span style={{ color: "var(--text-muted)" }}>Allowed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-0.5 rounded-full"
              style={{ backgroundColor: "var(--chart-denied)" }}
            />
            <span style={{ color: "var(--text-muted)" }}>Denied</span>
          </div>
        </div>
      </div>

      {/* ─── Plot area — fixed height so the container never collapses ─── */}
      <div
        className="w-full min-w-0 overflow-hidden"
        style={{ height: CHART_HEIGHT }}
      >
        {isError && !activeStats ? (
          <ChartMessage
            icon={TriangleAlert}
            color="var(--danger)"
            title="Can't reach the telemetry API"
            detail="Retrying every 2 seconds."
          />
        ) : dataPoints.length === 0 ? (
          <ChartMessage
            icon={LineChartIcon}
            color="var(--text-muted)"
            title="No traffic in this window"
            detail="Fire a request from the simulator to start the trace."
          />
        ) : (
          <ResponsiveContainer width="99%" height="100%">
            <LineChart
              data={dataPoints}
              margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={c.grid}
                vertical={false}
              />

              <XAxis
                dataKey="time"
                stroke={c.axis}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                // Recharts drops ticks that would collide, so narrow screens
                // thin out on their own — no breakpoint plumbing needed.
                minTickGap={48}
                className="font-mono"
              />
              <YAxis
                stroke={c.axis}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={44}
                className="font-mono"
                domain={[0, "auto"]}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: c.text,
                  padding: "8px 12px",
                }}
                labelStyle={{
                  color: c.label,
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              />

              <Line
                type="monotone"
                dataKey="allowed"
                name="Allowed"
                stroke={c.allowed}
                strokeWidth={2}
                dot={false}
                animationDuration={400}
                animationEasing="ease-out"
                activeDot={{
                  r: 4.5,
                  fill: c.allowed,
                  stroke: c.surface,
                  strokeWidth: 2,
                }}
              />

              <Line
                type="monotone"
                dataKey="denied"
                name="Denied"
                stroke={c.denied}
                strokeWidth={2}
                dot={false}
                animationDuration={400}
                animationEasing="ease-out"
                activeDot={{
                  r: 4.5,
                  fill: c.denied,
                  stroke: c.surface,
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ChartMessage({
  icon: Icon,
  color,
  title,
  detail,
}: {
  icon: typeof TriangleAlert;
  color: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
      <Icon className="w-6 h-6" style={{ color }} />
      <p className="text-sm font-medium font-mono" style={{ color }}>
        {title}
      </p>
      {detail && (
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
