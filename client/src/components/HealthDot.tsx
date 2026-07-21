import { CSSProperties } from 'react';
import { colors } from '../theme';

interface HealthDotProps {
  healthy?: boolean;
  size?: number;
}

export function HealthDot({ healthy = true, size = 8 }: HealthDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: healthy ? colors.success : colors.error,
    boxShadow: healthy
      ? '0 0 0 3px rgba(39, 166, 68, 0.15)'
      : '0 0 0 3px rgba(235, 87, 87, 0.15)',
    display: 'inline-block',
    flexShrink: 0,
  };
  return <span style={style} aria-label={healthy ? 'Healthy' : 'Unhealthy'} />;
}
