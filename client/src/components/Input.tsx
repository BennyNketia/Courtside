import { CSSProperties, InputHTMLAttributes, forwardRef } from 'react';
import { colors, fonts, motion, radii, shadows } from '../theme';

// Single-line input — the DESIGN.md `.input` recipe. Shares the focus
// ring with Textarea for a consistent form palette.

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const baseStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(255, 255, 255, 0.03)',
  color: colors.text1,
  border: 'none',
  outline: 'none',
  boxShadow: shadows.elevBorderStrong,
  borderRadius: radii.control,
  minHeight: 40,
  padding: '0 12px',
  fontFamily: fonts.sans,
  fontSize: 15,
  fontWeight: 400,
  letterSpacing: '-0.011em',
  transition: `box-shadow ${motion.base}`,
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { style, onFocus, onBlur, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      style={{ ...baseStyle, ...style }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 1px ${colors.accent}, 0 0 0 3px rgba(94, 106, 210, 0.25)`;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = shadows.elevBorderStrong;
        onBlur?.(e);
      }}
      {...props}
    />
  );
});
