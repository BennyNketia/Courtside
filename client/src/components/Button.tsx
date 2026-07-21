import { ButtonHTMLAttributes, CSSProperties, forwardRef } from 'react';
import { colors, motion, radii, shadows } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: 'none',
  cursor: 'pointer',
  borderRadius: radii.control,
  fontFamily: "'Inter', sans-serif",
  fontWeight: 590,
  letterSpacing: '-0.011em',
  whiteSpace: 'nowrap',
  transition: `background ${motion.base}, color ${motion.base}, transform ${motion.fast}, box-shadow ${motion.base}, opacity ${motion.base}`,
  userSelect: 'none',
};

const sizeStyle: Record<Size, CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: 13 },
  md: { height: 36, padding: '0 14px', fontSize: 14 },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', style, disabled, onMouseDown, onMouseUp, onMouseLeave, ...props },
  ref,
) {
  const variantStyle = getVariantStyle(variant);
  const merged: CSSProperties = {
    ...baseStyle,
    ...sizeStyle[size],
    ...variantStyle,
    ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null),
    ...style,
  };

  return (
    <button
      ref={ref}
      disabled={disabled}
      style={merged}
      onMouseEnter={(e) => {
        if (disabled) return;
        Object.assign(e.currentTarget.style, getHoverStyle(variant));
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, variantStyle);
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(0.98)';
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        onMouseUp?.(e);
      }}
      {...props}
    />
  );
});

function getVariantStyle(variant: Variant): CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: colors.accent,
        color: '#FFFFFF',
        boxShadow: shadows.elevBorder,
      };
    case 'secondary':
      return {
        background: 'rgba(255, 255, 255, 0.04)',
        color: colors.text1,
        boxShadow: shadows.elevBorderStrong,
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: colors.text3,
        boxShadow: 'none',
      };
    case 'danger':
      return {
        background: 'transparent',
        color: colors.error,
        boxShadow: '0 0 0 1px rgba(235, 87, 87, 0.4)',
      };
  }
}

function getHoverStyle(variant: Variant): CSSProperties {
  switch (variant) {
    case 'primary':
      return { background: colors.accentHover };
    case 'secondary':
      return { background: 'rgba(255, 255, 255, 0.07)' };
    case 'ghost':
      return { background: 'rgba(255, 255, 255, 0.05)', color: colors.text1 };
    case 'danger':
      return { background: 'rgba(235, 87, 87, 0.12)' };
  }
}
