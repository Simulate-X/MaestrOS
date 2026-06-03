from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import engine
from app.api import agents, tickets, companies, skills
from app.api import workflows, context_docs
from app.api import runs, audit


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="MaestrOS Control Plane", version="0.2.0", lifespan=lifespan)

# CORS — tarayıcı localhost:5173 (Vite dev) ve 4173 (Vite preview) üzerinden API'ye erişebilir.
# Prod'da nginx aynı origin'den serve ederse CORS gerekmez; dev için şart.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(companies.router)
app.include_router(skills.router)
app.include_router(agents.router)
app.include_router(tickets.router)
app.include_router(workflows.router)
app.include_router(context_docs.router)
app.include_router(runs.router)
app.include_router(audit.router)
