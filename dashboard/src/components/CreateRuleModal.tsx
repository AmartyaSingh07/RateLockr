import { useState, useEffect, useRef } from "react";
import { X, Plus, Loader2, Zap, TriangleAlert } from "lucide-react";
import { useCreateRule } from "../hooks/useRules";
import type { Rule } from "../hooks/useRules";

// =============================================================================
// CreateRuleModal — right-side slide-over on desktop, bottom sheet on mobile
// (the responsive switch lives on .modal-overlay / .slide-over-panel in CSS).
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

const LABEL_CLASS = "micro-label block mb-2";

export function CreateRuleModal({ isOpen, onClose }: CreateRuleModalProps) {
  const [form, setForm] = useState<Rule>({ ...INITIAL_FORM });
  const [errors, setErrors] = useState<Partial<Record<keyof Rule, string>>>({});
  const createRule = useCreateRule();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ─── Escape to close + focus trap ───
  // This is a plain overlay, not a native <dialog>, so the trap is ours to
  // keep: without it, Tab walks straight out into the dashboard behind.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));

    // Land on the first field, not the close button.
    (panelRef.current?.querySelector("input") ?? focusables()[0])?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previouslyFocused?.focus(); // return the user to the New Rule button
    };
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
      role="dialog"
      aria-modal="true"
      aria-label="New rule"
    >
      <div ref={panelRef} className="slide-over-panel">
        {/* ─── Header ─── */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-5 backdrop-blur-xl"
          style={{
            background: "var(--surface-solid)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="p-2 rounded-[var(--radius-control)] flex-shrink-0"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-ring)",
              }}
            >
              <Zap className="w-4 h-4" style={{ color: "var(--accent)" }} />
            </div>
            <div className="min-w-0">
              <h2 className="card-title">New rule</h2>
              <p className="card-subtitle">Configure a rate limiting policy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-icon flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ─── Form Body ─── */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {/* Client ID */}
          <div>
            <label
              className={LABEL_CLASS}
              style={{ color: "var(--text-muted)" }}
              htmlFor="rule-client-id"
            >
              Client ID
            </label>
            <input
              id="rule-client-id"
              type="text"
              value={form.client_id}
              onChange={(e) => updateField("client_id", e.target.value)}
              placeholder="e.g. api_consumer_alpha"
              className="obsidian-input"
              aria-invalid={!!errors.client_id}
            />
            {errors.client_id && (
              <p
                className="text-[10px] mt-1.5 font-medium"
                style={{ color: "var(--danger)" }}
              >
                {errors.client_id}
              </p>
            )}
          </div>

          {/* Endpoint */}
          <div>
            <label
              className={LABEL_CLASS}
              style={{ color: "var(--text-muted)" }}
              htmlFor="rule-endpoint"
            >
              Endpoint
            </label>
            <input
              id="rule-endpoint"
              type="text"
              value={form.endpoint}
              onChange={(e) => updateField("endpoint", e.target.value)}
              placeholder="e.g. /api/v1/transactions"
              className="obsidian-input"
              aria-invalid={!!errors.endpoint}
            />
            {errors.endpoint && (
              <p
                className="text-[10px] mt-1.5 font-medium"
                style={{ color: "var(--danger)" }}
              >
                {errors.endpoint}
              </p>
            )}
          </div>

          {/* Algorithm Select */}
          <div>
            <label
              className={LABEL_CLASS}
              style={{ color: "var(--text-muted)" }}
              htmlFor="rule-algorithm"
            >
              Algorithm
            </label>
            <select
              id="rule-algorithm"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className={LABEL_CLASS}
                style={{ color: "var(--text-muted)" }}
                htmlFor="rule-limit"
              >
                Limit
              </label>
              <input
                id="rule-limit"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.limit}
                onChange={(e) =>
                  updateField("limit", parseInt(e.target.value) || 0)
                }
                placeholder="100"
                className="obsidian-input"
                aria-invalid={!!errors.limit}
              />
              {errors.limit && (
                <p
                  className="text-[10px] mt-1.5 font-medium"
                  style={{ color: "var(--danger)" }}
                >
                  {errors.limit}
                </p>
              )}
            </div>
            <div>
              <label
                className={LABEL_CLASS}
                style={{ color: "var(--text-muted)" }}
                htmlFor="rule-window"
              >
                Window (sec)
              </label>
              <input
                id="rule-window"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.window_seconds}
                onChange={(e) =>
                  updateField("window_seconds", parseInt(e.target.value) || 0)
                }
                placeholder="60"
                className="obsidian-input"
                aria-invalid={!!errors.window_seconds}
              />
              {errors.window_seconds && (
                <p
                  className="text-[10px] mt-1.5 font-medium"
                  style={{ color: "var(--danger)" }}
                >
                  {errors.window_seconds}
                </p>
              )}
            </div>
          </div>

          {/* ─── Action Buttons ─── */}
          <div
            className="pt-4 flex flex-col-reverse sm:flex-row gap-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button type="button" onClick={onClose} className="btn text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRule.isPending}
              className="btn-accent flex-1 text-sm"
            >
              {createRule.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {createRule.isPending ? "Creating…" : "Create rule"}
            </button>
          </div>

          {/* ─── Error Feedback ─── */}
          {createRule.isError && (
            <div
              role="alert"
              className="flex items-start gap-2 px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium font-mono"
              style={{
                background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
                color: "var(--danger)",
              }}
            >
              <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-px" />
              <span>Couldn't create the rule. Check the values and try again.</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
