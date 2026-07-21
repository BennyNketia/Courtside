// SSE frame parser for a ReadableStream<Uint8Array>. Yields one
// {event, data} object per complete SSE event (delimited by a blank
// line). Comments (":..." lines) are skipped. Multi-line `data:` fields
// are joined with a single "\n" per the spec.
//
// The runtime writes typed events with a `event:` line and a `data:`
// JSON payload; nothing here is spec-exotic — the reader pattern
// matches what SPEC calls out for the client. The parser is
// intentionally decoupled from the Courtside event shapes so the same
// helper stays useful if we ever add non-agent SSE endpoints.

export type SseFrame = {
  event: string | null;
  data: string;
  id: string | null;
};

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let event: string | null = null;
  let data = '';
  let id: string | null = null;

  const flush = (): SseFrame | null => {
    if (event === null && data === '') return null;
    // The spec says to strip a single trailing \n from the accumulated
    // data buffer.
    const trimmed = data.endsWith('\n') ? data.slice(0, -1) : data;
    return { event, data: trimmed, id };
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Any half-formed frame gets a chance to emit before we exit.
        buffer += '';
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let lineEnd: number;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const rawLine = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        // Handle CRLF too.
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        if (line === '') {
          const frame = flush();
          if (frame) yield frame;
          event = null;
          data = '';
          id = null;
          continue;
        }
        if (line.startsWith(':')) continue; // comment
        const idx = line.indexOf(':');
        const field = idx === -1 ? line : line.slice(0, idx);
        const rawValue = idx === -1 ? '' : line.slice(idx + 1);
        // Per spec, a single leading space is stripped.
        const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

        switch (field) {
          case 'event':
            event = value;
            break;
          case 'data':
            data += value + '\n';
            break;
          case 'id':
            id = value;
            break;
          default:
            // ignore unknown fields (`retry`, custom names, etc.)
            break;
        }
      }
    }
    // Flush a trailing frame if the stream closed without a blank line.
    const tail = flush();
    if (tail) yield tail;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader may be locked or already released; nothing to do.
    }
  }
}
