import { useMemo } from "react";

interface Props {
  total: number;
  ok: number;
  partial: number;
  missing: number;
  className?: string;
}

/**
 * A clean, minimal SVG sketch of an armoire (cabinet) — monochrome with
 * subtle status accents. Cells fill in from bottom-up as components are added.
 */
export function ArmoireSketch({ total, ok, partial, missing, className }: Props) {
  const cols = 3;
  const rows = 4;
  const totalCells = cols * rows;

  const cells = useMemo(() => {
    const filled = Math.min(totalCells, total);
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

  const accentFor = (s: string) => {
    switch (s) {
      case "ok": return "hsl(142 60% 45%)";
      case "partial": return "hsl(38 85% 55%)";
      case "missing": return "hsl(0 70% 55%)";
      default: return "transparent";
    }
  };

  // Geometry
  const W = 120, H = 150;
  const padX = 12, padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2 - 6;
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className}>
      {/* Cabinet body */}
      <rect
        x="2" y="2" width={W - 4} height={H - 4}
        rx="4"
        fill="hsl(var(--card))"
        stroke="hsl(var(--border))"
        strokeWidth="1"
      />
      {/* Inner shelf area */}
      <rect
        x={padX} y={padY} width={innerW} height={innerH}
        fill="hsl(var(--muted) / 0.3)"
        stroke="hsl(var(--border))"
        strokeWidth="0.75"
        rx="1.5"
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
          strokeWidth="0.5"
        />
      ))}
      {/* Cells (bottom-up) */}
      {cells.map((status, idx) => {
        const r = rows - 1 - Math.floor(idx / cols);
        const c = idx % cols;
        const x = padX + c * cellW + 3;
        const y = padY + r * cellH + 3;
        const w = cellW - 6;
        const h = cellH - 6;
        if (status === "empty") return null;
        return (
          <g key={idx}>
            <rect
              x={x} y={y} width={w} height={h}
              rx="1"
              fill="hsl(var(--foreground) / 0.06)"
              stroke="hsl(var(--foreground) / 0.15)"
              strokeWidth="0.5"
            />
            {/* Subtle status dot */}
            <circle
              cx={x + w - 3}
              cy={y + 3}
              r="1.5"
              fill={accentFor(status)}
            />
          </g>
        );
      })}
      {/* Door handle */}
      <line
        x1={W - 8} x2={W - 8}
        y1={H / 2 - 6} y2={H / 2 + 6}
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Base */}
      <line
        x1="8" x2={W - 8}
        y1={H - 5} y2={H - 5}
        stroke="hsl(var(--border))"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
