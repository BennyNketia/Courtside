import { CSSProperties, TextareaHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import { colors, fonts, motion, radii, shadows } from '../theme';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
  maxRows?: number;
}

const baseStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(255, 255, 255, 0.03)',
  color: colors.text1,
  border: 'none',
  outline: 'none',
  boxShadow: shadows.elevBorderStrong,
  borderRadius: radii.control,
  padding: '10px 12px',
  fontFamily: fonts.sans,
  fontSize: 15,
  fontWeight: 400,
  letterSpacing: '-0.011em',
  lineHeight: 1.5,
  resize: 'none',
  transition: `box-shadow ${motion.base}`,
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { autoGrow = false, maxRows = 8, style, onInput, ...props },
  ref,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
  };

  const resize = () => {
    const el = localRef.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    const lineHeight = 22;
    const maxH = lineHeight * maxRows + 20;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  };

  useEffect(() => {
    if (autoGrow) resize();
  }, [props.value, autoGrow]);

  return (
    <textarea
      ref={setRefs}
      style={{ ...baseStyle, ...style }}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 1px ${colors.accent}, 0 0 0 3px rgba(94, 106, 210, 0.25)`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = shadows.elevBorderStrong;
        props.onBlur?.(e);
      }}
      {...props}
    />
  );
});
