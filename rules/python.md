---
paths:
  - "**/*.py"
---

# Python

- Prefer `Protocol` over ABC for structural subtyping (duck typing with type safety)
- Use `TypedDict` over `dict[str, Any]` for structured dictionaries
- Never use mutable default arguments (`def f(items=[])`). Use `None` sentinel + `field(default_factory=list)` in dataclasses
- Catch specific exceptions, preserve chain with `raise ... from e`
- Async: never block the event loop. Use `asyncio.sleep`, `aiofiles`, `run_in_executor` for blocking work
- Async: handle `CancelledError` (cleanup then re-raise). Use `TaskGroup` for structured concurrency (3.11+)
- Use `set` for membership testing over `list`. Use generators for large datasets
- IO-bound → `ThreadPoolExecutor`. CPU-bound → `ProcessPoolExecutor`
- Pattern matching (`match/case`) over long if/elif chains for structured data (3.10+)
- Closure over loop variable trap: capture via default argument `lambda i=i: i`
