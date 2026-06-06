# Shared pytest configuration for control-plane test suite.
import warnings

# pytest-asyncio 1.4.0 + Python 3.10: the backports runner causes CPython's
# _PyGen_Finalize to emit a RuntimeWarning for an AsyncMock._execute_mock_call
# coroutine that is created internally but never awaited.  The warning originates
# in framework machinery (confirmed via tracemalloc), not in our test code.
# Registered here (not only in pyproject.toml) because pyproject filterwarnings
# are appended after Python's default chain and lose the priority race.
warnings.filterwarnings(
    "ignore",
    message="coroutine 'AsyncMockMixin._execute_mock_call' was never awaited",
    category=RuntimeWarning,
)
