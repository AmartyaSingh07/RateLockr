import { useState, useMemo } from "react";
import { Trash2, Loader2, Database, Search, TriangleAlert } from "lucide-react";
import { useRules, useDeleteRule } from "../hooks/useRules";
import type { Rule } from "../hooks/useRules";
import { ScrambledText } from "./ScrambledText";

// =============================================================================
// RulesTable — Policy datagrid
//   < md: one stacked card per rule
//   >= md: a table that scrolls horizontally with the client column pinned
// =============================================================================

const ALGORITHM_LABELS: Record<Rule["algorithm"], { label: string; color: string }> = {
  token_bucket: { label: "Token Bucket", color: "var(--success)" },
  sliding_window: { label: "Sliding Window", color: "var(--info)" },
  fixed_window: { label: "Fixed Window", color: "var(--warn)" },
};

function formatWindow(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(0)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
  return `${seconds}s`;
}

function AlgorithmBadge({ algorithm }: { algorithm: Rule["algorithm"] }) {
  const algo = ALGORITHM_LABELS[algorithm];
  return (
    <span
      className="badge"
      style={{
        color: algo.color,
        backgroundColor: `color-mix(in srgb, ${algo.color} 10%, transparent)`,
      }}
    >
      {algo.label}
    </span>
  );
}

// Destructive, but not the thing the eye should land on: neutral until you
// reach for it.
const DELETE_BUTTON_CLASS =
  "btn-icon group bg-transparent border-transparent hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]";

const DELETE_ICON_CLASS =
  "w-4 h-4 text-[color:var(--text-faint)] group-hover:text-[color:var(--danger)] group-focus-visible:text-[color:var(--danger)] transition-colors duration-200";

interface RulesTableProps {
  selectedClientId: string | null;
  onSelectClient: (clientId: string | null) => void;
}

