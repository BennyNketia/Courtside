# Courtside — client

React 18 + Vite + TypeScript. Dark, quiet, developer-console aesthetic per [`docs/DESIGN.md`](../docs/DESIGN.md).

Currently runs against **mock data**. When the runtime lands (Phase 3), the streaming simulation in `src/features/chat/useChatStream.ts` swaps for SSE.

## Commands

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build
npm run typecheck
```

## Structure

```
src/
  theme.ts                 # design tokens (colors, radii, fonts, motion)
  styles/                  # tokens.css + global.css
  components/              # Button, Textarea, StatusBadge, ToolChip,
                           # JsonBlock, HealthDot, Sidebar
  features/
    chat/                  # streaming chat + CHAT_SCRIPT simulator
    dashboard/             # jobs + runs tables, New digest modal
    traces/                # timeline + JSON blocks + token ledger
  mock/data.ts             # jobs, runs, trace fixtures
```

## Notes

- Design tokens live in `src/theme.ts` (JS) and `src/styles/tokens.css` (CSS vars). Prefer the JS ones from React components; the CSS vars are for globals only.
- `--court` orange is only used on the brand mark and the empty-state 🏀.
- All numeric/mono content uses Geist Mono; UI text uses Inter.
- `prefers-reduced-motion` is respected globally in `tokens.css`.
