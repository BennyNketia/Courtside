import { CSSProperties, useMemo, useState } from 'react';
import { colors, fonts, motion, radii, shadows } from '../theme';

interface JsonBlockProps {
  value: unknown;
  collapsedLines?: number;
}

export function JsonBlock({ value, collapsedLines = 6 }: JsonBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(() => {
    try {
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const lines = pretty.split('\n');
  const isTruncated = lines.length > collapsedLines;
  const visible = expanded || !isTruncated ? pretty : lines.slice(0, collapsedLines).join('\n');
  const remaining = lines.length - collapsedLines;

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    background: colors.bg0,
    color: colors.text2,
    borderRadius: radii.control,
    boxShadow: shadows.elevBorder,
    fontFamily: fonts.mono,
    fontSize: 12.5,
    lineHeight: 1.55,
    overflow: 'hidden',
  };

  const preStyle: CSSProperties = {
    margin: 0,
    padding: '12px 14px',
    paddingRight: 60,
    overflowX: 'auto',
    color: colors.text2,
    fontFamily: fonts.mono,
    fontSize: 12.5,
    lineHeight: 1.55,
    whiteSpace: 'pre',
  };

  const copyBtnStyle: CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 8,
    height: 22,
    padding: '0 8px',
    background: 'rgba(255, 255, 255, 0.04)',
    color: colors.text3,
    border: 'none',
    boxShadow: shadows.elevBorder,
    borderRadius: radii.control,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 510,
    cursor: 'pointer',
    transition: `background ${motion.base}, color ${motion.base}`,
  };

  const expandBtnStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.02)',
    color: colors.text3,
    border: 'none',
    borderTop: `1px solid ${colors.borderHairline}`,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 510,
    textAlign: 'left',
    cursor: 'pointer',
    transition: `background ${motion.base}, color ${motion.base}`,
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        style={copyBtnStyle}
        onClick={onCopy}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.color = colors.text1;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.color = colors.text3;
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre style={preStyle}>{visible}</pre>
      {isTruncated && (
        <button
          type="button"
          style={expandBtnStyle}
          onClick={() => setExpanded((v) => !v)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            e.currentTarget.style.color = colors.text1;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
            e.currentTarget.style.color = colors.text3;
          }}
        >
          {expanded ? 'Collapse' : `Show ${remaining} more line${remaining === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}
