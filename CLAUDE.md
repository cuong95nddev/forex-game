# Forex Game — Agent Instructions

## Build & Dev Commands

```bash
npm run dev        # Start Vite dev server (hot reload)
npm run build      # tsc -b && vite build (type-check + production build)
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

### Database Migrations

```bash
npx supabase db push   # Apply migrations to remote Supabase project
```

Always create a new SQL file under `supabase/migrations/` with an incrementing timestamp prefix (e.g. `20260109000013_description.sql`). Never edit existing migration files.

---

## Architecture

```
src/
  pages/           # Route-level components
  components/      # Feature components + ui/ (Radix-based primitives)
  store/           # Zustand global state (useStore.ts)
  lib/             # supabase.ts (client + TS interfaces), fingerprint.ts, utils.ts
supabase/
  migrations/      # SQL migrations applied via Supabase CLI
```

**Data flow:** Supabase realtime broadcasts → Zustand store → React components.

**Key principle:** The `AdminPage` / `AdminPanel` is the "backend" — it contains the core game logic (price updates, round management, skill resolution). Player-facing pages only react to state.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React 19 + TypeScript 5 + Vite 7 |
| State | Zustand 5 |
| Backend | Supabase 2 (Postgres + Realtime + RLS) |
| UI primitives | Radix UI + Tailwind CSS 4 |
| Charts | Lightweight Charts 5 (TradingView-style) |
| Icons | Lucide React |
| Toasts | Sonner |
| Fingerprinting | FingerprintJS 5 |

---

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `users` | Players — `fingerprint`, `name`, `balance` |
| `rounds` | Betting rounds — `status` ('active'/'completed'), `allowed_users` (UUID[]), `start_price`, `end_price` |
| `bets` | Predictions — `prediction` ('up'/'down'), `bet_amount`, `result` ('pending'/'won'/'lost'), `profit` |
| `gold_prices` | Price history |
| `game_settings` | Config — `round_duration`, `win_rate`, `min_bet_amount`, `max_bet_amount`, `no_bet_penalty`, `max_round`, `game_status` |
| `skill_definitions` | Available skills (steal_money, double_win, freezer, bank_loan) |
| `user_skills` | Per-player skill inventory (quantity, cooldown) |
| `skill_signals` | Realtime skill events between players |
| `skill_usage_log` | Audit trail for skill activation |

**RLS is enabled on all tables.** When adding a new table or column, add appropriate RLS policies in the migration. When a table needs realtime, enable it explicitly in the migration (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`).

---

## Supabase Rules

- Run migrations with `npx supabase db push` (not through the dashboard SQL editor, so changes are version-controlled).
- Always include RLS policy SQL in migrations.
- Enable realtime in the migration when a new table needs live updates.
- TypeScript interfaces for all Supabase data models live in `src/lib/supabase.ts` — keep them in sync with the schema.

---

## State Management (Zustand)

`src/store/useStore.ts` is the single source of truth. Pattern:

```typescript
// Access other state slices
const { user, currentRound } = get()
// Update state
set({ field: newValue })
```

Realtime subscriptions are stored as module-level channel refs. Guard with an `if (subscriptionsActive) return` check to prevent duplicate subscriptions. Always clean up with `supabase.removeChannel()` on unmount.

---

## UI Conventions

- **Theme:** Dark — background `#0b0f13`, primary accent red (`#ef4444`), green/red for price up/down.
- **All new UI must match the trading interface aesthetic** (dark panels, Tailwind utility classes, same component library).
- Use components from `src/components/ui/` (Button, Input, Dialog, Tabs, Table, Badge, ScrollArea, etc.) rather than raw HTML elements.
- Toast feedback via Sonner: `toast.success()`, `toast.error()`, `toast.warning()`.
- Animations: Tailwind's `animate-spin/bounce/pulse` + CSS transitions.

---

## Code Conventions

- **Components:** PascalCase files and function names.
- **Functions/variables:** camelCase.
- **Interfaces:** defined in `src/lib/supabase.ts`, PascalCase.
- **Error handling:** try/catch in async functions, surface errors with Sonner toasts.
- **Before implementing any feature:** search the codebase for prior related implementations first to match patterns.

---

## Game Mechanics (quick reference)

- **Round loop:** Admin starts round → players bet up/down on gold price → round ends → results calculated using `win_rate` → balances updated.
- **No-bet penalty:** Players who miss a round lose `no_bet_penalty` from their balance.
- **Allowed users:** `rounds.allowed_users` (UUID[]) gates who can bet per round (only players online at round start).
- **Skills:** steal_money, double_win, freezer, bank_loan — each has quantity + cooldown_rounds. Activation goes through `skill_signals` table for realtime delivery.
- **Freeze:** frozen player can't bet; tracked via `skill_usage_log`, `isFrozen` / `frozenUntilRound` in store.
- **Double win:** player's next win is doubled; tracked via `hasActiveDoubleWin` in store.
