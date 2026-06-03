# MaestrOS — Operations Dashboard (frontend)

Operator console for a local, multi-agent AI software company. A human operator watches a fleet
of AI **crew members** (planner / engineer / QA / CEO) move tickets through a workflow
(plan → build → review → ship, with a rework loop and human approval gates) across multiple
companies — and hires, configures, pauses, and fires those agents.

This is the **real codebase** (React + TypeScript + Vite), ported from the validated HTML prototype.
It runs **standalone on bundled mock data** out of the box, and flips to a live backend with one env var.

## Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** (tokens in `tailwind.config.ts`; the neon-green terminal palette)
- **TanStack Query** — all data access (`src/lib/queries.ts`)
- **React Router v6** — routing (`src/App.tsx`)
- **@xyflow/react** (React Flow v12) — the Workflow Canvas graph
- **react-i18next** — Turkish (default) + English
- **react-markdown** + remark-gfm — ticket bodies / work products
- **axios** — live API client (`src/lib/api.ts`)
- **lucide-react**, **recharts** — available for future use

## Run

```bash
npm install
cp .env.example .env      # VITE_USE_MOCK=true by default
npm run dev               # http://localhost:5173
npm run build             # tsc + vite build
npm run typecheck         # tsc --noEmit
```

No backend needed in mock mode — the full demo (3 companies, every agent/ticket/run state) is bundled.

## Standalone ↔ live — one switch

`src/lib/queries.ts` reads `VITE_USE_MOCK`:

- `true` (default) → hooks resolve against `src/lib/mock.ts` (the ported `window.DB`, typed).
- `false` → same hooks call `src/lib/api.ts` (axios → FastAPI control plane at `VITE_API_BASE_URL`).

Components only ever import the hooks (`useTickets`, `useAgents`, …) — **they never change** between modes.
Polling is TanStack Query `refetchInterval` (2s active / 5s aggregates) with `refetchIntervalInBackground:false`.
Swap polling for SSE later inside the hooks; views stay untouched.

### Data contract
`src/lib/types.ts` is the single source of truth for every shape (Company, Agent, Phase, Ticket, Run,
AuditEvent, …). The mock and the live client both return these exact types. Wire the FastAPI responses
to match `types.ts` and the app lights up.

## i18n — localize chrome only

`src/i18n.ts` + `src/locales/{tr,en}.json`. **Turkish is the default.** Locale lives in i18next state
and the URL (`?lng=tr|en`), **never localStorage**. Toggle in the header (`LocaleSwitcher`).

**The rule, enforced throughout:** translate **chrome** (labels, buttons, headings, helper text, empty
states, relative time) — keep **backend identifiers English in every locale**: ticket/agent/run
**statuses** (`running`, `blocked`, `needs_approval`…), **roles** (`ceo/eng/qa/planner`, CEO/ENG/QA/PLAN),
**verdict decisions** (`approve/rework/escalate/ship/hold`), **providers/models** (`ollama`,
`claude-sonnet-4`…), **phase names** (`plan/build/review/ship`), and **proper nouns** (Helm, Forge, Atlas…).
Status/verdict/role **badges** render the raw enum value by design — only their surrounding captions localize.

## Layout

```
src/
  main.tsx                 entry: QueryClientProvider + BrowserRouter + i18n
  App.tsx                  routes + shared company/roster scope
  index.css                global terminal styles + Tailwind + .mos-* classes
  i18n.ts                  i18next init (TR default, ?lng= sync)
  locales/{tr,en}.json     chrome strings
  lib/
    types.ts               backend interfaces (source of truth)
    colors.ts              STATUS / ROLE / VERDICT maps (visual identity, never localized)
    helpers.ts             pure formatters + governance graph helpers (parentChain, decisionHistory…)
    mock.ts                standalone data + mock query/mutation fns (the ported window.DB)
    api.ts                 axios live client (VITE_USE_MOCK=false)
    queries.ts             TanStack hooks — the mock/live switch
  ui/Now.tsx               1s "now" context (relative time + derived verbs re-render)
  components/
    HeaderBar, StatusBadge, VerdictBadge, RoleBadge, MarkdownView,
    BudgetGauge, AgentBits (ProviderMark, AgentVerb), AgentCard, AgentEditModal,
    ApprovalCard, AuditRow, ParentChainBreadcrumb, PhaseNode, CanvasNodes (React Flow node+edge),
    atoms (FilterChip, Count, Kebab, ToolbarTitle), LocaleSwitcher
  views/
    LiveOps, Inbox, Roster, WorkflowCanvas, Tickets, TicketDetail, Audit
```

## Routes

| path | view |
|---|---|
| `/live` | Live Ops — agent-centric activity stream (2s poll, pause/resume) |
| `/inbox` | Approval Inbox — decision cards for every `needs_approval` ticket |
| `/roster` | Roster — the AI crew; hire / edit / pause / fire, budgets, chain of command |
| `/canvas` | Workflow Canvas — React Flow graph; phase glow, rework-loop edges, side panel |
| `/tickets` · `/tickets/:id` | ticket browser + detail (breadcrumb, decision history, runs, approve/reject) |
| `/audit` | Audit Browser — immutable governance log (mock; see below) |

## Notes for the live port

- **Audit log**: `/audit` reads `AuditEvent[]`. The current backend has **no `audit_log` table** — operator
  approvals/rejections, agent config changes, and budget events aren't persisted. Add the table + emit on
  those actions, then point `api.getAudit` at it. Mock events are bundled meanwhile.
- **Activity feed**: `LiveOps` synthesizes a 2s feed from templates in mock mode. Live, back it with an
  SSE/poll endpoint returning `ActivityEvent[]`.
- **Mutations**: `useUpsertAgent` / `useApproveTicket` / `useRejectTicket` already invalidate the right
  queries; in mock mode they mutate the in-memory store. Wire to `POST/PATCH /agents`,
  `/tickets/:id/approve|reject`.
- **React Flow**: nodes are non-draggable static phases; forward edges (L→R) plus custom `BranchEdge`
  curves (rework/hold loop below, escalate arc above) with verdict labels. Layout is ordinal-based.
