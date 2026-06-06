"""
Acceptance tests for swap_worker_model service.

Three cases that must all pass before Phase 2 is touched:
  1. valid_swap        — happy path: model exists, human-initiated → agent updated
  2. hallucinated_model — model not in provider's list → ValueError
  3. ceo_cloud_blocked  — CEO requests non-ollama provider → NeedsHumanApproval

NOTE: unittest.mock.patch is intentionally avoided.
In Python 3.10, patch() creates AsyncMock._execute_mock_call coroutines internally
for async-function targets, even when `new=` is provided explicitly.  Those
coroutines are never awaited, triggering RuntimeWarning via sys.unraisablehook.
Direct attribute swap (_swap context manager) avoids the mock machinery entirely.
"""

import pytest
from contextlib import contextmanager

import app.services.agents as _agents_mod
import app.adapters.base as _adapters_base_mod

from app.services.agents import swap_worker_model, NeedsHumanApproval


# ── swap helper ───────────────────────────────────────────────────────────────

@contextmanager
def _swap(module, attr, replacement):
    """Temporarily replace module.attr with replacement; restore on exit."""
    original = getattr(module, attr)
    setattr(module, attr, replacement)
    try:
        yield replacement
    finally:
        setattr(module, attr, original)


# ── async call recorder ───────────────────────────────────────────────────────

class _AsyncCallRecorder:
    """Plain async callable that records calls (no AsyncMock, no hidden coroutines)."""

    def __init__(self):
        self._calls: list[tuple] = []

    async def __call__(self, *args, **kwargs):
        self._calls.append((args, kwargs))

    def assert_not_called(self):
        assert not self._calls, (
            f"Expected 0 calls, got {len(self._calls)}: {self._calls}"
        )

    def assert_called_once_with(self, *args, **kwargs):
        assert len(self._calls) == 1, (
            f"Expected 1 call, got {len(self._calls)}: {self._calls}"
        )
        actual_args, actual_kwargs = self._calls[0]
        assert actual_args == args, (
            f"Positional args mismatch:\n  got  {actual_args}\n  want {args}"
        )
        assert actual_kwargs == kwargs, (
            f"Keyword args mismatch:\n  got  {actual_kwargs}\n  want {kwargs}"
        )


async def _noop_async(*_a, **_kw):
    """Silent async no-op stub."""


# ── stubs ─────────────────────────────────────────────────────────────────────

class _AgentStub:
    """Plain Python object — no mock magic methods."""

    def __init__(self, id=1, provider="ollama", model="qwen2.5:7b"):
        self.id = id
        self.company_id = 99
        self.title = "dev-worker"
        self.provider = provider
        self.model = model


class _SessionStub:
    """Minimal SQLAlchemy session stub — only the methods the service uses."""

    def __init__(self, agent):
        self._agent = agent
        self._added: list = []

    async def get(self, _cls, _id):
        return self._agent

    def add(self, obj):
        self._added.append(obj)


# ── Case 1: geçerli swap ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_valid_swap_updates_agent():
    """
    Human-initiated swap to a real ollama model.
    Expect:
      - agent.provider/model updated
      - SwapResult carries old values
      - emit_audit called exactly once with correct actor/action/target fields
    """
    agent = _AgentStub(provider="ollama", model="qwen2.5:7b")
    session = _SessionStub(agent)
    audit_recorder = _AsyncCallRecorder()

    with (
        _swap(_agents_mod, "_validate_model_exists", _noop_async),
        _swap(_agents_mod, "emit_audit", audit_recorder),
    ):
        result = await swap_worker_model(
            session,
            agent_id=1,
            new_provider="ollama",
            new_model="llama3.2:3b",
            initiated_by="human",
            reason="testing",
        )

    # ── model swap ─────────────────────────────────────────────────────────────
    assert result.old_provider == "ollama"
    assert result.old_model == "qwen2.5:7b"
    assert agent.provider == "ollama"
    assert agent.model == "llama3.2:3b"

    # ── audit record was written with correct fields ───────────────────────────
    expected_detail = (
        "initiated_by=human | ollama/qwen2.5:7b → ollama/llama3.2:3b | reason: testing"
    )
    audit_recorder.assert_called_once_with(
        session,
        actor_kind="operator",
        actor_label="operator",
        action="model_swapped",
        target_kind="agent",
        target_id=1,
        target_label="dev-worker",
        detail=expected_detail,
        company_id=99,
    )


# ── Case 2: hayali model reddi ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hallucinated_model_raises_value_error():
    """
    Model requested does not exist in provider's registry.
    _validate_model_exists must raise ValueError — swap must be aborted.
    """
    agent = _AgentStub(provider="ollama", model="qwen2.5:7b")
    session = _SessionStub(agent)

    fake_available = ["llama3.2:3b", "mistral:7b"]

    async def _strict_validate(provider, model):
        if model not in fake_available:
            raise ValueError(
                f"Model {model!r} not found in provider {provider!r}. "
                f"Available: {fake_available}"
            )

    with (
        _swap(_agents_mod, "_validate_model_exists", _strict_validate),
        _swap(_agents_mod, "emit_audit", _noop_async),
    ):
        with pytest.raises(ValueError, match="gpt-99-turbo"):
            await swap_worker_model(
                session,
                agent_id=1,
                new_provider="ollama",
                new_model="gpt-99-turbo",     # hayali model
                initiated_by="human",
            )

    # Agent untouched
    assert agent.provider == "ollama"
    assert agent.model == "qwen2.5:7b"


