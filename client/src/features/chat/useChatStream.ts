import { useCallback, useEffect, useRef, useState } from 'react';
import { streamAgent, type AgentEvent } from '../../lib/runtime';
import type {
  AssistantMessage,
  Message,
  MessageSegment,
  TextSegment,
  ToolSegment,
} from './types';

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

export type StreamStatus = 'idle' | 'streaming' | 'error' | 'timeout' | 'completed';

export type ChatError = { message: string } | null;

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<ChatError>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolStartRef = useRef<Map<string, number>>(new Map());

  const closeAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => () => closeAbort(), [closeAbort]);

  const stop = useCallback(() => {
    closeAbort();
    setStreaming(false);
    setStatus((s) => (s === 'streaming' ? 'idle' : s));
    setMessages((prev) =>
      prev.map((m) => (m.role === 'assistant' && m.streaming ? { ...m, streaming: false } : m)),
    );
  }, [closeAbort]);

  const reset = useCallback(() => {
    closeAbort();
    toolStartRef.current.clear();
    setStreaming(false);
    setStatus('idle');
    setError(null);
    setMessages([]);
  }, [closeAbort]);

  const send = useCallback(
    async (prompt: string): Promise<void> => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      closeAbort();

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
        { id: userId, role: 'user', text: trimmed },
        assistant,
      ]);
      setStreaming(true);
      setStatus('streaming');
      setError(null);
      toolStartRef.current = new Map();

      const apply = (fn: (m: AssistantMessage) => AssistantMessage) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId && m.role === 'assistant' ? fn(m) : m)),
        );
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const ev of streamAgent(trimmed, { signal: controller.signal })) {
          handleEvent(ev, apply, toolStartRef.current, setStatus, setError);
          if (ev.type === 'done') break;
        }
      } catch (err) {
        // AbortError from user-initiated stop is not an error we need to
        // surface; other failures land here (network drop, DNS, CORS).
        const message = err instanceof Error ? err.message : String(err);
        if ((err as { name?: string })?.name !== 'AbortError') {
          setError({ message });
          setStatus('error');
        }
      } finally {
        setStreaming(false);
        apply((m) => ({ ...m, streaming: false }));
        abortRef.current = null;
      }
    },
    [closeAbort],
  );

  return { messages, streaming, status, error, send, stop, reset };
}

function handleEvent(
  ev: AgentEvent,
  apply: (fn: (m: AssistantMessage) => AssistantMessage) => void,
  toolStart: Map<string, number>,
  setStatus: (s: StreamStatus) => void,
  setError: (e: ChatError) => void,
): void {
  if (ev.type === 'token') {
    if (!ev.content) return;
    apply((m) => ({ ...m, segments: appendToLastText(m.segments, ev.content) }));
    return;
  }
  if (ev.type === 'tool_call') {
    toolStart.set(ev.callId, performance.now());
    const chip: ToolSegment = {
      kind: 'tool',
      toolCallId: ev.callId,
      tool: ev.name,
      state: 'pending',
    };
    apply((m) => ({ ...m, segments: [...m.segments, chip] }));
    return;
  }
  if (ev.type === 'tool_result') {
    const started = toolStart.get(ev.callId);
    const latencyMs = started ? Math.round(performance.now() - started) : undefined;
    toolStart.delete(ev.callId);
    apply((m) => ({
      ...m,
      segments: m.segments.map((s) => {
        if (s.kind !== 'tool' || s.toolCallId !== ev.callId) return s;
        return {
          ...s,
          state: ev.ok ? 'done' : 'failed',
          ...(latencyMs !== undefined ? { latencyMs } : {}),
        };
      }),
    }));
    return;
  }
  if (ev.type === 'error') {
    setError({ message: ev.message });
    return;
  }
  if (ev.type === 'done') {
    if (ev.status === 'completed') setStatus('completed');
    else if (ev.status === 'timeout') setStatus('timeout');
    else setStatus('error');
    return;
  }
}
