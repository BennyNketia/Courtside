import { describe, expect, it } from 'vitest';

import { TraceRecorder } from '../src/agent/trace.js';

describe('TraceRecorder', () => {
  it('captures tool calls and pairs them with results by callId', () => {
    const t = new TraceRecorder('who leads the league in points?');
    t.addToolCall('c1', 'get_league_leaders', { stat: 'pts', season: 2024 });
    t.addToolResult('c1', 'get_league_leaders', { leaders: [{ name: 'X' }] });
    t.finish({ status: 'completed', answer: 'X leads with 30 ppg.' });

    const snap = t.snapshot('gemini-2.5-flash', 100, 25);
    expect(snap.status).toBe('completed');
    expect(snap.answer).toBe('X leads with 30 ppg.');
    expect(snap.tokensIn).toBe(100);
    expect(snap.tokensOut).toBe(25);
    expect(snap.model).toBe('gemini-2.5-flash');

    const types = snap.steps.map((s) => s.type);
    expect(types).toEqual(['tool_call', 'tool_result']);
    expect(snap.steps[0]!.name).toBe('get_league_leaders');
    expect(snap.steps[1]!.name).toBe('get_league_leaders');
    // idx is monotonically increasing.
    expect(snap.steps[0]!.idx).toBe(0);
    expect(snap.steps[1]!.idx).toBe(1);
  });

  it('deduplicates tool calls by callId (LangGraph re-emits state)', () => {
    const t = new TraceRecorder('q');
    t.addToolCall('c1', 'search_players', { name: 'LeBron' });
    t.addToolCall('c1', 'search_players', { name: 'LeBron' });
    t.finish({ status: 'completed' });
    expect(t.snapshot(null, 0, 0).steps.filter((s) => s.type === 'tool_call')).toHaveLength(1);
  });

  it('records a partial trace on failure with the error string', () => {
    const t = new TraceRecorder('q');
    t.addToolCall('c1', 'get_scoreboard', { date: '2025-01-01' });
    t.finish({ status: 'error', error: 'mcp_unavailable: ECONNREFUSED' });
    const snap = t.snapshot(null, 0, 0);
    expect(snap.status).toBe('error');
    expect(snap.answer).toBeNull();
    expect(snap.error).toMatch(/ECONNREFUSED/);
    expect(snap.steps).toHaveLength(1);
  });

  it('assigns a latency to tool results based on start/end', async () => {
    const t = new TraceRecorder('q');
    t.addToolCall('c1', 'x', {});
    await new Promise((r) => setTimeout(r, 5));
    t.addToolResult('c1', 'x', {});
    t.finish({ status: 'completed' });
    const step = t.snapshot(null, 0, 0).steps.find((s) => s.type === 'tool_result');
    expect(step).toBeDefined();
    expect(step!.latencyMs).toBeGreaterThanOrEqual(1);
  });
});