# ── Case 3: CEO cloud swap kilitlenmesi ───────────────────────────────────────

@pytest.mark.asyncio
async def test_ceo_cloud_swap_raises_needs_human_approval():
    """
    CEO attempts to swap to a cloud provider (anthropic/openrouter/…).
    Service must raise NeedsHumanApproval — no DB write, no audit.
    This is the core security gate: boundary check fires BEFORE model validation.
    """
    agent = _AgentStub(provider="ollama", model="qwen2.5:7b")
    session = _SessionStub(agent)

    validate_recorder = _AsyncCallRecorder()
    audit_recorder = _AsyncCallRecorder()

    with (
        _swap(_agents_mod, "_validate_model_exists", validate_recorder),
        _swap(_agents_mod, "emit_audit", audit_recorder),
    ):
        with pytest.raises(NeedsHumanApproval, match="anthropic"):
            await swap_worker_model(
                session,
                agent_id=1,
                new_provider="anthropic",     # cloud — CEO izni yok
                new_model="claude-opus-4-6",
                initiated_by="ceo",
                reason="worker keeps failing, trying smarter model",
            )

    # Güvenlik: boundary check boundary check'ten ÖNCE ateşlendi
    # → model validation hiç çağrılmamalı
    validate_recorder.assert_not_called()
    audit_recorder.assert_not_called()

    # Agent state unchanged
    assert agent.provider == "ollama"
    assert agent.model == "qwen2.5:7b"


# ── Case 3b: CEO → openrouter da kilitlenmeli ────────────────────────────────

@pytest.mark.asyncio
async def test_ceo_openrouter_swap_also_blocked():
    """openrouter da cloud — aynı kural geçerli."""
    agent = _AgentStub()
    session = _SessionStub(agent)

    with (
        _swap(_agents_mod, "_validate_model_exists", _noop_async),
        _swap(_agents_mod, "emit_audit", _noop_async),
    ):
        with pytest.raises(NeedsHumanApproval):
            await swap_worker_model(
                session,
                agent_id=1,
                new_provider="openrouter",
                new_model="openai/gpt-4o",
                initiated_by="ceo",
            )


# ── Case 4: CEO → ollama geçmeli (izin verilen provider) ─────────────────────

@pytest.mark.asyncio
async def test_ceo_ollama_swap_allowed():
    """CEO → ollama: _CEO_ALLOWED_PROVIDERS içinde, geçmeli."""
    agent = _AgentStub(provider="ollama", model="qwen2.5:7b")
    session = _SessionStub(agent)

    with (
        _swap(_agents_mod, "_validate_model_exists", _noop_async),
        _swap(_agents_mod, "emit_audit", _noop_async),
    ):
        result = await swap_worker_model(
            session,
            agent_id=1,
            new_provider="ollama",
            new_model="llama3.2:3b",
            initiated_by="ceo",
        )

    assert result.agent.model == "llama3.2:3b"


# ── _validate_model_exists unit tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_validate_model_exists_accepts_real_model():
    """list_models() içindeki model → hata yok."""
    from app.services.agents import _validate_model_exists

    fake_cls = _FakeOllamaAdapterCls(["llama3.2:3b", "mistral:7b"])

    with _swap(_adapters_base_mod, "ADAPTER_REGISTRY", {"ollama": fake_cls}):
        await _validate_model_exists("ollama", "llama3.2:3b")  # must not raise


@pytest.mark.asyncio
async def test_validate_model_exists_rejects_unknown_model():
    """list_models() dışındaki model → ValueError."""
    from app.services.agents import _validate_model_exists

    fake_cls = _FakeOllamaAdapterCls(["llama3.2:3b"])

    with _swap(_adapters_base_mod, "ADAPTER_REGISTRY", {"ollama": fake_cls}):
        with pytest.raises(ValueError, match="gpt-99"):
            await _validate_model_exists("ollama", "gpt-99")


@pytest.mark.asyncio
async def test_validate_model_exists_rejects_unknown_provider():
    """Kayıtlı olmayan provider → ValueError."""
    from app.services.agents import _validate_model_exists

    with _swap(_adapters_base_mod, "ADAPTER_REGISTRY", {}):
        with pytest.raises(ValueError, match="not registered"):
            await _validate_model_exists("nonexistent_provider", "some-model")


# ── stub adapter class ────────────────────────────────────────────────────────

def _FakeOllamaAdapterCls(models: list[str]):
    """list_models() classmethod'unu stub'layan minimal adapter sınıfı."""
    class _Fake:
        @classmethod
        async def list_models(cls):
            return models
    return _Fake
