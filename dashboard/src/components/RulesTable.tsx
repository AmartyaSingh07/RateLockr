import { useState, useMemo } from "react";
import { Trash2, Loader2, Database, Search } from "lucide-react";
import { useRules, useDeleteRule } from "../hooks/useRules";
import type { Rule } from "../hooks/useRules";
import { ScrambledText } from "./ScrambledText";

// =============================================================================
// RulesTable — Glassmorphic Interactive Policy Datagrid
// =============================================================================

const ALGORITHM_LABELS: Record<Rule["algorithm"], { label: string; color: string; bg: string; border: string }> = {
  token_bucket: {
    label: "Token Bucket",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.1)",
    border: "rgba(16, 185, 129, 0.2)",
  },
  sliding_window: {
    label: "Sliding Window",
    color: "#818cf8",
    bg: "rgba(99, 102, 241, 0.1)",
    border: "rgba(99, 102, 241, 0.2)",
  },
  fixed_window: {
    label: "Fixed Window",
    color: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.2)",
  },
};

function formatWindow(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(0)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
  return `${seconds}s`;
}

interface RulesTableProps {
  selectedClientId: string | null;
  onSelectClient: (clientId: string | null) => void;
}

export function RulesTable({ selectedClientId, onSelectClient }: RulesTableProps) {
  const { data: rules, isLoading } = useRules();
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

  // ─── Loading Skeleton ───
  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-center h-48">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "#52525b" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight uppercase">
            <ScrambledText scrambleSpeed={3}>Rate Limiting Rules</ScrambledText>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>
            Active policy configurations · {filteredRules.length} rule
            {filteredRules.length !== 1 ? "s" : ""} loaded
          </p>
        </div>

        {/* Search Filter */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "#52525b" }}
          />
          <input
            type="text"
            placeholder="Filter rules..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="obsidian-input pl-9 pr-3 py-1.5 text-xs rounded-lg w-48"
            style={{ fontSize: "11px" }}
          />
        </div>
      </div>

      {/* ─── Column Headers ─── */}
      <div
        className="grid grid-cols-[1.5fr_2fr_1fr_0.7fr_0.7fr_0.4fr] gap-4 px-4 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
        style={{
          background: "rgba(14, 14, 24, 0.5)",
          color: "#52525b",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <span>
          <ScrambledText>Client ID</ScrambledText>
        </span>
        <span>
          <ScrambledText>Endpoint</ScrambledText>
        </span>
        <span>
          <ScrambledText>Algorithm</ScrambledText>
        </span>
        <span className="text-right">
          <ScrambledText>Limit</ScrambledText>
        </span>
        <span className="text-right">
          <ScrambledText>Window</ScrambledText>
        </span>
        <span className="text-right">
          <ScrambledText>Actions</ScrambledText>
        </span>
      </div>

      {/* ─── Table Rows ─── */}
      {filteredRules.length === 0 ? (
        <div className="py-16 text-center flex flex-col items-center gap-3">
          <Database className="w-8 h-8" style={{ color: "#3f3f46" }} />
          <p
            className="text-sm font-medium"
            style={{
              color: "#3f3f46",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {searchFilter
              ? "No rules match your filter"
              : "No active rules configured"}
          </p>
          <p className="text-xs" style={{ color: "#27272a" }}>
            {searchFilter
              ? "Try adjusting your search query"
              : 'Click "+ New Rule" to create your first policy'}
          </p>
        </div>
      ) : (
        <div className="mt-1 space-y-0.5">
          {filteredRules.map((rule) => {
            const algo = ALGORITHM_LABELS[rule.algorithm];
            const deleteKey = `${rule.client_id}:${rule.endpoint}`;
            const isDeleting = pendingDelete === deleteKey;
            const isSelected = selectedClientId === rule.client_id;

            return (
              <div
                key={deleteKey}
                onClick={() => onSelectClient(isSelected ? null : rule.client_id)}
                className={`grid grid-cols-[1.5fr_2fr_1fr_0.7fr_0.7fr_0.4fr] gap-4 px-4 py-3 rounded-lg transition-all duration-200 group cursor-pointer border ${
                  isSelected
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/[0.04]"
                }`}
              >
                {/* Client ID */}
                <span
                  className="text-sm font-medium truncate self-center"
                  style={{
                    color: "#d4d4d8",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {rule.client_id}
                </span>

                {/* Endpoint */}
                <span
                  className="text-sm truncate self-center"
                  style={{
                    color: "#a1a1aa",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {rule.endpoint}
                </span>

                {/* Algorithm Badge */}
                <span className="self-center">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase whitespace-nowrap"
                    style={{
                      color: algo.color,
                      backgroundColor: algo.bg,
                      border: `1px solid ${algo.border}`,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {algo.label}
                  </span>
                </span>

                {/* Limit */}
                <span
                  className="text-sm font-semibold text-right self-center"
                  style={{
                    color: "#e4e4e7",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rule.limit.toLocaleString()}
                </span>

                {/* Window */}
                <span
                  className="text-sm text-right self-center"
                  style={{
                    color: "#71717a",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {formatWindow(rule.window_seconds)}
                </span>

                {/* Delete Action */}
                <div className="flex justify-end self-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(rule);
                    }}
                    disabled={isDeleting}
                    className="p-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 border border-transparent hover:bg-rose-500/10 hover:border-rose-500/20"
                    title="Delete rule"
                  >
                    {isDeleting ? (
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin"
                        style={{ color: "#f43f5e" }}
                      />
                    ) : (
                      <Trash2
                        className="w-3.5 h-3.5"
                        style={{ color: "#f43f5e" }}
                      />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
