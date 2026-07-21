# DESIGN.md — Courtside design system

A dark, developer-console aesthetic for an agentic analytics tool. Synthesized from three references:
- **Linear** — the base: near-black layered surfaces, indigo accent, compact type, agent-native structure.
- **Vercel (Geist)** — the discipline: shadow-as-border instead of visible borders, restraint, and the semantic status-badge system (used here for tool-call chips and run states).
- **Stripe** — the data legibility: tables, numeric alignment, and first-class monospace for stats, tokens, and trace JSON.

Guiding principle (from all three): **the design disappears so the agent's reasoning is the thing people notice.** Dark, quiet, precise. No gradients, no glow, no decoration.

---

## 1. Design tokens

### Color — dark foundation (Linear)

```css
:root {
  /* Surfaces */
  --bg-0: #08090A;   /* app canvas */
  --bg-1: #0F1011;   /* panels, cards */
  --bg-2: #141516;   /* elevated containers, table headers */
  --bg-3: #1C1C1F;   /* embedded panels, hover surfaces */
  --bg-4: #232326;   /* menus, popovers, modals */

  /* Text */
  --text-1: #F7F8F8; /* primary */
  --text-2: #D0D6E0; /* secondary UI text */
  --text-3: #8A8F98; /* metadata, helper */
  --text-4: #62666D; /* muted labels */

  /* Accent — indigo (primary actions, focus) */
  --accent:        #5E6AD2;
  --accent-hover:  #828FFF;
  --accent-active: #7070FF;

  /* Semantic (agent + run states) */
  --agent:   #00B8CC; /* AI/tool activity (teal) */
  --success: #27A644; /* completed */
  --warning: #F0BF00; /* timeout / at-risk */
  --error:   #EB5757; /* error / destructive */
  --info:    #4EA7FC; /* info */
  --court:   #FC7840; /* brand warm — LOGO ONLY, never UI */

  /* Borders — shadow-as-border (Vercel), plus solid where needed */
  --border-hairline: rgba(255,255,255,0.06);
  --border-strong:   rgba(255,255,255,0.10);
  --border-solid:    #23252A;
}
```

### Typography

```css
--font-sans: "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", "Berkeley Mono", "JetBrains Mono", ui-monospace, "SF Mono", monospace;
```

Use **mono for everything numeric or machine**: stat values, scores, token counts, latencies, tool names, args/results JSON. This is the Stripe move — it makes data read as data.

| Element | Size | Weight | Tracking | Color |
|---|---|---|---|---|
| Page title | 28px | 590 | -0.022em | `--text-1` |
| Section title | 20px | 590 | -0.02em | `--text-1` |
| Card title | 16px | 590 | -0.012em | `--text-1` |
| Body | 15px | 400 | -0.011em | `--text-2` |
| Small | 14px | 400 | -0.013em | `--text-3` |
| Label | 13px | 510 | -0.01em | `--text-2` |
| Micro | 12px | 510 | 0 | `--text-4` |
| Mono (data) | 13px | 400 | 0 | `--text-2` |

Weights: 400 regular, 510 medium (labels/controls), 590 semibold (titles/CTAs). Never heavier. Sentence case everywhere.

### Spacing, radius, elevation

```css
/* Spacing (compact) */
--sp-1:4px; --sp-2:6px; --sp-3:8px; --sp-4:12px; --sp-5:16px; --sp-6:20px; --sp-7:24px; --sp-8:32px; --sp-9:48px;

/* Radius: 8 controls, 12 cards, 16 panels, pill for chips/badges */
--r-control:8px; --r-card:12px; --r-panel:16px; --r-pill:9999px;

/* Shadow-as-border + restrained elevation */
--elev-border: 0 0 0 1px var(--border-hairline);
--elev-low:    0 0 0 1px var(--border-hairline), 0 1px 4px -1px rgba(0,0,0,0.3);
--elev-high:   0 0 0 1px var(--border-strong),  0 7px 32px rgba(0,0,0,0.45); /* popovers, modals only */
```

