import { CSSProperties, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { ToolChip } from '../../components/ToolChip';
import { colors, fonts, motion, radii, shadows } from '../../theme';
import { TRACE_COMPARE, type RunTrace, type TraceStep } from '../../mock/data';

const pageStyle: CSSProperties = {
  padding: '20px 40px 48px',
  maxWidth: 1160,
  margin: '0 auto',
  width: '100%',
};

const backRowStyle: CSSProperties = {
  marginBottom: 18,
};

const backBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  border: 'none',
  color: colors.text3,
  fontFamily: fonts.sans,
  fontSize: 13,
  fontWeight: 510,
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: radii.control,
  transition: `background ${motion.base}, color ${motion.base}`,
};

const headerStyle: CSSProperties = {
  marginBottom: 24,
};

const questionStyle: CSSProperties = {
  margin: 0,
  fontFamily: fonts.sans,
  fontSize: 22,
  fontWeight: 590,
  letterSpacing: '-0.02em',
  color: colors.text1,
};

const totalsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginTop: 10,
  flexWrap: 'wrap',
};

const totalsMono: CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 12.5,
  color: colors.text3,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const totalsDivider: CSSProperties = {
  width: 2,
  height: 2,
  borderRadius: '50%',
  background: colors.text4,
  display: 'inline-block',
};

const bodyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 210px',
  gap: 32,
  alignItems: 'flex-start',
};

const timelineStyle: CSSProperties = {
  position: 'relative',
  paddingLeft: 22,
};

const ledgerStyle: CSSProperties = {
  position: 'sticky',
  top: 24,
  background: colors.bg1,
  borderRadius: radii.card,
  boxShadow: shadows.elevBorder,
  padding: 16,
};

const ledgerHead: CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: 11,
  fontWeight: 510,
  letterSpacing: '0.02em',
  color: colors.text3,
  textTransform: 'uppercase',
  marginBottom: 12,
};

const ledgerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '6px 0',
  fontFamily: fonts.mono,
  fontSize: 12,
  color: colors.text3,
  borderBottom: `1px solid ${colors.borderHairline}`,
};

const ledgerTotal: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '10px 0 2px',
  marginTop: 6,
  fontFamily: fonts.mono,
  fontSize: 13,
  color: colors.text1,
  fontWeight: 500,
};

