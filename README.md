# ğŸ¼ MaestrOS

> A local "software company" of role-playing AI agents â€” work flows through workflow phases, and every agent has its own model, budget, and human approval gate.

![Live Ops](docs/screenshots/live_ops.png)

| Roster | Tickets | Workflow Canvas |
|--------|---------|-----------------|
| ![Roster](docs/screenshots/roster.png) | ![Tickets](docs/screenshots/tickets.png) | ![Workflow Canvas](docs/screenshots/workflow_canvas.png) |

---

## What is MaestrOS?

MaestrOS is a **control plane** for running a virtual company of AI agents. Each agent has a role (CEO, Planner, Engineer, QAâ€¦), is defined by a Markdown **skill** file, and stays in character â€” ask the Planner to write code and it will hand you a spec, nothing else. Work flows **ticket-by-ticket** through a `plan â†’ build â†’ review â†’ ship` chain; if QA asks for rework it loops back to build, and the CEO gives the final approval. Budgets, approval gates, and an immutable audit log keep the whole thing governable.

Everything can run locally: mix **Ollama, Anthropic, and OpenRouter** within a single workflow. I started turning this into a personal AI platform â€” adding separate AI companies for different domains of my work, like YouTube automation and a visual-production studio.

---

## ğŸ›ï¸ Architecture â€” Three Layers

MaestrOS is a hybrid of three ideas, each forming one layer:

| Layer | Role | Inspired by |
|-------|------|-------------|
| **1 Â· Control Plane** | Per-agent model/config/budget/role, atomic ticket checkout (`SKIP LOCKED`), heartbeat scheduler, governance gates, immutable audit log | Paperclip |
| **2 Â· Behavior Engine** | Markdown **skills** as system prompts; a sprint methodology (`Think â†’ Plan â†’ Build â†’ Review â†’ Test â†’ Ship â†’ Reflect`) | gstack |
| **3 Â· Hierarchical Workflow** | YAML phase chain, verdict-aware branching, org chart (`reporting_to`), visual canvas | ChatDev |

---

## âœ¨ Features

- **Per-agent provider & model** â€” mix providers within one workflow (Ollama Â· Anthropic Â· OpenRouter)
- **Budgets with auto-pause** â€” per-agent *and* per-company caps, period-aware (daily / monthly / all-time); an over-budget agent pauses automatically, and the scheduler skips an over-budget company
- **Atomic ticket claim** â€” `SKIP LOCKED` so no two agents grab the same ticket
- **Verdict-aware workflows** â€” phases route on the reviewer's verdict (`approve / rework / escalate / ship / hold`), with backward branching and rework-loop limits
- **Human-in-the-loop** â€” `human_approval` gates; an Approval Inbox with full context (parent chain, prior verdict, budget impact)
- **Immutable audit log** â€” every operator / agent / system action, recorded append-only
- **Operations dashboard** â€” six views: Live Ops, Roster, Workflow Canvas, Tickets, Inbox, Audit
- **Bilingual UI** â€” Turkish / English (chrome localized; technical identifiers stay English)

---

## ğŸ› ï¸ Tech Stack

**Backend** â€” Python 3.12 Â· FastAPI Â· PostgreSQL Â· SQLAlchemy 2.0 (async) Â· Alembic Â· Pydantic
**Frontend** â€” React 18 Â· Vite Â· TypeScript Â· Tailwind CSS Â· TanStack Query Â· React Flow Â· Recharts Â· i18next
**Infra** â€” Docker Â· Docker Compose Â· Ollama (local models)

---

## âš¡ Getting Started

### Prerequisites
- Docker & Docker Compose
- (Optional) [Ollama](https://ollama.com) for local models
- (Optional) Anthropic / OpenRouter API keys for cloud models

### Run

```bash
git clone https://github.com/Simulate-X/MaestrOS.git
cd MaestrOS

# environment variables
cp .env.example .env                     # DB + optional API keys
cp frontend/.env.example frontend/.env   # frontend â†’ backend connection

docker compose up -d   # db Â· ollama Â· control-plane Â· scheduler Â· ui
```

- **Dashboard:** http://localhost:5173
- **API docs (Swagger):** http://localhost:8080/docs

To restart only the scheduler:
```bash
docker compose restart scheduler
```

---

## ğŸ“ Project Structure

```
MaestrOS/
â”œâ”€â”€ control-plane/          # FastAPI backend
â”‚   â”œâ”€â”€ app/                # models, adapters, services, api
â”‚   â”œâ”€â”€ alembic/            # database migrations
â”‚   â””â”€â”€ tests/              # 88 unit tests
â”œâ”€â”€ frontend/               # Vite + React + TS operations dashboard
â”œâ”€â”€ skills/                 # Markdown skills (agent system prompts)
â”œâ”€â”€ workflows/              # YAML workflow definitions
â”œâ”€â”€ .env.example
â”œâ”€â”€ docker-compose.yml
â””â”€â”€ PROGRESS.md
```

---

## ğŸ—ºï¸ Roadmap

- [ ] **Multi-company structure** â€” a separate AI crew per work domain
  - [ ] YouTube Automation: Trend Researcher â†’ Script Writer â†’ SEO Specialist â†’ Visual Director
  - [ ] Visual Production Studio: Brief Analyst â†’ Prompt Engineer â†’ Quality Inspector
- [ ] **Dynamic provider system** â€” fetch the Ollama model list live via `GET /api/ollama/models`; remove the hardcoded `MODEL_CATALOG`
- [ ] **Plugin-based adapter system** â€” add a new provider without touching the core (the Paperclip approach)
- [ ] `company_id` filter on `GET /agents` and `GET /tickets`
- [ ] Real-time Live Ops feed (SSE or more frequent polling)
- [ ] GitHub Actions CI/CD

---

## ğŸ™ Acknowledgements

MaestrOS draws its three-layer design from three projects:

- **[Paperclip](https://github.com/paperclipai/paperclip)** â€” open-source orchestration for autonomous AI-agent companies (the control-plane layer).
- **[gstack](https://github.com/garrytan/gstack)** â€” a Markdown-skill workflow that turns a coding agent into a virtual engineering team, built around a `Think â†’ Plan â†’ Build â†’ Review â†’ Test â†’ Ship â†’ Reflect` sprint (the behavior layer).
- **ChatDev** â€” multi-agent role hierarchy and phased software-company workflows (the workflow layer).

---

## ğŸ“„ License

This project is licensed under the MIT License â€” see [LICENSE](LICENSE) for details.