Rule (Vercel): prefer border contrast before shadow. Shadows are for floating UI only, never routine cards.

---

## 2. Core components

### Buttons

```css
.btn { height:36px; padding:0 14px; border-radius:var(--r-control); font:590 14px/1 var(--font-sans);
       border:none; cursor:pointer; transition:background 150ms ease, transform 100ms ease; }
.btn:active { transform:scale(0.98); }

.btn-primary   { background:var(--accent); color:#fff; box-shadow:var(--elev-border); }
.btn-primary:hover { background:var(--accent-hover); }

.btn-secondary { background:rgba(255,255,255,0.04); color:var(--text-1); box-shadow:0 0 0 1px var(--border-strong); }
.btn-secondary:hover { background:rgba(255,255,255,0.07); }

.btn-ghost     { background:transparent; color:var(--text-3); }
.btn-ghost:hover { background:rgba(255,255,255,0.05); color:var(--text-1); }

.btn-danger    { background:transparent; color:var(--error); box-shadow:0 0 0 1px rgba(235,87,87,0.4); }
.btn-danger:hover { background:rgba(235,87,87,0.12); }
```

### Input / textarea

```css
.input { background:rgba(255,255,255,0.03); color:var(--text-1); border:none;
         box-shadow:0 0 0 1px var(--border-strong); border-radius:var(--r-control);
         min-height:40px; padding:0 12px; font:400 15px var(--font-sans); }
.input::placeholder { color:var(--text-3); }
.input:focus { outline:none; box-shadow:0 0 0 1px var(--accent), 0 0 0 3px rgba(94,106,210,0.25); }
```

### Card / panel

```css
.card  { background:var(--bg-1); border-radius:var(--r-card); padding:var(--sp-7); box-shadow:var(--elev-border); }
.panel { background:var(--bg-1); border-radius:var(--r-panel); box-shadow:var(--elev-border); }
```

### Badges & chips (Vercel status system)

```css
.badge { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 10px;
         border-radius:var(--r-pill); font:510 12px var(--font-sans); }
.badge .dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
.badge .dot.pulse { animation:pulse 1.5s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

/* Run-status variants (tint = 12% of the semantic color) */
.badge-completed { color:var(--success); background:rgba(39,166,68,0.12); }
.badge-running   { color:var(--agent);   background:rgba(0,184,204,0.12); }   /* dot.pulse */
.badge-timeout   { color:var(--warning); background:rgba(240,191,0,0.12); }
.badge-error     { color:var(--error);   background:rgba(235,87,87,0.12); }
```

### Tool-call chip (the signature element)

The inline marker that appears in a streaming answer as the agent reaches for a tool. Mono tool name, animated while pending, latency badge on resolve.

```css
.tool-chip { display:inline-flex; align-items:center; gap:8px; height:26px; padding:0 8px 0 10px;
             border-radius:var(--r-pill); background:rgba(0,184,204,0.10);
             box-shadow:0 0 0 1px rgba(0,184,204,0.25); font:400 12px var(--font-mono); color:var(--agent); }
.tool-chip .name { color:var(--text-2); }
.tool-chip.done    { background:rgba(39,166,68,0.10); box-shadow:0 0 0 1px rgba(39,166,68,0.25); color:var(--success); }
.tool-chip.failed  { background:rgba(235,87,87,0.10); box-shadow:0 0 0 1px rgba(235,87,87,0.25); color:var(--error); }
.tool-chip .lat { font-size:11px; color:var(--text-4); }   /* e.g. "142ms" */
```

### Data table (Stripe legibility)

```css
.table { width:100%; border-collapse:collapse; }
.table th { background:var(--bg-2); color:var(--text-3); font:510 13px var(--font-sans); text-align:left; padding:10px 14px; }
.table td { padding:12px 14px; font:400 14px var(--font-sans); color:var(--text-2); border-bottom:1px solid var(--border-hairline); }
.table td.num { font-family:var(--font-mono); text-align:right; color:var(--text-1); }   /* numeric cells */
.table tr:hover td { background:rgba(255,255,255,0.02); }
```

