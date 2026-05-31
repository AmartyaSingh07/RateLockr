import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import "../styles/simulator.css";

export function TrafficSimulator() {
  const [isSimulating1, setIsSimulating1] = useState(false);
  const [isSimulating15, setIsSimulating15] = useState(false);

  // Generate 52 spans for particle animation spots
  const spots = Array.from({ length: 52 }, (_, i) => (
    <span key={i} className="button_spots" />
  ));

  const triggerTrafficSimulation = async (totalBursts: number) => {
    // Determine active status hooks
    if (totalBursts === 1) {
      if (isSimulating1) return; // Prevent double-triggering
      setIsSimulating1(true);
    } else {
      if (isSimulating15) return;
      setIsSimulating15(true);
    }

    // Extract profile clientId or client_id from window location search query parameters
    const params = new URLSearchParams(window.location.search);
    const activeClientId = params.get("clientId") || params.get("client_id") || "anonymous_crawler";

    try {
      // Loop over requests with an interval delay
      for (let i = 0; i < totalBursts; i++) {
        // We use standard fetch to POST directly to the production RateLockr API
        await fetch("https://ratelockr-api.onrender.com/check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-ID": activeClientId,
          },
          body: JSON.stringify({
            client_id: activeClientId,
            endpoint: "/api/v1/search",
          }),
        }).catch((err) => {
          console.error("Simulator request failed:", err);
        });

        // Delay ~80ms between requests if running in a burst loop
        if (i < totalBursts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }

      // Dispatch global window event "refetch-stats" to trigger immediate dashboard updates
      window.dispatchEvent(new CustomEvent("refetch-stats"));
    } catch (err) {
      console.error("Traffic simulation execution error:", err);
    } finally {
      // Retain the checked state for 1 second (1000ms) to allow the success animations to render
      setTimeout(() => {
        if (totalBursts === 1) {
          setIsSimulating1(false);
        } else {
          setIsSimulating15(false);
        }
      }, 1000);
    }
  };

  return (
    <section className="traffic-playground-section">
      <div className="simulator-title-block">
        <h3 className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
          Live Traffic Simulator
        </h3>
        <p>
          Generate concurrent HTTP requests targeting the <code>/check</code> endpoint. Watch live Recharts telemetry curves adapt in real time.
        </p>
      </div>

      <div className="simulator-actions">
        {/* Button 1: Emerald Glow (1x Single Request) */}
        <input
          id="fire-1x"
          type="checkbox"
          checked={isSimulating1}
          onChange={() => triggerTrafficSimulation(1)}
        />
        <label htmlFor="fire-1x" className="single-btn">
          <div className="button_inner">
            <span className="t">🚀 Fire Single Request</span>
            <Loader2 className="l w-4 h-4 animate-spin" />
            <div className="b_l_quad">{spots}</div>
            <Check className="tick w-4 h-4" />
          </div>
        </label>

        {/* Button 2: Crimson Burst (15x Load Burst) */}
        <input
          id="fire-15x"
          type="checkbox"
          checked={isSimulating15}
          onChange={() => triggerTrafficSimulation(15)}
        />
        <label htmlFor="fire-15x" className="burst-btn">
          <div className="button_inner">
            <span className="t">💥 Simulate Load Burst (15x)</span>
            <Loader2 className="l w-4 h-4 animate-spin" />
            <div className="b_l_quad">{spots}</div>
            <Check className="tick w-4 h-4" />
          </div>
        </label>
      </div>
    </section>
  );
}
