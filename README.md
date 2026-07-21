# Courtside 🏀 — an agentic NBA analytics platform

> An AI agent that answers open-ended basketball questions by orchestrating tools from a self-authored MCP server — with full run traces, scheduled digests, and a published evaluation: **[X]% tool-selection accuracy** across a 40-question benchmark (up from [Y]% baseline — [iteration log](eval/REPORT.md)).

**[Live demo](https://…)** · **[Trace viewer](https://…)** · **[Eval report](eval/REPORT.md)** · **[Architecture](docs/ARCHITECTURE.md)**

![demo](docs/demo.gif)
*(GIF: a question streaming in, tool-call chips lighting up as the agent works)*

## What it is

Three independently deployed tiers, TypeScript end to end, running entirely on free infrastructure:

1. **MCP tool server** — 8 NBA analytics tools (including composite tools like `compare_players`) behind Anthropic's Model Context Protocol, with a cached, rate-limited data client. Works with any MCP client — including Claude Desktop.
2. **Agent runtime** — an Express service hosting a LangGraph ReAct agent over the discovered tools: SSE streaming, cron-scheduled digest jobs, per-IP rate limiting, Gemini→Groq provider fallback, and a full persisted trace of every run.
3. **React client** — streaming chat, jobs dashboard, and a step-by-step **trace viewer** for replaying any run's reasoning, tool calls, latencies, and token ledger.

## Why it's built this way

The tool layer and the agent layer communicate **only over the MCP protocol** — the runtime knows nothing about basketball. Proof: adding a second tool server is a config entry, not a code change. Design rationale and trade-offs are recorded as [ADRs](docs/ARCHITECTURE.md#architecture-decision-records) (why an MCP server over in-process tools, why SSE over WebSockets, why Gemini-with-Groq-fallback, …).

## Evaluation

The agent is benchmarked on a 40-question dataset across 5 categories (lookup, comparison, standings, multi-step chains, out-of-scope refusal), scored from its stored traces. Methodology in [EVALUATION.md](docs/EVALUATION.md); numbers and the change-by-change iteration log in [eval/REPORT.md](eval/REPORT.md). CI runs a smoke eval on every PR.

| Metric | Baseline | Current |
|---|---|---|
| Tool-selection accuracy | [Y]% | **[X]%** |
| Task completion | —% | **—%** |
| Efficiency (min/actual tool calls) | — | — |

## Run it locally

```bash
git clone … && cd courtside
cp .env.example .env        # add free keys: balldontlie, Gemini, Groq
npm install
npm run dev                 # starts mcp-server, runtime, client
npm run eval                # full benchmark → eval/REPORT.md
```

## Honest limitations

Free-tier LLMs are rate-limited (the runtime queues and falls back Gemini→Groq rather than failing); Render free services cold-start after idle (the `/health` endpoint doubles as a wake call); NBA data is stitched from free sources (balldontlie free tier + stats.nba.com + ESPN) behind a cached, header-aware, pre-warmed client, since no single free source covers everything. Rationale and trade-offs in [ARCHITECTURE.md](docs/ARCHITECTURE.md) (ADR-007).

## Stack

TypeScript · `@modelcontextprotocol/sdk` · LangGraph.js · `@langchain/mcp-adapters` · Gemini Flash / Groq · Express · Prisma (SQLite→Neon) · React + Vite · Vitest · GitHub Actions · Render + Vercel
