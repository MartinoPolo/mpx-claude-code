---
paths:
  - "**/*.py"
---

# Python

- Prefer `Protocol` from `typing` over abstract base classes (ABC) when defining interfaces. Protocols enable structural subtyping (duck typing with type safety) without requiring explicit inheritance.
- Use `TypedDict` instead of `dict[str, Any]` when the dictionary has a known, fixed set of keys. This gives type checkers visibility into the structure.
- Never use mutable objects as default arguments (e.g., `def f(items=[])`), because the default is shared across all calls and mutations accumulate. Use `None` as the sentinel and create a new object inside the function body. In dataclasses, use `field(default_factory=list)`.
- Always catch specific exception types rather than bare `except:` or `except Exception`. When re-raising as a different exception type, preserve the original cause with `raise NewError(...) from original_error` so the traceback chain is not lost.
- In async code, never call blocking functions like `time.sleep()`, synchronous file I/O, or CPU-heavy computations directly. These block the entire event loop. Use `asyncio.sleep()`, `aiofiles`, or `loop.run_in_executor()` to offload blocking work to a thread pool.
- When writing cancellable async tasks, handle `asyncio.CancelledError` explicitly: perform cleanup, then re-raise the error so the caller knows the task was cancelled. For concurrent async work, prefer `asyncio.TaskGroup` (Python 3.11+) for structured concurrency.
- Use `set` instead of `list` for membership testing (`if x in collection`), because set lookup is O(1) versus O(n) for lists. Use generator expressions instead of list comprehensions when the result is consumed once, to avoid materializing the entire collection in memory.
- Choose `ThreadPoolExecutor` for I/O-bound parallel work (network requests, file I/O) and `ProcessPoolExecutor` for CPU-bound parallel work (data processing, computation). Threads share memory but are limited by the GIL; processes bypass the GIL but have serialization overhead.
- Prefer `match`/`case` pattern matching (Python 3.10+) over long `if`/`elif` chains when branching on the structure of data, such as parsing API responses or handling message types.
- Be aware of the closure-over-loop-variable trap: lambdas created in a loop all capture the same variable by reference, so they all see the final value. Fix by capturing the current value via a default argument: `lambda i=i: i`.
