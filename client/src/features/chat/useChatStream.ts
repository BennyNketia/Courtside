import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatEvent } from './chatScript';
import type { AssistantMessage, Message, MessageSegment, TextSegment, ToolSegment } from './types';

function appendToLastText(segments: MessageSegment[], text: string): MessageSegment[] {
  const last = segments[segments.length - 1];
  if (last && last.kind === 'text') {
    const updated: TextSegment = { kind: 'text', text: last.text + text };
    return [...segments.slice(0, -1), updated];
  }
  return [...segments, { kind: 'text', text }];
}

function nextId(): string {
  return `m_${Math.floor(performance.now() * 1000)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  const clearTimers = () => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const stop = useCallback(() => {
    clearTimers();
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.role === 'assistant' && m.streaming ? { ...m, streaming: false } : m,
      ),
    );
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setStreaming(false);
    setMessages([]);
  }, []);

  const send = useCallback((prompt: string, script: ChatEvent[]) => {
    if (!prompt.trim()) return;
    clearTimers();

    const userId = nextId();
    const assistantId = nextId();
    const assistant: AssistantMessage = {
      id: assistantId,
      role: 'assistant',
      segments: [],
      streaming: true,
    };
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: prompt.trim() },
      assistant,
    ]);
    setStreaming(true);

    const apply = (fn: (m: AssistantMessage) => AssistantMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId && m.role === 'assistant' ? fn(m) : m)),
      );
    };

    script.forEach((ev) => {
      const handle = window.setTimeout(() => {
        if (ev.type === 'append') {
          apply((m) => ({ ...m, segments: appendToLastText(m.segments, ev.text) }));
        } else if (ev.type === 'tool_start') {
          const chip: ToolSegment = {
            kind: 'tool',
            toolCallId: ev.toolCallId,
            tool: ev.tool,
            state: 'pending',
          };
          apply((m) => ({ ...m, segments: [...m.segments, chip] }));
        } else if (ev.type === 'tool_end') {
          apply((m) => ({
            ...m,
            segments: m.segments.map((s) =>
              s.kind === 'tool' && s.toolCallId === ev.toolCallId
                ? { ...s, state: ev.failed ? 'failed' : 'done', latencyMs: ev.latencyMs }
                : s,
            ),
          }));
        } else if (ev.type === 'done') {
          apply((m) => ({ ...m, streaming: false }));
          setStreaming(false);
        }
      }, ev.at);
      timeoutsRef.current.push(handle);
    });
  }, []);

  return { messages, streaming, send, stop, reset };
}