### JSON / trace block

```css
.json { background:var(--bg-0); color:var(--text-2); border-radius:var(--r-control);
        box-shadow:var(--elev-border); padding:14px; font:400 13px/1.5 var(--font-mono);
        overflow-x:auto; }   /* collapsible: default clamp to 6 lines, click to expand */
```

---

## 3. Screens & components (the frontend brief)

App is dark-only. Shell = left sidebar + main content.

### App shell
- **Sidebar (240px, `--bg-1`):** brand lockup `Courtside 🏀` (the one place `--court` orange appears); nav items `Chat`, `Dashboard` (ghost style, active = `rgba(255,255,255,0.05)`); footer = health dot (green/red from `GET /health`) + active model label (`gemini-flash`) in mono.
- **Main (`--bg-0`):** routed page content, max-width ~1100px for dashboard, full-height flex for chat.

### Screen 1 — Chat (the demo)
Components: `MessageList`, `UserMessage`, `AssistantMessage` (streaming), `ToolChip`, `ChatInput`, `ExamplePrompts`, `EmptyState`.
- **Empty state:** centered brand + 3 example prompt chips → `Compare LeBron and Curry this season`, `Who leads the East?`, `Top 5 in assists this year`. Clicking one fills the input and sends.
- **Transcript:** user messages right-aligned in a subtle `--bg-3` bubble; assistant messages full-width on `--bg-0`, streaming token-by-token. Tool chips render inline in the assistant turn as it works (pending → done/failed with latency).
- **Header actions:** `New chat` (ghost).
- **Input bar (sticky bottom):** `.input` textarea (auto-grow) + `Send` (`.btn-primary`, disabled while streaming, shows a stop affordance).
- **Buttons/actions → endpoints:** Send / example chip → `POST /agent/run` (SSE); New chat → client-only reset.

### Screen 2 — Dashboard
Components: `PageHeader`, `JobsTable`, `NewDigestModal`, `RunsTable`, `StatusBadge`.
- **Header:** title `Digests` + `New digest` (`.btn-primary`).
- **Jobs table:** columns `Prompt` · `Schedule` (mono cron, human-readable tooltip) · `Created` (relative) · `Actions`. Row actions: `Run now` (`.btn-ghost`), `Cancel` (`.btn-danger` → confirm modal).
- **New digest modal:** prompt textarea + schedule preset `<select>` (`Nightly 8am ET`, `Weekday mornings`, `Custom cron…`) + `Create` (`.btn-primary`) / `Cancel` (`.btn-secondary`).
- **Recent runs table:** columns `Question` · `Status` (`.badge-*`) · `Model` (mono) · `Tokens` (mono, `.num`) · `Latency` (mono, `.num`) · `When`. Whole row clickable → Trace viewer.
- **Buttons/actions → endpoints:** New digest / Create → `POST /agent/schedule`; Cancel → `DELETE /jobs/:id`; Run now → `POST /agent/run`; runs list → `GET /runs`; row click → `GET /runs/:id`.

### Screen 3 — Trace viewer (route or full-screen modal)
Components: `TraceHeader`, `StepList`, `StepItem`, `JsonBlock`, `TokenLedger`.
- **Header:** the question, a `StatusBadge`, and a mono totals row → model · total tokens · total latency.
- **Step list (vertical timeline):** each step is one of:
  - `reasoning` — the model's text turn (body text).
  - `tool_call` — `ToolChip` + collapsible `.json` of args.
  - `tool_result` — collapsible `.json` of the result + latency badge; error results tinted red.
- **Token ledger:** compact side/footer panel — per-step tokens + running total (the "$0 cost, and I can prove it" artifact), all mono.
- **Buttons/actions:** `Copy` on any JSON block (ghost); `Back to dashboard`.

