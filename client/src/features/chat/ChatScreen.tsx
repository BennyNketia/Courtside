import { CSSProperties, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Textarea';
import { ToolChip } from '../../components/ToolChip';
import { colors, fonts, motion, radii, shadows } from '../../theme';
import { RichText } from './RichText';
import { ASSISTS_SCRIPT, COMPARE_SCRIPT, EAST_SCRIPT, SUGGESTIONS } from './chatScript';
import type { ChatEvent } from './chatScript';
import { useChatStream } from './useChatStream';
import type { AssistantMessage, Message, UserMessage } from './types';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  minHeight: 0,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '18px 28px',
  height: 60,
  flexShrink: 0,
  boxShadow: `inset 0 -1px 0 0 ${colors.borderHairline}`,
};

const headerTitle: CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: 15,
  fontWeight: 590,
  letterSpacing: '-0.012em',
  color: colors.text1,
  margin: 0,
};

const transcriptWrap: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '32px 0 24px',
  minHeight: 0,
};

const transcriptInner: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  padding: '0 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const composerWrap: CSSProperties = {
  padding: '12px 28px 22px',
  flexShrink: 0,
  background: `linear-gradient(180deg, rgba(8,9,10,0) 0%, ${colors.bg0} 30%)`,
};

const composerInner: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  position: 'relative',
};

const sendBtnPos: CSSProperties = {
  position: 'absolute',
  right: 8,
  bottom: 8,
};

export function ChatScreen() {
  const { messages, streaming, send, stop, reset } = useChatStream();
  const [value, setValue] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const scriptFor = (prompt: string): ChatEvent[] => {
    const suggestion = SUGGESTIONS.find((s) => s.label.toLowerCase() === prompt.toLowerCase());
    if (suggestion) return suggestion.script;
    const lower = prompt.toLowerCase();
    if (lower.includes('east')) return EAST_SCRIPT;
    if (lower.includes('assist')) return ASSISTS_SCRIPT;
    return COMPARE_SCRIPT;
  };

  const submit = (text: string) => {
    if (!text.trim() || streaming) return;
    send(text.trim(), scriptFor(text));
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(value);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={headerTitle}>Chat</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            stop();
            reset();
            setValue('');
          }}
          disabled={isEmpty && !streaming}
        >
          New chat
        </Button>
      </header>

      <div ref={scrollRef} style={transcriptWrap}>
        <div style={transcriptInner}>
          {isEmpty ? (
            <EmptyState onPick={(label) => submit(label)} />
          ) : (
            messages.map((m) => <MessageRow key={m.id} message={m} />)
          )}
        </div>
      </div>

      <div style={composerWrap}>
        <div style={composerInner}>
          <Textarea
            value={value}
            autoGrow
            maxRows={6}
            placeholder="Ask about players, teams, standings…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            style={{ paddingRight: 96, minHeight: 52 }}
            disabled={streaming}
          />
          <div style={sendBtnPos}>
            {streaming ? (
              <Button variant="secondary" size="sm" onClick={stop}>
                <StopGlyph />
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!value.trim()}
                onClick={() => submit(value)}
              >
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (label: string) => void }) {
  const wrap: CSSProperties = {
    padding: '60px 0 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 26,
  };
  const mark: CSSProperties = {
    fontSize: 40,
    lineHeight: 1,
    color: colors.court,
  };
  const heading: CSSProperties = {
    margin: 0,
    fontFamily: fonts.sans,
    fontSize: 28,
    fontWeight: 590,
    letterSpacing: '-0.022em',
    color: colors.text1,
  };
  const sub: CSSProperties = {
    margin: 0,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 480,
  };
  const chips: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    maxWidth: 720,
  };
  return (
    <div style={wrap}>
      <span style={mark} aria-hidden>
        🏀
      </span>
      <h2 style={heading}>Courtside</h2>
      <p style={sub}>Ask an NBA question and watch the agent pull the numbers.</p>
      <div style={chips}>
        {SUGGESTIONS.map((s) => (
          <SuggestionChip key={s.label} label={s.label} onClick={() => onPick(s.label)} />
        ))}
      </div>
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

function MessageRow({ message }: { message: Message }) {
  return message.role === 'user' ? (
    <UserBubble message={message} />
  ) : (
    <AssistantBlock message={message} />
  );
}

function UserBubble({ message }: { message: UserMessage }) {
  const row: CSSProperties = { display: 'flex', justifyContent: 'flex-end' };
  const bubble: CSSProperties = {
    maxWidth: '75%',
    background: colors.bg3,
    color: colors.text1,
    padding: '10px 14px',
    borderRadius: radii.card,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 1.55,
    letterSpacing: '-0.011em',
    whiteSpace: 'pre-wrap',
    boxShadow: shadows.elevBorder,
  };
  return (
    <div style={row}>
      <div style={bubble}>{message.text}</div>
    </div>
  );
}

function AssistantBlock({ message }: { message: AssistantMessage }) {
  const wrap: CSSProperties = {
    width: '100%',
    color: colors.text2,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 1.65,
    letterSpacing: '-0.011em',
    padding: '2px 0',
  };
  // Determine whether to show cursor: on the last text segment while streaming.
  const lastTextIdx = useMemo(() => {
    for (let i = message.segments.length - 1; i >= 0; i--) {
      if (message.segments[i].kind === 'text') return i;
    }
    return -1;
  }, [message.segments]);

  const isEmpty = message.segments.length === 0;

  return (
    <div style={wrap}>
      {message.segments.map((seg, idx) => {
        if (seg.kind === 'text') {
          return (
            <span key={idx}>
              <RichText text={seg.text} />
              {message.streaming && idx === lastTextIdx && <StreamCursor />}
            </span>
          );
        }
        return (
          <span key={idx} style={{ margin: '0 2px' }}>
            <ToolChip name={seg.tool} state={seg.state} latencyMs={seg.latencyMs} />
          </span>
        );
      })}
      {message.streaming && isEmpty && <StreamCursor />}
    </div>
  );
}

function StreamCursor() {
  const style: CSSProperties = {
    display: 'inline-block',
    width: 8,
    height: '1.05em',
    background: colors.text1,
    marginLeft: 2,
    verticalAlign: 'text-bottom',
    animation: 'courtside-blink 1s steps(2, start) infinite',
    borderRadius: 1,
  };
  return <span aria-hidden style={style} />;
}

function StopGlyph() {
  return (
    <span
      aria-hidden
      style={{ width: 10, height: 10, background: colors.text1, borderRadius: 2, marginRight: 2 }}
    />
  );
}
