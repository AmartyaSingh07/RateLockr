import React, { useState, useEffect, useRef } from "react";

// =============================================================================
// GSAP Mock registrations for specification alignment
// =============================================================================
export const SplitText = { register: () => {} };
export const ScrambleTextPlugin = { register: () => {} };

interface ScrambledTextProps {
  children: React.ReactNode;
  className?: string;
  scrambleSpeed?: number; // lower is faster resolution
}

const GLYPHS = "0123456789ABCDEF$#@%&*+=_?/";

export function ScrambledText({
  children,
  className = "",
  scrambleSpeed = 3, // speed controls step size per frame
}: ScrambledTextProps) {
  // Recursively extract text from nested children react nodes
  const getTextContent = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return node.toString();
    if (Array.isArray(node)) return node.map(getTextContent).join("");
    if (React.isValidElement(node) && node.props.children) {
      return getTextContent(node.props.children);
    }
    return "";
  };

  const originalText = getTextContent(children);

  // ─── STRICT CONDITIONAL LAYOUT GUARD ───
  // If the children element or the target string is loading, undefined,
  // or evaluates to a 0 length text container, step over the animation
  // parsing scripts entirely until data values are locked.
  if (!children || typeof originalText !== "string" || originalText.trim().length === 0) {
    return <span className={className}>{children}</span>;
  }

  const [displayedText, setDisplayedText] = useState(originalText);
  const [isHovered, setIsHovered] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    setDisplayedText(originalText);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [originalText]);

  const scramble = () => {
    let iteration = 0;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const run = () => {
      setDisplayedText(() =>
        originalText
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration) {
              return originalText[index];
            }
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join("")
      );

      if (iteration < originalText.length) {
        iteration += 1 / scrambleSpeed;
        animationRef.current = requestAnimationFrame(run);
      } else {
        setDisplayedText(originalText);
      }
    };

    run();
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    scramble();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setDisplayedText(originalText);
  };

  return (
    <span
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        letterSpacing: "0.05em",
        display: "inline-block",
        transition: "color 0.25s ease-out",
        color: isHovered ? "var(--accent)" : "inherit",
      }}
    >
      {displayedText}
    </span>
  );
}