### Shared components
`Button` (4 variants), `Input`/`Textarea`, `Card`/`Panel`, `Badge`, `ToolChip`, `Table`, `JsonBlock`, `Modal` (uses `--elev-high`, `--bg-4`), `Spinner` (thin, `--accent`), `EmptyState`, `HealthDot`.

### Motion
Fast and quiet (Linear/Vercel): 150ms ease on hover/color, 100ms on press (`scale(0.98)`). Streaming text appends smoothly; tool chips fade in. Nothing over 200ms. Respect `prefers-reduced-motion`.

---

## 4. Prompt for the building Claude

```txt
Build the Courtside frontend (React + Vite + TypeScript) to this design system:
dark-only, Linear-style — near-black layered surfaces (#08090A canvas, #0F1011 panels),
Inter for text, a monospace (Geist Mono) for ALL numbers/scores/tokens/latencies/tool names/JSON.
Indigo #5E6AD2 primary actions; teal #00B8CC for agent/tool activity; green/red/yellow for
run statuses. Use shadow-as-border (box-shadow 0 0 0 1px rgba(255,255,255,0.06)) instead of
visible borders; shadows only on modals/popovers. Radius 8 controls, 12 cards, pill chips.
Compact spacing, sentence case, no gradients/glow/decoration. Build three screens behind a
240px sidebar shell: Chat (streaming transcript with inline animated tool-call chips + latency
badges), Dashboard (jobs table + new-digest modal + runs table with status badges), and Trace
viewer (step-by-step reasoning/tool_call/tool_result timeline with collapsible JSON and a token
ledger). Keep chrome minimal — the agent's reasoning is the focus, not the UI.
```

---

## 5. Figma prompt

Paste into Figma Make / First Draft (or any AI design tool) to generate the mockups:

```txt
Design a dark-themed web app called "Courtside" — an AI agent that answers NBA analytics
questions by calling tools. Aesthetic: a premium developer console like Linear — near-black
layered backgrounds (#08090A page, #0F1011 panels, #1C1C1F elevated), bright text (#F7F8F8),
muted secondary text (#8A8F98), a single indigo accent (#5E6AD2) for primary actions, and a
teal (#00B8CC) for AI/tool activity. Use Inter for UI text and a monospace font for all numbers,
tokens, and code. Borders are ultra-subtle (1px rgba white 6%); no gradients, no glow, generous
but disciplined spacing, 8px control radius, 12px card radius, pill-shaped status chips.

Create these screens, all sharing a 240px left sidebar (brand "Courtside", nav: Chat, Dashboard,
a green health dot + model name at the bottom):

1) CHAT — a chat interface. Empty state: centered app name + three example prompt chips
   ("Compare LeBron and Curry this season", "Who leads the East?", "Top 5 in assists"). Active
   state: a transcript with a right-aligned user message and a full-width AI answer, with small
   inline "tool-call chips" (monospace, teal, e.g. "compare_players 142ms") showing the agent
   using tools. Sticky bottom input with a textarea and an indigo "Send" button.

2) DASHBOARD — a "Digests" page. An indigo "New digest" button, a table of scheduled jobs
   (Prompt, Schedule, Created, actions: Run now / Cancel), and a "Recent runs" table (Question,
   Status pill [green completed / red error / yellow timeout], Model, Tokens, Latency, When).
   Include a "New digest" modal: prompt textarea, schedule preset dropdown, Create/Cancel.

3) TRACE VIEWER — a run detail page. Header with the question, a status pill, and a monospace
   totals row (model · total tokens · total latency). Below, a vertical timeline of steps:
   reasoning text, tool-call chips with collapsible JSON args, and tool-result JSON blocks with
   latency badges. A compact "token ledger" panel on the side.

Buttons to include across the app: Send, New chat, example-prompt chips, New digest, Create,
Cancel (danger/red), Run now, Copy (on JSON), and the two sidebar nav items. Keep it minimal,
precise, and quiet — the content is the star.
```