export function RulesTable({ selectedClientId, onSelectClient }: RulesTableProps) {
  const { data: rules, isLoading, isError } = useRules();
  const deleteRule = useDeleteRule();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const handleDelete = (rule: Rule) => {
    const key = `${rule.client_id}:${rule.endpoint}`;
    setPendingDelete(key);
    deleteRule.mutate(
      { client_id: rule.client_id, endpoint: rule.endpoint },
      {
        onSettled: () => setPendingDelete(null),
      }
    );
  };

  const filteredRules = useMemo(() => {
    return (rules ?? []).filter((rule) => {
      if (!searchFilter) return true;
      const q = searchFilter.toLowerCase();
      return (
        rule.client_id.toLowerCase().includes(q) ||
        rule.endpoint.toLowerCase().includes(q) ||
        rule.algorithm.toLowerCase().includes(q)
      );
    });
  }, [rules, searchFilter]);

  // Selecting a rule filters the dashboard by its client; selecting it again clears.
  const toggleClient = (clientId: string) =>
    onSelectClient(selectedClientId === clientId ? null : clientId);

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex flex-col items-center justify-center gap-2 h-48">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            Loading rules…
          </p>
        </div>
      </div>
    );
  }

  // ─── Fetch failed ───
  if (isError && !rules) {
    return (
      <div className="glass-card p-6">
        <div className="flex flex-col items-center justify-center gap-2 h-48 text-center px-4">
          <TriangleAlert className="w-6 h-6" style={{ color: "var(--danger)" }} />
          <p
            className="text-sm font-medium font-mono"
            style={{ color: "var(--danger)" }}
          >
            Can't load your rules
          </p>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            The API isn't responding. Retrying every 5 seconds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="card-title">
            <ScrambledText scrambleSpeed={3}>Rate limiting rules</ScrambledText>
          </h2>
          <p className="card-subtitle">
            {filteredRules.length} rule{filteredRules.length !== 1 ? "s" : ""} active
          </p>
        </div>

        {/* Search Filter */}
        <div className="relative w-full sm:w-56 flex-shrink-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "var(--text-faint)" }}
          />
          <label className="sr-only" htmlFor="rules-filter">
            Filter rules
          </label>
          <input
            id="rules-filter"
            type="text"
            placeholder="Filter rules…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="obsidian-input pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {filteredRules.length === 0 ? (
        /* ─── Empty ─── */
        <div className="py-16 text-center flex flex-col items-center gap-2 px-4">
          <Database className="w-8 h-8" style={{ color: "var(--text-faint)" }} />
          <p
            className="text-sm font-medium font-mono"
            style={{ color: "var(--text-muted)" }}
          >
            {searchFilter ? "No rules match that filter" : "No rules yet"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            {searchFilter
              ? "Try a different client, endpoint, or algorithm."
              : "Create your first policy with New Rule."}
          </p>
        </div>
      ) : (
        <>
          {/* ═══ Mobile: one card per rule (< md) ═══ */}
          <div className="md:hidden space-y-3">
            {filteredRules.map((rule) => {
              const deleteKey = `${rule.client_id}:${rule.endpoint}`;
              const isDeleting = pendingDelete === deleteKey;
              const isSelected = selectedClientId === rule.client_id;

              return (
                <div
                  key={deleteKey}
                  className="p-4 border transition-colors duration-200"
                  style={{
                    borderRadius: "var(--radius-control)",
                    background: isSelected
                      ? "var(--accent-soft)"
                      : "var(--surface-2)",
                    borderColor: isSelected
                      ? "var(--accent-ring)"
                      : "var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => toggleClient(rule.client_id)}
                      aria-pressed={isSelected}
                      className="min-w-0 flex-1 min-h-[44px] flex flex-col justify-center text-left"
                    >
                      <span
                        className="block text-sm font-semibold font-mono truncate"
                        style={{
                          color: isSelected ? "var(--accent)" : "var(--text)",
                        }}
                      >
                        {rule.client_id}
                      </span>
                      <span
                        className="block text-xs font-mono truncate mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {rule.endpoint}
                      </span>
                    </button>

                    <button
                      onClick={() => handleDelete(rule)}
                      disabled={isDeleting}
                      aria-label={`Delete rule for ${rule.client_id} on ${rule.endpoint}`}
                      className={`${DELETE_BUTTON_CLASS} flex-shrink-0`}
                    >
                      {isDeleting ? (
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          style={{ color: "var(--danger)" }}
                        />
                      ) : (
                        <Trash2 className={DELETE_ICON_CLASS} />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                    <AlgorithmBadge algorithm={rule.algorithm} />
                    <span
                      className="text-xs font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Limit{" "}
                      <span
                        className="font-semibold"
                        style={{
                          color: "var(--text)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {rule.limit.toLocaleString()}
                      </span>
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Window{" "}
                      <span className="font-semibold" style={{ color: "var(--text)" }}>
                        {formatWindow(rule.window_seconds)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ═══ Desktop: table (>= md) ═══ */}
          <div className="hidden md:block table-scroll">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="micro-label">
                  <th className="table-sticky-col text-left px-4 py-2.5 font-bold">
                    Client ID
                  </th>
                  <th className="text-left px-4 py-2.5 font-bold">Endpoint</th>
                  <th className="text-left px-4 py-2.5 font-bold">Algorithm</th>
                  <th className="text-right px-4 py-2.5 font-bold">Limit</th>
                  <th className="text-right px-4 py-2.5 font-bold">Window</th>
                  <th className="text-right px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => {
                  const deleteKey = `${rule.client_id}:${rule.endpoint}`;
                  const isDeleting = pendingDelete === deleteKey;
                  const isSelected = selectedClientId === rule.client_id;
                  const rowBg = isSelected
                    ? "var(--accent-soft)"
                    : "transparent";

                  return (
                    <tr
                      key={deleteKey}
                      className="transition-colors duration-200"
                      style={{ background: rowBg }}
                    >
                      {/* Pinned client column — carries the row background so
                          the scrolled-under cells don't bleed through. */}
                      <td
                        className="table-sticky-col px-4"
                        style={{
                          background: isSelected
                            ? "color-mix(in srgb, var(--accent) 10%, var(--surface-solid))"
                            : "var(--surface-solid)",
                        }}
                      >
                        {/* Fills the row height: as a text-sized button this was
                            a 20px touch target. Row density is unchanged — the
                            sibling cells' py-3 still sets the row height. */}
                        <button
                          onClick={() => toggleClient(rule.client_id)}
                          aria-pressed={isSelected}
                          className="inline-flex items-center min-h-[44px] w-full text-sm font-medium font-mono text-left hover:underline"
                          style={{
                            color: isSelected ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          <span className="truncate max-w-[12rem]">
                            {rule.client_id}
                          </span>
                        </button>
                      </td>
                      <td
                        className="px-4 py-3 text-sm font-mono truncate max-w-[16rem]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {rule.endpoint}
                      </td>
                      <td className="px-4 py-3">
                        <AlgorithmBadge algorithm={rule.algorithm} />
                      </td>
                      <td
                        className="px-4 py-3 text-sm font-semibold text-right font-mono"
                        style={{
                          color: "var(--text)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {rule.limit.toLocaleString()}
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-right font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatWindow(rule.window_seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleDelete(rule)}
                            disabled={isDeleting}
                            aria-label={`Delete rule for ${rule.client_id} on ${rule.endpoint}`}
                            className={DELETE_BUTTON_CLASS}
                          >
                            {isDeleting ? (
                              <Loader2
                                className="w-4 h-4 animate-spin"
                                style={{ color: "var(--danger)" }}
                              />
                            ) : (
                              <Trash2 className={DELETE_ICON_CLASS} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
