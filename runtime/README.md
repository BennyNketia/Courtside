# @courtside/runtime — agent runtime (Tier 2)

Express service that connects to the MCP server, runs a LangGraph ReAct agent
over the discovered tools, streams typed SSE events to the client, and
persists every run trace (success or failure) via Prisma.

## Endpoints (Sprint 2)

| Route | Description |
|---|---|
| `POST /agent/run` | Body `{ question: string }`. Streams typed SSE events (`token`, `tool_call`, `tool_result`, `error`, `done`). |
| `GET /health` | Liveness — reports the configured MCP URL. |

Scheduling (`/agent/schedule`, `/jobs`), history (`/runs`), and the client
land in later sprints — the DB schema for them ships now so migrations don't
churn.

## Quickstart (local, two terminals)

```bash
# terminal 1 — MCP server
cd mcp-server && npm run build && node dist/index.js

# terminal 2 — runtime
cd runtime
cp .env.example .env  # add GEMINI_API_KEY and/or GROQ_API_KEY
DATABASE_URL='file:./dev.db' npx prisma migrate deploy
npm run build && node dist/index.js
```

## Demo

The single command that shows the whole system working:

```bash
curl -N -X POST http://localhost:3002/agent/run \
  -H 'content-type: application/json' \
  -d '{"question":"What team does Stephen Curry play for?"}'
```

You'll see typed SSE events stream in order:

```
event: tool_call     data: { name: "search_players", args: { name: "Curry" }, ... }
event: tool_result   data: { name: "search_players", result: { players: [...] }, ok: true }
event: token         data: { content: "Stephen Curry plays for the Golden State Warriors." }
event: done          data: { runId: "…", status: "completed", model: "gemini-flash-latest", tokensIn, tokensOut, latencyMs }
```

## Failure test (Sprint 2 Definition of Done)

Kill the MCP server mid-run and the runtime must survive with a persisted
partial trace:

```bash
curl -N -X POST http://localhost:3002/agent/run \
  -H 'content-type: application/json' \
  -d '{"question":"Compare LeBron and Curry for 2024."}' &
sleep 3
# Kill only the MCP listener (its connection socket is on 3001 too, but the
# listener is what matters).
lsof -sTCP:LISTEN -ti:3001 | xargs kill

# Runtime stays up:
curl http://localhost:3002/health
```

The SSE stream ends with either an `error` event followed by `done` (typical
when connectMcp fails at request start) or with `token`/`done` where the model
honestly reports it could not fetch data (when MCP dies after the tools loaded).
Either way, a trace row lands in the `Run` table and the service continues
serving other traffic.

## Configuration

All via env — see `.env.example`. Notable knobs:

- `GEMINI_API_KEY` + `GEMINI_MODEL` — primary LLM (`gemini-flash-latest`).
- `GROQ_API_KEY` + `GROQ_MODEL` — automatic fallback on retryable errors
  (429 / quota / auth / network). If only one key is set, that provider runs
  alone.
- `AGENT_MAX_ITERATIONS=8`, `AGENT_TIMEOUT_MS=60000` — hard caps.
- `RATE_LIMIT_MAX=10` per `RATE_LIMIT_WINDOW_MS=60000` per IP on `/agent/run`.
- `MCP_SERVER_URL` and `MCP_CONNECT_TIMEOUT_MS` — where and how patiently we
  discover tools.
- `CLIENT_ORIGIN` — CORS allow-list (single origin).

## Trace shape (persisted per run)

```
Run  { id, jobId?, question, status, model, tokensIn, tokensOut, latencyMs,
       answer?, error?, createdAt, finishedAt? }
Step { id, runId, idx, type: 'model'|'tool_call'|'tool_result'|'error',
       name?, argsJson?, resultJson?, latencyMs, createdAt }
```

Every ReAct run persists — including runs that end in `error`, `timeout`, or
`max_iterations`. The trace is the substrate for the live SSE stream, the
future trace viewer, and the eval harness (see SPEC).

## Notes

- **Tool schema sanitization.** Gemini's function-calling schema rejects
  modern JSON-Schema keywords like `exclusiveMinimum` that Zod v4 emits from
  `.int()`/`.positive()`. Every MCP tool goes through
  [`agent/gemini-schema.ts`](src/agent/gemini-schema.ts) before being handed
  to the LLM. The sanitized schema is still valid JSON Schema — it's just
  the strict OpenAPI 3 subset both Google and OpenAI providers accept.
- **Fallback semantics.** We only try the fallback model if the primary
  errored BEFORE the client saw any streamed token, and the error is
  classified as retryable. A partial answer never gets a second, jarring
  restart.
- **Rate-limit trade-off.** The per-IP limiter runs BEFORE zod validation,
  which means malformed requests still consume budget. That's intentional:
  cheap tarpit for anyone hitting the endpoint in a loop.
