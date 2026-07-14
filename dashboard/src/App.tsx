import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useStats } from "./hooks/useStats";
import { useTheme } from "./theme";
import { prefersReducedMotion } from "./motion";
import { StatsCards } from "./components/StatsCards";
import { AllowDenyChart } from "./components/AllowDenyChart";
import { TopThrottled } from "./components/TopThrottled";
import { RulesTable } from "./components/RulesTable";
import { CreateRuleModal } from "./components/CreateRuleModal";
import { ScrambledText } from "./components/ScrambledText";
import { PointerGlow } from "./components/PointerGlow";
import { TrafficSimulator } from "./components/TrafficSimulator";
import {
  Shield,
  LayoutDashboard,
  ScrollText,
  BarChart3,
  Plus,
  ChevronRight,
  Menu,
  Sun,
  Moon,
} from "lucide-react";

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
// Rail — the nav body, shared by the persistent desktop rail and the drawer
// =============================================================================

function Rail({
  activeNav,
  onSelect,
}: {
  activeNav: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div
        className="px-6 py-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="p-2 rounded-xl flex-shrink-0"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-ring)",
              boxShadow: "var(--glow-accent)",
            }}
          >
            <Shield className="w-5 h-5" style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0">
            <h1
              className="text-sm font-bold tracking-[0.2em] uppercase"
              style={{ color: "var(--text)" }}
            >
              <ScrambledText scrambleSpeed={4}>RATELOCKR</ScrambledText>
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: "var(--success)" }}
              />
              <span
                className="text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                System Online
              </span>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p
          className="px-4 mb-3 text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--text-faint)" }}
        >
          Navigation
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "nav-item-active w-full" : "nav-item w-full"}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left min-w-0">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <p
          className="text-[9px] font-semibold uppercase tracking-wider font-mono"
          style={{ color: "var(--text-faint)" }}
        >
          v2.0.0 · Stable
        </p>
      </div>
    </>
  );
}

// =============================================================================
// NavDrawer — off-canvas rail below lg.
// Native <dialog>.showModal() supplies the focus trap, Escape-to-close and
// background inerting, so there is no hand-rolled trap to keep correct.
// =============================================================================

function NavDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The drawer only exists below lg; going wide with it open would strand it.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const sync = () => wide.matches && onClose();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="nav-drawer flex-col lg:hidden"
      aria-label="Main navigation"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
    >
      <div className="flex flex-col h-full">{children}</div>
    </dialog>
  );
}

// =============================================================================
// Dashboard Shell
//   >= lg: persistent left rail + content offset by --nav-width
//   <  lg: rail collapses into the off-canvas drawer, opened from the top bar
// =============================================================================

function Dashboard() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { data: stats, isLoading, isError } = useStats(selectedClientId);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const selectNav = (id: string) => {
    setActiveNav(id);
    setIsDrawerOpen(false);
  };

  // Content transition on mount and on nav change. Keyed off activeNav only —
  // the 2 s stats poll re-renders this subtree constantly and must not animate.
  const mainRef = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion() || !mainRef.current) return;
      gsap.fromTo(
        mainRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      );
    },
    { dependencies: [activeNav] },
  );

  return (
    <div className="app-canvas min-h-dvh relative overflow-x-hidden selection:bg-emerald-500/30">
      <PointerGlow />

      {/* ─── Persistent rail (lg and up) ─── */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 flex-col backdrop-blur-xl"
        style={{
          width: "var(--nav-width)",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <Rail activeNav={activeNav} onSelect={selectNav} />
      </aside>

      {/* ─── Off-canvas rail (below lg) ─── */}
      <NavDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <Rail activeNav={activeNav} onSelect={selectNav} />
      </NavDrawer>

      <div className="min-h-dvh lg:pl-[var(--nav-width)]">
        {/* ─── Sticky Top Bar ─── */}
        <header
          className="sticky top-0 z-30 backdrop-blur-xl"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="shell-gutter py-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="btn-icon lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h2
                className="text-base font-bold tracking-tight font-mono truncate"
                style={{ color: "var(--text)" }}
              >
                <ScrambledText scrambleSpeed={3}>
                  {NAV_ITEMS.find((n) => n.id === activeNav)?.label ??
                    "Dashboard"}
                </ScrambledText>
              </h2>
              <p
                className="text-[10px] mt-0.5 truncate"
                style={{ color: "var(--text-faint)" }}
              >
                Real-time rate limiting analytics &amp; policy management
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={toggleTheme}
                className="btn-icon"
                aria-label={
                  theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
                }
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn-accent"
              >
                <Plus className="w-3.5 h-3.5" />
                New Rule
              </button>

              {/* Status, not an action — the dot carries the state so the
                  accent stays reserved for New Rule. */}
              <div
                className="status-pill"
                style={
                  isError
                    ? {
                        color: "var(--danger)",
                        borderColor:
                          "color-mix(in srgb, var(--danger) 30%, transparent)",
                      }
                    : undefined
                }
              >
                <span
                  className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                  style={{
                    backgroundColor: isError
                      ? "var(--danger)"
                      : "var(--success)",
                  }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider font-mono">
                  {isError ? "Disconnected" : "Live Telemetry"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ─── Dashboard Content Grid ─── */}
        <main
          ref={mainRef}
          className="shell-gutter min-w-0 py-6 relative z-10 space-y-6"
        >
          {isLoading && !stats ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500/20 border-t-emerald-500" />
            </div>
          ) : (
            <>
              {/* ── Row 1: Metric Deck ── */}
              <StatsCards stats={stats} />

              {/* ── Row 2: Chart (2/3) + Top Throttled (1/3) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 min-w-0">
                  <TrafficSimulator selectedClientId={selectedClientId} />
                  <AllowDenyChart
                    stats={stats}
                    clientId={selectedClientId}
                    onClearFilter={() => setSelectedClientId(null)}
                    isError={isError}
                  />
                </div>
                {/* self-start: the list hugs its content instead of stretching
                    to the chart column and leaving a void under it. */}
                <div className="lg:col-span-1 min-w-0 self-start">
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
// App Root — theme is provided in main.tsx
// =============================================================================

export default function App() {
  return <Dashboard />;
}
