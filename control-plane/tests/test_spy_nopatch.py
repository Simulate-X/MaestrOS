import pytest
import app.services.agents as _agents_mod
import app.services.audit as _audit_mod

async def _noop(*a, **kw): pass

class _Rec:
    def __init__(self): self._c = []
    async def __call__(self, *a, **kw): self._c.append((a, kw))
    def assert_called_once_with(self, *a, **kw):
        assert len(self._c) == 1
        assert self._c[0] == (a, kw)

class _AgentStub:
    id=1; company_id=99; title='dev-worker'; provider='ollama'; model='qwen2.5:7b'

class _SessionStub:
    def __init__(self, a): self._a=a
    async def get(self, _c, _i): return self._a
    def add(self, o): pass

async def test_no_patch():
    agent = _AgentStub()
    session = _SessionStub(agent)
    audit_recorder = _Rec()

    # unittest.mock.patch kullanmadan, direkt attribute swap
    orig_validate = _agents_mod._validate_model_exists
    orig_emit = _agents_mod.emit_audit
    _agents_mod._validate_model_exists = _noop
    _agents_mod.emit_audit = audit_recorder
    try:
        from app.services.agents import swap_worker_model
        result = await swap_worker_model(session, agent_id=1,
                                         new_provider='ollama', new_model='llama3.2:3b',
                                         initiated_by='human', reason='testing')
    finally:
        _agents_mod._validate_model_exists = orig_validate
        _agents_mod.emit_audit = orig_emit

    assert agent.model == 'llama3.2:3b'
    assert result.old_model == 'qwen2.5:7b'
    audit_recorder.assert_called_once_with(
        session,
        actor_kind='operator', actor_label='operator', action='model_swapped',
        target_kind='agent', target_id=1, target_label='dev-worker',
        detail='initiated_by=human | ollama/qwen2.5:7b → ollama/llama3.2:3b | reason: testing',
        company_id=99,
    )
