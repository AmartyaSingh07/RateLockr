import { useState, useEffect, useRef } from "react";
import { X, Plus, Loader2, Zap } from "lucide-react";
import { useCreateRule } from "../hooks/useRules";
import type { Rule } from "../hooks/useRules";

// =============================================================================
// CreateRuleModal — Slide-Over Drawer Policy Form
// =============================================================================

interface CreateRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_FORM: Rule = {
  client_id: "",
  endpoint: "",
  limit: 100,
  window_seconds: 60,
  algorithm: "token_bucket",
};

export function CreateRuleModal({ isOpen, onClose }: CreateRuleModalProps) {
  const [form, setForm] = useState<Rule>({ ...INITIAL_FORM });
  const [errors, setErrors] = useState<Partial<Record<keyof Rule, string>>>({});
  const createRule = useCreateRule();
  const overlayRef = useRef<HTMLDivElement>(null);

  // ─── ESC key to close ───
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // ─── Overlay click to close ───
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof Rule, string>> = {};
    if (!form.client_id.trim()) next.client_id = "Client ID is required";
    if (!form.endpoint.trim()) next.endpoint = "Endpoint is required";
    if (!form.limit || form.limit < 1) next.limit = "Limit must be at least 1";
    if (!form.window_seconds || form.window_seconds < 1)
      next.window_seconds = "Window must be at least 1 second";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    createRule.mutate(form, {
      onSuccess: () => {
        setForm({ ...INITIAL_FORM });
        setErrors({});
        onClose();
      },
    });
  };

  const updateField = <K extends keyof Rule>(key: K, value: Rule[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={handleOverlayClick}
    >
      <div className="slide-over-panel">
        {/* ─── Drawer Header ─── */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-5"
          style={{
            background: "rgba(14, 14, 24, 0.95)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.15)",
              }}
            >
              <Zap className="w-4 h-4" style={{ color: "#10b981" }} />
            </div>
            <div>
              <h2
                className="text-sm font-bold text-zinc-100 tracking-wide uppercase"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                New Rule
              </h2>
              <p className="text-[10px] mt-0.5" style={{ color: "#52525b" }}>
                Configure rate limiting policy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all duration-200"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(244, 63, 94, 0.1)";
              e.currentTarget.style.borderColor = "rgba(244, 63, 94, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
            }}
          >
            <X className="w-4 h-4" style={{ color: "#71717a" }} />
          </button>
        </div>

        {/* ─── Form Body ─── */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {/* Client ID */}
          <div>
            <label
              className="block text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{
                color: "#71717a",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Client ID
            </label>
            <input
              type="text"
              value={form.client_id}
              onChange={(e) => updateField("client_id", e.target.value)}
              placeholder="e.g. api_consumer_alpha"
              className="obsidian-input"
            />
            {errors.client_id && (
              <p
                className="text-[10px] mt-1.5 font-medium"
                style={{ color: "#f43f5e" }}
              >
                {errors.client_id}
              </p>
            )}
          </div>

          {/* Endpoint */}
          <div>
            <label
              className="block text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{
                color: "#71717a",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Endpoint
            </label>
            <input
              type="text"
              value={form.endpoint}
              onChange={(e) => updateField("endpoint", e.target.value)}
              placeholder="e.g. /api/v1/transactions"
              className="obsidian-input"
            />
            {errors.endpoint && (
              <p
                className="text-[10px] mt-1.5 font-medium"
                style={{ color: "#f43f5e" }}
              >
                {errors.endpoint}
              </p>
            )}
          </div>

          {/* Algorithm Select */}
          <div>
            <label
              className="block text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{
                color: "#71717a",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Algorithm
            </label>
            <select
              value={form.algorithm}
              onChange={(e) =>
                updateField("algorithm", e.target.value as Rule["algorithm"])
              }
              className="obsidian-select"
            >
              <option value="token_bucket">Token Bucket</option>
              <option value="sliding_window">Sliding Window</option>
              <option value="fixed_window">Fixed Window</option>
            </select>
          </div>

          {/* Limit + Window Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{
                  color: "#71717a",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Limit
              </label>
              <input
                type="number"
                min={1}
                value={form.limit}
                onChange={(e) =>
                  updateField("limit", parseInt(e.target.value) || 0)
                }
                placeholder="100"
                className="obsidian-input"
              />
              {errors.limit && (
                <p
                  className="text-[10px] mt-1.5 font-medium"
                  style={{ color: "#f43f5e" }}
                >
                  {errors.limit}
                </p>
              )}
            </div>
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{
                  color: "#71717a",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Window (sec)
              </label>
              <input
                type="number"
                min={1}
                value={form.window_seconds}
                onChange={(e) =>
                  updateField(
                    "window_seconds",
                    parseInt(e.target.value) || 0
                  )
                }
                placeholder="60"
                className="obsidian-input"
              />
              {errors.window_seconds && (
                <p
                  className="text-[10px] mt-1.5 font-medium"
                  style={{ color: "#f43f5e" }}
                >
                  {errors.window_seconds}
                </p>
              )}
            </div>
          </div>

          {/* ─── Action Buttons ─── */}
          <div
            className="pt-4 flex gap-3"
            style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
          >
            <button
              type="submit"
              disabled={createRule.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={{
                background: createRule.isPending
                  ? "rgba(16, 185, 129, 0.15)"
                  : "rgba(16, 185, 129, 0.2)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                color: "#10b981",
                fontFamily: "'JetBrains Mono', monospace",
              }}
              onMouseEnter={(e) => {
                if (!createRule.isPending) {
                  e.currentTarget.style.background =
                    "rgba(16, 185, 129, 0.3)";
                  e.currentTarget.style.borderColor =
                    "rgba(16, 185, 129, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "rgba(16, 185, 129, 0.2)";
                e.currentTarget.style.borderColor =
                  "rgba(16, 185, 129, 0.25)";
              }}
            >
              {createRule.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {createRule.isPending ? "Creating..." : "Create Rule"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                color: "#71717a",
                fontFamily: "'JetBrains Mono', monospace",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "rgba(255, 255, 255, 0.06)";
                e.currentTarget.style.borderColor =
                  "rgba(255, 255, 255, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "rgba(255, 255, 255, 0.03)";
                e.currentTarget.style.borderColor =
                  "rgba(255, 255, 255, 0.06)";
              }}
            >
              Cancel
            </button>
          </div>

          {/* ─── Error Feedback ─── */}
          {createRule.isError && (
            <div
              className="px-4 py-3 rounded-xl text-xs font-medium"
              style={{
                background: "rgba(244, 63, 94, 0.08)",
                border: "1px solid rgba(244, 63, 94, 0.15)",
                color: "#fb7185",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Failed to create rule. Please check your inputs and try again.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
