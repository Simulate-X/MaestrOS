# 🎼 MaestrOS

> A local "software company" of role-playing AI agents — work flows through workflow phases, and every agent has its own model, budget, and human approval gate.

![Live Ops](docs/screenshots/live_ops.png)

| Roster | Tickets | Workflow Canvas |
|--------|---------|-----------------|
| ![Roster](docs/screenshots/roster.png) | ![Tickets](docs/screenshots/tickets.png) | ![Workflow Canvas](docs/screenshots/workflow_canvas.png) |

---

## What is MaestrOS?

MaestrOS is a **control plane** for running a virtual company of AI agents. Each agent has a role (CEO, Planner, Engineer, QA…), is defined by a Markdown **skill** file, and stays in character — ask the Planner to write code and it will hand you a spec, nothing else. Work flows **ticket-by-ticket** through a `plan → build → review → ship` chain; if QA asks for rework it loops back to build, and the CEO gives the final approval. Budgets, approval gates, and an immutable audit log keep the whole thing governable.

Everything can run locally: mix **Ollama, Anthropic, and OpenRouter** within a single workflow. I started turning this into a personal AI platform — adding separate AI companies for different domains of my work, like YouTube automation and a visual-production studio.

---

## 🏛️ Architecture — Three Layers

MaestrOS is a hybrid of three ideas, each forming one layer:

| Layer | Role | Inspired by |
|-------|------|-------------|
| **1 · Control Plane** | Per-agent model/config/budget/role, atomic ticket checkout (`SKIP LOCKED`), heartbeat scheduler, governance gates, immutable audit log | Paperclip |
| **2 · Behavior Engine** | Markdown **skills** as system prompts; a sprint methodology (`Think → Plan → Build → Review → Test → Ship → Reflect`) | gstack |
| **3 · Hierarchical Workflow** | YAML phase chain, verdict-aware branching, org chart (`reporting_to`), visual canvas | ChatDev |

---

## ✨ Features

- **Per-agent provider & model** — mix providers within one workflow (Ollama · Anthropic · OpenRouter)
- **Budgets with auto-pause** — per-agent *and* per-company caps, period-aware (daily / monthly / all-time); an over-budget agent pauses automatically, and the scheduler skips an over-budget company
- **Atomic ticket claim** — `SKIP LOCKED` so no two agents grab the same ticket
- **Verdict-aware workflows** — phases route on the reviewer's verdict (`approve / rework / escalate / ship / hold`), with backward branching and rework-loop limits
- **Human-in-the-loop** — `human_approval` gates; an Approval Inbox with full context (parent chain, prior verdict, budget impact)
- **Immutable audit log** — every operator / agent / system action, recorded append-only
- **Operations dashboard** — six views: Live Ops, Roster, Workflow Canvas, Tickets, Inbox, Audit
- **Bilingual UI** — Turkish / English (chrome localized; technical identifiers stay English)

---

## 🛠️ Tech Stack

**Backend** — Python 3.12 · FastAPI · PostgreSQL · SQLAlchemy 2.0 (async) · Alembic · Pydantic
**Frontend** — React 18 · Vite · TypeScript · Tailwind CSS · TanStack Query · React Flow · Recharts · i18next
**Infra** — Docker · Docker Compose · Ollama (local models)

---

## ⚡ Getting Started

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
cp frontend/.env.example frontend/.env   # frontend → backend connection

docker compose up -d   # db · ollama · control-plane · scheduler · ui
```

- **Dashboard:** http://localhost:5173
- **API docs (Swagger):** http://localhost:8080/docs

To restart only the scheduler:
```bash
docker compose restart scheduler
```

---

## 📁 Project Structure

```
MaestrOS/
├── control-plane/          # FastAPI backend
│   ├── app/                # models, adapters, services, api
│   ├── alembic/            # database migrations
│   └── tests/              # 88 unit tests
├── frontend/               # Vite + React + TS operations dashboard
├── skills/                 # Markdown skills (agent system prompts)
├── workflows/              # YAML workflow definitions
├── .env.example
├── docker-compose.yml
└── PROGRESS.md
```

---

## 🗺️ Roadmap

- [ ] **Multi-company structure** — a separate AI crew per work domain
  - [ ] YouTube Automation: Trend Researcher → Script Writer → SEO Specialist → Visual Director
  - [ ] Visual Production Studio: Brief Analyst → Prompt Engineer → Quality Inspector
- [ ] **Dynamic provider system** — fetch the Ollama model list live via `GET /api/ollama/models`; remove the hardcoded `MODEL_CATALOG`
- [ ] **Plugin-based adapter system** — add a new provider without touching the core (the Paperclip approach)
- [ ] `company_id` filter on `GET /agents` and `GET /tickets`
- [ ] Real-time Live Ops feed (SSE or more frequent polling)
- [ ] GitHub Actions CI/CD

---

## 🙏 Acknowledgements

MaestrOS draws its three-layer design from three projects:

- **[Paperclip](https://github.com/paperclipai/paperclip)** — open-source orchestration for autonomous AI-agent companies (the control-plane layer).
- **[gstack](https://github.com/garrytan/gstack)** — a Markdown-skill workflow that turns a coding agent into a virtual engineering team, built around a `Think → Plan → Build → Review → Test → Ship → Reflect` sprint (the behavior layer).
- **[ChatDev](https://github.com/openbmb/ChatDev)** — multi-agent role hierarchy and phased software-company workflows (the workflow layer).

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
