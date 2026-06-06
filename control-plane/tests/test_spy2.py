import pytest
from unittest.mock import patch
from app.services.agents import swap_worker_model, NeedsHumanApproval  # top-level

async def _noop(*a, **kw): pass

class _Rec:
    def __init__(self): self._c = []
    async def __call__(self, *a, **kw): self._c.append((a, kw))

class _A:
    id=1; company_id=99; title='w'; provider='ollama'; model='qwen2.5:7b'

class _S:
    async def get(self, _c, _i): return _A()
    def add(self, o): pass

async def test_toplevel_import():
    rec = _Rec()
    with patch('app.services.agents._validate_model_exists', new=_noop):
        with patch('app.services.agents.emit_audit', new=rec):
            await swap_worker_model(_S(), agent_id=1, new_provider='ollama',
                                    new_model='llama3.2:3b', initiated_by='human')
    assert len(rec._c) == 1