export function TraceScreen() {
  const navigate = useNavigate();
  const trace: RunTrace = TRACE_COMPARE;

  const [backHover, setBackHover] = useState(false);

  return (
    <div style={pageStyle}>
      <div style={backRowStyle}>
        <button
          type="button"
          style={{
            ...backBtnStyle,
            background: backHover ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
            color: backHover ? colors.text1 : colors.text3,
          }}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          onClick={() => navigate('/dashboard')}
        >
          <span aria-hidden>←</span> Back to dashboard
        </button>
      </div>

      <header style={headerStyle}>
        <h1 style={questionStyle}>{trace.question}</h1>
        <div style={totalsRowStyle}>
          <StatusBadge status={trace.status} />
          <span style={totalsMono}>{trace.model}</span>
          <span style={totalsDivider} />
          <span style={totalsMono}>{trace.totalTokens.toLocaleString()} tok</span>
          <span style={totalsDivider} />
          <span style={totalsMono}>{formatLatency(trace.totalLatencyMs)}</span>
        </div>
      </header>

      <div style={bodyStyle}>
        <section style={timelineStyle}>
          <SpineLine />
          {trace.steps.map((step, i) => (
            <TimelineStep
              key={step.id}
              step={step}
              isLast={i === trace.steps.length - 1}
              index={i}
            />
          ))}
        </section>

        <aside style={ledgerStyle}>
          <div style={ledgerHead}>Token ledger</div>
          {trace.steps.map((s, i) => (
            <div key={s.id} style={ledgerRow}>
              <span>
                {String(i + 1).padStart(2, '0')} · {stepShortLabel(s)}
              </span>
              <span style={{ color: colors.text2 }}>{(s.tokens ?? 0).toLocaleString()}</span>
            </div>
          ))}
          <div style={ledgerTotal}>
            <span>Total</span>
            <span>{trace.totalTokens.toLocaleString()}</span>
          </div>
          <div style={{ ...ledgerRow, borderBottom: 'none', marginTop: 8 }}>
            <span>Cost</span>
            <span style={{ color: colors.success }}>$0.00</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SpineLine() {
  const style: CSSProperties = {
    position: 'absolute',
    left: 6,
    top: 4,
    bottom: 4,
    width: 1,
    background: colors.borderHairline,
  };
  return <span style={style} aria-hidden />;
}

function TimelineStep({ step, isLast, index }: { step: TraceStep; isLast: boolean; index: number }) {
  const rowStyle: CSSProperties = {
    position: 'relative',
    paddingBottom: isLast ? 0 : 24,
  };
  const dotColor = dotColorFor(step);
  const dotStyle: CSSProperties = {
    position: 'absolute',
    left: -22,
    top: 6,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: colors.bg0,
    boxShadow: `0 0 0 2px ${dotColor}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const dotInner: CSSProperties = {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: dotColor,
  };

  return (
    <div style={rowStyle}>
      <span style={dotStyle} aria-hidden>
        <span style={dotInner} />
      </span>
      <StepHeader step={step} index={index} />
      <StepBody step={step} />
    </div>
  );
}

function StepHeader({ step, index }: { step: TraceStep; index: number }) {
  const labelStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: step.kind === 'reasoning' ? 6 : 8,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: 510,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color: colors.text3,
  };
  const num: CSSProperties = {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.text4,
  };
  return (
    <div style={labelStyle}>
      <span style={num}>{String(index + 1).padStart(2, '0')}</span>
      <span>{stepLongLabel(step)}</span>
      {typeof step.latencyMs === 'number' && step.kind === 'tool_result' && (
        <LatencyPill ms={step.latencyMs} error={step.error} />
      )}
    </div>
  );
}

function StepBody({ step }: { step: TraceStep }) {
  if (step.kind === 'reasoning' && step.text) {
    const style: CSSProperties = {
      fontFamily: fonts.sans,
      fontSize: 14.5,
      lineHeight: 1.65,
      color: colors.text2,
      letterSpacing: '-0.011em',
    };
    return <p style={{ ...style, margin: 0 }}>{step.text}</p>;
  }

  if (step.kind === 'tool_call') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ToolChip name={step.tool ?? 'tool'} state="pending" />
        {step.args && <JsonBlock value={step.args} />}
      </div>
    );
  }

  if (step.kind === 'tool_result') {
    return (
      <div>
        <JsonBlock value={step.result} />
      </div>
    );
  }

  return null;
}

function LatencyPill({ ms, error }: { ms: number; error?: boolean }) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 18,
    padding: '0 8px',
    borderRadius: radii.pill,
    background: error ? 'rgba(235, 87, 87, 0.10)' : 'rgba(255, 255, 255, 0.04)',
    boxShadow: error
      ? '0 0 0 1px rgba(235, 87, 87, 0.25)'
      : shadows.elevBorder,
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: error ? colors.error : colors.text3,
    textTransform: 'none',
    letterSpacing: 0,
  };
  return <span style={style}>{ms}ms</span>;
}

function stepLongLabel(step: TraceStep): string {
  switch (step.kind) {
    case 'reasoning':
      return 'Reasoning';
    case 'tool_call':
      return `Tool call · ${step.tool}`;
    case 'tool_result':
      return `Result · ${step.tool}`;
  }
}

function stepShortLabel(step: TraceStep): string {
  switch (step.kind) {
    case 'reasoning':
      return 'reason';
    case 'tool_call':
      return step.tool ?? 'call';
    case 'tool_result':
      return `${step.tool ?? 'result'}·r`;
  }
}

function dotColorFor(step: TraceStep): string {
  switch (step.kind) {
    case 'reasoning':
      return colors.text4;
    case 'tool_call':
      return colors.agent;
    case 'tool_result':
      return step.error ? colors.error : colors.success;
  }
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
