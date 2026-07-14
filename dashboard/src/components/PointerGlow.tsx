import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { hasFinePointer, prefersReducedMotion } from "../motion";

// =============================================================================
// PointerGlow — the cursor moment that replaced the WebGL fluid sim.
// One fixed div behind the content, moved with gsap.quickTo. No canvas, no
// per-frame simulation, no render loop when the pointer is still.
// =============================================================================

export function PointerGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled] = useState(
    () => hasFinePointer() && !prefersReducedMotion(),
  );

  useGSAP(
    (_context, contextSafe) => {
      const el = ref.current;
      if (!enabled || !el || !contextSafe) return;

      // quickTo reuses one tween instead of allocating per pointermove.
      const moveX = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3" });
      const moveY = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3" });

      // contextSafe: these tweens are created inside listeners that fire long
      // after useGSAP ran, so without it they'd sit outside the context and
      // never be reverted on unmount.
      const onMove = contextSafe((e: Event) => {
        const { clientX, clientY } = e as PointerEvent;
        moveX(clientX);
        moveY(clientY);
        gsap.to(el, { opacity: 1, duration: 0.4, overwrite: "auto" });
      });

      const onLeave = contextSafe(() => {
        gsap.to(el, { opacity: 0, duration: 0.4, overwrite: "auto" });
      });

      window.addEventListener("pointermove", onMove);
      document.addEventListener("pointerleave", onLeave);
      return () => {
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerleave", onLeave);
      };
    },
    { dependencies: [enabled] },
  );

  if (!enabled) return null;

  return <div ref={ref} className="pointer-glow" aria-hidden="true" />;
}
