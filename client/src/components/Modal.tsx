import * as Dialog from '@radix-ui/react-dialog';
import { CSSProperties, ReactNode } from 'react';
import { colors, fonts, motion, radii, shadows } from '../theme';

// Modal — the one place `elev-high` is allowed (DESIGN.md §1: "Shadows
// are for floating UI only, never routine cards"). Kept as a thin wrapper
// around Radix Dialog so focus trapping, ESC-to-close, and portaling all
// come for free.

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(6, 7, 8, 0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  zIndex: 40,
  animation: `courtside-fade-in ${motion.base}`,
};

const contentStyle: CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 40px)',
  overflow: 'auto',
  background: colors.bg4,
  color: colors.text1,
  borderRadius: radii.card,
  boxShadow: shadows.elevHigh,
  padding: 24,
  zIndex: 41,
  animation: `courtside-fade-in ${motion.base}`,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: fonts.sans,
  fontSize: 18,
  fontWeight: 590,
  letterSpacing: '-0.014em',
  color: colors.text1,
};

const descStyle: CSSProperties = {
  margin: '4px 0 20px',
  fontFamily: fonts.sans,
  fontSize: 13,
  color: colors.text3,
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: number;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  width,
}: ModalProps) {
  const content: CSSProperties = width
    ? { ...contentStyle, width: `min(${width}px, calc(100vw - 32px))` }
    : contentStyle;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-overlay style={overlayStyle} />
        <Dialog.Content style={content} aria-describedby={description ? undefined : undefined}>
          <Dialog.Title style={titleStyle}>{title}</Dialog.Title>
          {description && <Dialog.Description style={descStyle}>{description}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

Modal.Close = Dialog.Close;
