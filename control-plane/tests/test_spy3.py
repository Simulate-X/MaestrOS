import pytest
from unittest.mock import patch
from app.services.agents import swap_worker_model

async def _noop(*a, **kw): pass

class _AsyncCallRecorder:
    def __init__(self): self._calls = []
    async def __call__(self, *a, **kw): self._calls.append((a, kw))
    def assert_called_once_with(self, *a, **kw):
        assert len(self._calls) == 1
        assert self._calls[0] == (a, kw)

class _AgentStub:
    def __init__(self): self.id=1; self.company_id=99; self.title='dev-worker'; self.provider='ollama'; self.model='qwen2.5:7b'

class _SessionStub:
    def __init__(self, a): self._agent=a; self._added=[]
    async def get(self, _c, _i): return self._agent
    def add(self, o): self._added.append(o)

async def test_with_recorder_and_assert():
    agent = _AgentStub()
    session = _SessionStub(agent)
    audit_recorder = _AsyncCallRecorder()

    with patch('app.services.agents._validate_model_exists', new=_noop):
        with patch('app.services.agents.emit_audit', new=audit_recorder):
            await swap_worker_model(session, agent_id=1, new_provider='ollama',
                                    new_model='llama3.2:3b', initiated_by='human',
                                    reason='testing')

    assert agent.model == 'llama3.2:3b'
    audit_recorder.assert_called_once_with(
        session,
        actor_kind='operator', actor_label='operator', action='model_swapped',
        target_kind='agent', target_id=1, target_label='dev-worker',
        detail='initiated_by=human | ollama/qwen2.5:7b → ollama/llama3.2:3b | reason: testing',
        company_id=99,
    )
