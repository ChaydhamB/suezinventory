import { useMemo } from "react";

interface Props {
  total: number;
  ok: number;
  partial: number;
  missing: number;
  className?: string;
}

/**
 * A small SVG sketch of an armoire (cabinet) that visualises fill state.
 * Cells fill in from bottom-left as components are added; colour reflects status.
 */
export function ArmoireSketch({ total, ok, partial, missing, className }: Props) {
  const cols = 4;
  const rows = 5;
  const totalCells = cols * rows;

  const cells = useMemo(() => {
    const filled = Math.min(totalCells, total);
    // Distribute statuses across the filled cells (ok first, then partial, then missing).
    const arr: ("ok" | "partial" | "missing" | "empty")[] = [];
    let okLeft = Math.round((ok / Math.max(1, total)) * filled);
    let partialLeft = Math.round((partial / Math.max(1, total)) * filled);
    let missingLeft = filled - okLeft - partialLeft;
    if (missingLeft < 0) { okLeft += missingLeft; missingLeft = 0; }
    for (let i = 0; i < totalCells; i++) {
      if (i >= filled) { arr.push("empty"); continue; }
      if (okLeft > 0) { arr.push("ok"); okLeft--; }
      else if (partialLeft > 0) { arr.push("partial"); partialLeft--; }
      else if (missingLeft > 0) { arr.push("missing"); missingLeft--; }
      else arr.push("ok");
    }
    return arr;
  }, [total, ok, partial, missing]);

  const colorFor = (s: string) => {
    switch (s) {
      case "ok": return "hsl(142 71% 45% / 0.85)";
      case "partial": return "hsl(38 92% 55% / 0.85)";
      case "missing": return "hsl(0 84% 60% / 0.85)";
      default: return "hsl(var(--muted))";
    }
  };

  // Geometry
  const W = 140, H = 180;
  const padX = 14, padY = 16;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2 - 8;
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ filter: "drop-shadow(0 4px 12px hsl(var(--brand) / 0.18))" }}
    >
      {/* Cabinet body */}
      <rect
        x="4" y="4" width={W - 8} height={H - 8}
        rx="6"
        fill="hsl(var(--card))"
        stroke="hsl(var(--border))"
        strokeWidth="1.5"
      />
      {/* Top trim */}
      <rect x="6" y="6" width={W - 12} height="6" rx="2" fill="hsl(var(--brand) / 0.15)" />
      {/* Inner shelf area background */}
      <rect
        x={padX} y={padY} width={innerW} height={innerH}
        fill="hsl(var(--muted) / 0.4)"
        stroke="hsl(var(--border))"
        strokeWidth="0.75"
        rx="2"
      />
      {/* Shelf lines */}
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <line
          key={`shelf-${i}`}
          x1={padX}
          x2={padX + innerW}
          y1={padY + cellH * (i + 1)}
          y2={padY + cellH * (i + 1)}
          stroke="hsl(var(--border))"
          strokeWidth="0.75"
        />
      ))}
      {/* Vertical divider */}
      <line
        x1={padX + innerW / 2}
        x2={padX + innerW / 2}
        y1={padY}
        y2={padY + innerH}
        stroke="hsl(var(--border))"
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      {/* Cells (drawn bottom-up) */}
      {cells.map((status, idx) => {
        const r = rows - 1 - Math.floor(idx / cols);
        const c = idx % cols;
        const x = padX + c * cellW + 2;
        const y = padY + r * cellH + 2;
        const w = cellW - 4;
        const h = cellH - 4;
        return (
          <rect
            key={idx}
            x={x} y={y} width={w} height={h}
            rx="1.5"
            fill={colorFor(status)}
            style={{ transition: "fill 0.4s ease" }}
          />
        );
      })}
      {/* Door handle hint */}
      <circle cx={W - 12} cy={H / 2} r="1.5" fill="hsl(var(--brand))" />
      {/* Base */}
      <rect x="10" y={H - 10} width={W - 20} height="4" rx="1" fill="hsl(var(--brand) / 0.3)" />
    </svg>
  );
}
