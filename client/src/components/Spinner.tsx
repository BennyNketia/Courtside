import { CSSProperties } from 'react';
import { colors } from '../theme';

// Thin indeterminate spinner (DESIGN.md §3 "Spinner: thin, --accent").
// Uses an inline <svg> with a rotating dashoffset so it works without
// depending on Tailwind or a CSS keyframe registration in this module.

export interface SpinnerProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Spinner({ size = 16, color = colors.accent, strokeWidth = 2 }: SpinnerProps) {
  const svgStyle: CSSProperties = {
    display: 'inline-block',
    verticalAlign: 'middle',
    animation: 'courtside-spin 700ms linear infinite',
    flexShrink: 0,
  };
  const half = size / 2;
  const r = half - strokeWidth;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={svgStyle}
      aria-hidden
    >
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * 0.75}
      />
    </svg>
  );
}
