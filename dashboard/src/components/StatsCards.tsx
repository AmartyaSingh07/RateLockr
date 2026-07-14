import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
  TriangleAlert,
} from "lucide-react";
import type { Stats } from "../hooks/useStats";
import { prefersReducedMotion } from "../motion";

// =============================================================================
// Stats Cards — Operational Health Metric Deck
// =============================================================================
// 1 col (mobile) → 2 (sm) → 4 (lg). The numbers are the loudest thing on the
// page: labels are muted micro-caps, and only a card that is actually alerting
// carries colour beyond its value.
//
// Motion: the values count up once, when the first payload lands. Stats poll
// every 2 s — re-running a count-up on each poll would leave the deck in
// permanent motion, so every later change snaps straight to the new number.
// =============================================================================

// Tweens a numeric proxy on the first real payload only; snaps thereafter.
//
// The "already counted" flag is only set on completion, not on start. Under
// StrictMode the effect runs twice on mount and the first tween is killed by
// the cleanup — flagging on start would leave the flag set with no tween left
// to run, and the count-up would never be seen.
function useCountUp(value: number, ready: boolean): number {
  // Start at zero, not at `value`: the first payload is usually already there
  // when this mounts, and seeding with it flashes the final number for a frame
  // before the tween resets to zero.
  const [display, setDisplay] = useState(() =>
    prefersReducedMotion() ? value : 0,
  );
  const hasCountedUp = useRef(false);

  useEffect(() => {
    if (!ready) return;

    if (hasCountedUp.current || prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    const proxy = { v: 0 };
    const tween = gsap.to(proxy, {
      v: value,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => setDisplay(proxy.v),
      onComplete: () => {
        hasCountedUp.current = true;
        setDisplay(value);
      },
    });

    return () => {
      tween.kill();
    };
  }, [value, ready]);

  // Before the first payload there is nothing to count up to — show the
  // resting value (e.g. 100% success) rather than a misleading 0.
  return ready ? display : value;
}

interface StatsCardsProps {
  stats: Stats | undefined;
}

interface CardConfig {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: typeof Activity;
  subtitle: string;
  accent: string;
  valueColor: string;
  warn: boolean;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const totalAllowed = stats?.totalAllowed ?? 0;
  const totalDenied = stats?.totalDenied ?? 0;
  const total = totalAllowed + totalDenied;
  const successRate = total > 0 ? (totalAllowed / total) * 100 : 100;
  const throttledRate = total > 0 ? (totalDenied / total) * 100 : 0;
  const activeRules = stats?.activeRules ?? 0;
  const throttleWarning = throttledRate > 10;
  const idle = total === 0;

  const integer = (n: number) => Math.round(n).toLocaleString();
  const percent = (n: number) => `${n.toFixed(1)}%`;

  const cards: CardConfig[] = [
    {
      label: "Total Load",
      value: total,
      format: integer,
      icon: Activity,
      accent: "var(--info)",
      valueColor: "var(--text)",
      subtitle: idle ? "Waiting for traffic" : "Aggregate evaluations",
      warn: false,
    },
    {
      label: "Success Rate",
      value: successRate,
      format: percent,
      icon: ShieldCheck,
      accent: "var(--success)",
      valueColor: "var(--success)",
      subtitle: idle
        ? "Nothing allowed yet"
        : `${totalAllowed.toLocaleString()} allowed`,
      warn: false,
    },
    {
      label: "Throttled Rate",
      value: throttledRate,
      format: percent,
      icon: ShieldAlert,
      accent: "var(--danger)",
      valueColor: throttleWarning ? "var(--danger)" : "var(--text)",
      subtitle: throttleWarning
        ? `${totalDenied.toLocaleString()} denied — over the 10% threshold`
        : idle
          ? "Nothing throttled yet"
          : `${totalDenied.toLocaleString()} denied`,
      warn: throttleWarning,
    },
    {
      label: "Active Guardrails",
      value: activeRules,
      format: integer,
      icon: BookOpen,
      accent: "var(--warn)",
      valueColor: "var(--text)",
      subtitle: activeRules === 0 ? "No policies yet" : "Provisioned policies",
      warn: false,
    },
  ];

  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".stat-card", {
        y: 12,
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.06,
      });
    },
    { scope: gridRef },
  );

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {cards.map((card) => (
        <StatCard key={card.label} card={card} ready={!!stats} />
      ))}
    </div>
  );
}

function StatCard({ card, ready }: { card: CardConfig; ready: boolean }) {
  const Icon = card.icon;
  const shown = useCountUp(card.value, ready);

  return (
    <div
      className="stat-card glass-card relative overflow-hidden p-5 min-w-0"
      style={
        card.warn
          ? { borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)" }
          : undefined
      }
    >
      {/* The only card that glows is the one that's actually alerting. */}
      {card.warn && (
        <div
          className="absolute -top-12 -right-12 w-28 h-28 rounded-full blur-3xl pointer-events-none"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 22%, transparent)",
          }}
        />
      )}

      <div className="relative z-10 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="micro-label truncate">{card.label}</span>
          <Icon
            className="w-4 h-4 flex-shrink-0"
            style={{ color: card.warn ? "var(--danger)" : card.accent }}
          />
        </div>

        <div
          className="text-[2.125rem] font-bold tracking-tight leading-none mb-2 font-mono"
          style={{
            color: card.valueColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {card.format(shown)}
        </div>

        <p
          className="text-xs font-medium flex items-center gap-1.5 min-w-0"
          style={{ color: card.warn ? "var(--warn)" : "var(--text-muted)" }}
        >
          {card.warn && <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="truncate">{card.subtitle}</span>
        </p>
      </div>
    </div>
  );
}
