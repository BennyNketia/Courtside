import { CSSProperties, ReactNode, useState } from 'react';
import { colors, fonts, motion, radii, shadows } from '../theme';

// EmptyState — centered, quiet, one-shot component for "no data" screens.
// Callers provide the mark (usually the brand basketball), the heading,
// an optional subtitle, and any number of `chips` (label + onClick).
// Used by the Chat empty state today; the Dashboard's empty-jobs state
// can render this in a later sprint.

export interface EmptyStateChip {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  mark?: ReactNode;
  heading: string;
  sub?: string;
  chips?: EmptyStateChip[];
  padding?: string;
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 26,
};

const markStyle: CSSProperties = {
  fontSize: 40,
  lineHeight: 1,
  color: colors.court,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: fonts.sans,
  fontSize: 28,
  fontWeight: 590,
  letterSpacing: '-0.022em',
  color: colors.text1,
};

const subStyle: CSSProperties = {
  margin: 0,
  fontFamily: fonts.sans,
  fontSize: 14,
  color: colors.text3,
  textAlign: 'center',
  maxWidth: 480,
};

const chipsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 8,
  marginTop: 8,
  maxWidth: 720,
};

export function EmptyState({
  mark,
  heading,
  sub,
  chips,
  padding = '60px 0 24px',
}: EmptyStateProps) {
  return (
    <div style={{ ...wrap, padding }}>
      {mark && <span style={markStyle} aria-hidden>{mark}</span>}
      <h2 style={headingStyle}>{heading}</h2>
      {sub && <p style={subStyle}>{sub}</p>}
      {chips && chips.length > 0 && (
        <div style={chipsStyle}>
          {chips.map((c) => (
            <SuggestionChip key={c.label} label={c.label} onClick={c.onClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const style: CSSProperties = {
    height: 32,
    padding: '0 14px',
    borderRadius: radii.pill,
    border: 'none',
    background: hover ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
    boxShadow: shadows.elevBorder,
    color: hover ? colors.text1 : colors.text2,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: 510,
    letterSpacing: '-0.008em',
    cursor: 'pointer',
    transition: `background ${motion.base}, color ${motion.base}, transform ${motion.fast}`,
  };
  return (
    <button
      type="button"
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.98)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
