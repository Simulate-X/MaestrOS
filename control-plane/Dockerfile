FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    "sqlalchemy[asyncio]>=2.0" \
    asyncpg \
    alembic \
    httpx \
    "pydantic-settings" \
    pyyaml \
    pytest \
    pytest-asyncio

COPY . .

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8080"]
