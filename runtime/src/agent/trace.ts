// Trace capture: one live in-memory record per agent run.
//
// The trace is populated from three streams of events during the run:
//   - `tool_call`  — the model asked to call a tool (fires the moment we
//                    see an AIMessage with tool_calls in the message stream)
//   - `tool_result`— that tool returned (matched by tool_call_id)
//   - `token`      — a chunk of the final answer text from the model
//
// On completion (success OR failure) the same object is serialized into
// Prisma. Failure includes: agent throw, MCP disconnect mid-run, iteration
// cap, wall-clock timeout. Nothing crashes silently — the definition of
// done for Sprint 2 requires a persisted partial trace when the MCP server
// dies mid-run.

export type StepType = 'model' | 'tool_call' | 'tool_result' | 'error';
export type RunStatus = 'completed' | 'error' | 'timeout' | 'max_iterations';

export type TraceStep = {
  idx: number;
  type: StepType;
  name?: string;
  argsJson?: string;
  resultJson?: string;
  latencyMs: number;
};

export type Trace = {
  question: string;
  status: RunStatus | 'running';
  model: string | null;
  answer: string | null;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  startedAt: number;
  finishedAt: number | null;
  steps: TraceStep[];
};

export class TraceRecorder {
  private steps: TraceStep[] = [];
  private nextIdx = 0;
  private toolCallStartedAt = new Map<string, number>();
  private toolCallSeen = new Set<string>();
  private startedAt: number;
  private finishedAt: number | null = null;
  private status: RunStatus | 'running' = 'running';
  private answer: string | null = null;
  private error: string | null = null;

  constructor(private readonly question: string) {
    this.startedAt = Date.now();
  }

  addModelStep(latencyMs: number, content: string | null): void {
    this.steps.push({
      idx: this.nextIdx++,
      type: 'model',
      latencyMs,
      ...(content !== null ? { resultJson: JSON.stringify({ content }) } : {}),
    });
  }

  addToolCall(callId: string, name: string, args: unknown): void {
    if (this.toolCallSeen.has(callId)) return;
    this.toolCallSeen.add(callId);
    this.toolCallStartedAt.set(callId, Date.now());
    this.steps.push({
      idx: this.nextIdx++,
      type: 'tool_call',
      name,
      argsJson: safeStringify(args),
      latencyMs: 0,
    });
  }

  addToolResult(callId: string, name: string, result: unknown): void {
    const startedAt = this.toolCallStartedAt.get(callId);
    const latencyMs = startedAt !== undefined ? Date.now() - startedAt : 0;
    this.toolCallStartedAt.delete(callId);
    this.steps.push({
      idx: this.nextIdx++,
      type: 'tool_result',
      name,
      resultJson: safeStringify(result),
      latencyMs,
    });
  }

  finish(opts: {
    status: RunStatus;
    answer?: string | null;
    error?: string | null;
  }): void {
    this.status = opts.status;
    this.answer = opts.answer ?? null;
    this.error = opts.error ?? null;
    this.finishedAt = Date.now();
  }

  snapshot(model: string | null, tokensIn: number, tokensOut: number): Trace {
    return {
      question: this.question,
      status: this.status,
      model,
      answer: this.answer,
      error: this.error,
      tokensIn,
      tokensOut,
      latencyMs: (this.finishedAt ?? Date.now()) - this.startedAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      steps: [...this.steps],
    };
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return JSON.stringify(String(v));
  }
}
