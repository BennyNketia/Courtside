import { CSSProperties, HTMLAttributes, forwardRef } from 'react';
import { colors, radii, shadows } from '../theme';

// Card / Panel — the shadow-as-border container from DESIGN.md §2.
// `variant="card"` is 12px radius; `variant="panel"` is 16px. Padding is
// opt-in via `padded` so callers that render a table inside (no padding
// wanted at the edges) don't have to blow the default away.

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'card' | 'panel';
  padded?: boolean;
  elevated?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'card', padded = false, elevated = false, style, ...props },
  ref,
) {
  const merged: CSSProperties = {
    background: colors.bg1,
    borderRadius: variant === 'panel' ? radii.panel : radii.card,
    boxShadow: elevated ? shadows.elevLow : shadows.elevBorder,
    ...(padded ? { padding: 24 } : null),
    ...style,
  };
  return <div ref={ref} style={merged} {...props} />;
});
