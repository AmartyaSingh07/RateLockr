import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
} from "lucide-react";
import type { Stats } from "../hooks/useStats";
import StarBorder from "./StarBorder";

// =============================================================================
// Stats Cards — 4-Column Operational Health Metric Deck
// =============================================================================
// Color System (Obsidian Glass):
//   Surface:  bg-zinc-900/40   Border:  border-white/5
//   Success:  #10b981   Throttle: #f43f5e
//   Neutral:  #6366f1   Guardrail: #f59e0b
// =============================================================================

interface StatsCardsProps {
  stats: Stats | undefined;
}

interface CardConfig {
  label: string;
  value: string;
  icon: typeof Activity;
  subtitle: string;
  alert: boolean;
  glowColor: string;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  subtitleColor: string;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const totalAllowed = stats?.totalAllowed ?? 0;
  const totalDenied = stats?.totalDenied ?? 0;
  const total = totalAllowed + totalDenied;
  const successRate = total > 0 ? (totalAllowed / total) * 100 : 100;
  const throttledRate = total > 0 ? (totalDenied / total) * 100 : 0;
  const activeRules = stats?.activeRules ?? 0;
  const throttleWarning = throttledRate > 10;

  const cards: CardConfig[] = [
    {
      label: "Total Load",
      value: total.toLocaleString(),
      icon: Activity,
      glowColor: "rgba(99, 102, 241, 0.12)",
      iconBg: "rgba(99, 102, 241, 0.15)",
      iconColor: "#818cf8",
      valueColor: "#f1f5f9",
      subtitle: "Aggregate evaluations",
      subtitleColor: "#64748b",
      alert: false,
    },
    {
      label: "Success Rate",
      value: `${successRate.toFixed(1)}%`,
      icon: ShieldCheck,
      glowColor: "rgba(16, 185, 129, 0.12)",
      iconBg: "rgba(16, 185, 129, 0.15)",
      iconColor: "#34d399",
      valueColor: "#10b981",
      subtitle: `${totalAllowed.toLocaleString()} allowed`,
      subtitleColor: "#64748b",
      alert: false,
    },
    {
      label: "Throttled Rate",
      value: `${throttledRate.toFixed(1)}%`,
      icon: ShieldAlert,
      glowColor: throttleWarning ? "rgba(244, 63, 94, 0.2)" : "rgba(244, 63, 94, 0.12)",
      iconBg: "rgba(244, 63, 94, 0.15)",
      iconColor: "#fb7185",
      valueColor: "#f43f5e",
      subtitle: throttleWarning
        ? `⚠ ${totalDenied.toLocaleString()} denied — above 10% threshold`
        : `${totalDenied.toLocaleString()} denied`,
      subtitleColor: throttleWarning ? "#f43f5e" : "#64748b",
      alert: throttleWarning,
    },
    {
      label: "Active Guardrails",
      value: activeRules.toLocaleString(),
      icon: BookOpen,
      glowColor: "rgba(245, 158, 11, 0.12)",
      iconBg: "rgba(245, 158, 11, 0.15)",
      iconColor: "#fbbf24",
      valueColor: "#f59e0b",
      subtitle: "Provisioned policies",
      subtitleColor: "#64748b",
      alert: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <StarBorder
            key={card.label}
            as="div"
            color={card.alert ? "#f43f5e" : card.iconColor}
            speed="6s"
            thickness={2}
            className="w-full transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30"
          >
            {/* Obsidian glass inner surface */}
            <div className="absolute inset-0 rounded-[20px] bg-zinc-900/40 backdrop-blur-md border border-white/5" style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.5)' }} />
            {/* Ambient corner glow */}
            <div
              className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-3xl transition-opacity duration-300"
              style={{ backgroundColor: card.glowColor }}
            />

            <div className="relative z-10 text-left">
              {/* Label + Icon */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {card.label}
                </span>
                <div
                  className="p-1.5 rounded-lg border"
                  style={{
                    backgroundColor: card.iconBg,
                    borderColor: "rgba(255, 255, 255, 0.05)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: card.iconColor }} />
                </div>
              </div>

              {/* Value with JetBrains Mono */}
              <div
                className="text-3xl font-bold tracking-tight leading-none mb-1.5"
                style={{
                  color: card.valueColor,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {card.value}
              </div>

              {/* Subtitle */}
              <p
                className="text-xs font-medium"
                style={{ color: card.subtitleColor }}
              >
                {card.subtitle}
              </p>
            </div>
          </StarBorder>
        );
      })}
    </div>
  );
}
