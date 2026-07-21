import { CSSProperties, ReactNode } from 'react';
import { colors, fonts, radii } from '../theme';

export type Status = 'completed' | 'running' | 'timeout' | 'error' | 'scheduled';

interface StatusBadgeProps {
  status: Status;
  children?: ReactNode;
}

const CONFIG: Record<Status, { color: string; tint: string; label: string; pulse: boolean }> = {
  completed: { color: colors.success, tint: 'rgba(39, 166, 68, 0.12)', label: 'Completed', pulse: false },
  running: { color: colors.agent, tint: 'rgba(0, 184, 204, 0.12)', label: 'Running', pulse: true },
  timeout: { color: colors.warning, tint: 'rgba(240, 191, 0, 0.12)', label: 'Timeout', pulse: false },
  error: { color: colors.error, tint: 'rgba(235, 87, 87, 0.12)', label: 'Error', pulse: false },
  scheduled: { color: colors.info, tint: 'rgba(78, 167, 252, 0.12)', label: 'Scheduled', pulse: false },
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const cfg = CONFIG[status];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 22,
    padding: '0 10px',
    borderRadius: radii.pill,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 510,
    letterSpacing: '-0.005em',
    color: cfg.color,
    background: cfg.tint,
  };
  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'currentColor',
    animation: cfg.pulse ? 'courtside-pulse 1.5s infinite' : undefined,
  };
  return (
    <span style={style}>
      <span style={dotStyle} />
      {children ?? cfg.label}
    </span>
  );
}
