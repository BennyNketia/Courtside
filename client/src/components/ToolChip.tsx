import { CSSProperties } from 'react';
import { colors, fonts, radii } from '../theme';

export type ToolChipState = 'pending' | 'done' | 'failed';

interface ToolChipProps {
  name: string;
  state: ToolChipState;
  latencyMs?: number;
}

const STATE: Record<
  ToolChipState,
  { bg: string; ring: string; label: string; pulse: boolean }
> = {
  pending: {
    bg: 'rgba(0, 184, 204, 0.10)',
    ring: '0 0 0 1px rgba(0, 184, 204, 0.25)',
    label: colors.agent,
    pulse: true,
  },
  done: {
    bg: 'rgba(39, 166, 68, 0.10)',
    ring: '0 0 0 1px rgba(39, 166, 68, 0.25)',
    label: colors.success,
    pulse: false,
  },
  failed: {
    bg: 'rgba(235, 87, 87, 0.10)',
    ring: '0 0 0 1px rgba(235, 87, 87, 0.25)',
    label: colors.error,
    pulse: false,
  },
};

export function ToolChip({ name, state, latencyMs }: ToolChipProps) {
  const cfg = STATE[state];
  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    height: 24,
    padding: '0 10px',
    borderRadius: radii.pill,
    background: cfg.bg,
    boxShadow: cfg.ring,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: 400,
    color: cfg.label,
    verticalAlign: 'middle',
    animation: 'courtside-fade-in 200ms ease',
    marginRight: 2,
  };
  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'currentColor',
    animation: cfg.pulse ? 'courtside-pulse 1s infinite' : undefined,
    flexShrink: 0,
  };
  const nameStyle: CSSProperties = {
    color: colors.text2,
    fontFamily: fonts.mono,
  };
  const latStyle: CSSProperties = {
    color: colors.text4,
    fontFamily: fonts.mono,
    fontSize: 11,
  };
  return (
    <span style={chipStyle}>
      <span style={dotStyle} />
      <span style={nameStyle}>{name}</span>
      {typeof latencyMs === 'number' && state !== 'pending' && (
        <span style={latStyle}>{latencyMs}ms</span>
      )}
    </span>
  );
}
