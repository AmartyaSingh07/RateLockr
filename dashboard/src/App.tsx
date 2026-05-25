import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStats } from "./hooks/useStats";
import { StatsCards } from "./components/StatsCards";
import { AllowDenyChart } from "./components/AllowDenyChart";
import { TopThrottled } from "./components/TopThrottled";
import { RulesTable } from "./components/RulesTable";
import { CreateRuleModal } from "./components/CreateRuleModal";
import { ScrambledText } from "./components/ScrambledText";
import SplashCursor from "./components/SplashCursor";
import {
  Activity,
  Shield,
  LayoutDashboard,
  ScrollText,
  BarChart3,
  Plus,
  ChevronRight,
} from "lucide-react";

// =============================================================================
// Query Client — Global React Query Configuration
// =============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1_000,
    },
  },
});

// =============================================================================
// Navigation Menu Configuration
// =============================================================================

interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "policies", label: "Policy Manager", icon: ScrollText },
  { id: "metrics", label: "Metrics Analyzer", icon: BarChart3 },
];

// =============================================================================
// Dashboard Shell — 2-Column Obsidian Glass Layout
// =============================================================================
// Layout Architecture:
//   Fixed Left Nav Drawer (260px) + Scrollable Main Viewport (flex-1)
//   Canvas: Radial vignette gradient from-slate-900 via-zinc-950 to-black
//   Surface: bg-zinc-900/40 backdrop-blur-md (obsidian glass)
// =============================================================================

function Dashboard() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { data: stats, isLoading, isError } = useStats(selectedClientId);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="min-h-screen text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-300 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-zinc-950 to-black">
      {/* Global Interactive Fluid Simulation Cursor Trail */}
      <SplashCursor
        RAINBOW_MODE={false}
        COLOR="#10b981"
        DENSITY_DISSIPATION={4.5}
        VELOCITY_DISSIPATION={2.5}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Fixed Left Navigation Drawer                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-40 flex flex-col"
        style={{
          width: "var(--nav-width)",
          background: "rgba(14, 14, 24, 0.65)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* ─── Brand Block ─── */}
        <div
          className="px-6 py-6"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                boxShadow: "0 0 20px rgba(16, 185, 129, 0.1)",
              }}
            >
              <Shield className="w-5 h-5" style={{ color: "#10b981" }} />
            </div>
            <div>
              <h1
                className="text-sm font-bold tracking-[0.2em] uppercase"
                style={{ color: "#e4e4e7" }}
              >
                <ScrambledText scrambleSpeed={4}>RATELOCKR</ScrambledText>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{
                    backgroundColor: "#10b981",
                    boxShadow: "0 0 8px rgba(16, 185, 129, 0.5)",
                  }}
                />
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: "#52525b" }}
                >
                  System Online
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Nav Menu ─── */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <p
            className="px-4 mb-3 text-[9px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#3f3f46" }}
          >
            Navigation
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={isActive ? "nav-item-active w-full" : "nav-item w-full"}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && (
                  <ChevronRight
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: "#10b981" }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* ─── Footer Version Tag ─── */}
        <div
          className="px-6 py-4"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}
        >
          <p
            className="text-[9px] font-semibold uppercase tracking-wider"
            style={{
              color: "#27272a",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            v2.0.0 · Stable
          </p>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Main Viewport (offset by nav width)                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="min-h-screen" style={{ marginLeft: "var(--nav-width)" }}>
        {/* ─── Sticky Top Bar ─── */}
        <header
          className="sticky top-0 z-30 backdrop-blur-xl"
          style={{
            background: "rgba(14, 14, 24, 0.55)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
          }}
        >
          <div className="px-8 py-4 flex items-center justify-between">
            {/* Page Title */}
            <div>
              <h2
                className="text-base font-bold text-zinc-100 tracking-tight"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                <ScrambledText scrambleSpeed={3}>
                  {NAV_ITEMS.find((n) => n.id === activeNav)?.label ??
                    "Dashboard"}
                </ScrambledText>
              </h2>
              <p className="text-[10px] mt-0.5" style={{ color: "#3f3f46" }}>
                Real-time rate limiting analytics & policy management
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* + New Rule Button */}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  color: "#10b981",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "rgba(16, 185, 129, 0.2)";
                  e.currentTarget.style.borderColor =
                    "rgba(16, 185, 129, 0.35)";
                  e.currentTarget.style.boxShadow =
                    "0 0 20px rgba(16, 185, 129, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "rgba(16, 185, 129, 0.12)";
                  e.currentTarget.style.borderColor =
                    "rgba(16, 185, 129, 0.2)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                New Rule
              </button>

              {/* Telemetry Status Glow Indicator */}
              <div
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl"
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div
                  className="w-2 h-2 rounded-full animate-pulse transition-all duration-300"
                  style={{
                    backgroundColor: isError ? "#f43f5e" : "#10b981",
                    boxShadow: isError
                      ? "0 0 10px 2px rgba(244, 63, 94, 0.4)"
                      : "0 0 10px 2px rgba(16, 185, 129, 0.4)",
                  }}
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: isError ? "#fb7185" : "#34d399",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {isError ? "Disconnected" : "Live Telemetry"}
                </span>
                <Activity
                  className="w-3.5 h-3.5"
                  style={{ color: isError ? "#fb7185" : "#34d399" }}
                />
              </div>
            </div>
          </div>
        </header>

        {/* ─── Dashboard Content Grid ─── */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-6 bg-transparent relative z-10 space-y-6">
          {isLoading && !stats ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500/20 border-t-emerald-500" />
            </div>
          ) : (
            <>
              {/* ── Row 1: 4-Column Metric Deck ── */}
              <StatsCards stats={stats} />

              {/* ── Row 2: Chart (2/3) + Top Throttled (1/3) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <AllowDenyChart
                    stats={stats}
                    clientId={selectedClientId}
                    onClearFilter={() => setSelectedClientId(null)}
                  />
                </div>
                <div className="lg:col-span-1">
                  <TopThrottled stats={stats} />
                </div>
              </div>

              {/* ── Row 3: Full-Width Rules Table ── */}
              <RulesTable
                selectedClientId={selectedClientId}
                onSelectClient={setSelectedClientId}
              />
            </>
          )}
        </main>
      </div>

      {/* ─── Create Rule Slide-Over Modal ─── */}
      <CreateRuleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}

// =============================================================================
// App Root — QueryClientProvider wraps the entire render tree
// =============================================================================

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
