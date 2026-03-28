# Python Review Reference

Judgment-based patterns not caught by linting or type-checking.
Adapted from [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill).

---

## Protocol & Structural Subtyping

```python
from typing import Protocol, runtime_checkable

# ✅ Duck typing with type safety — prefer over ABC when possible
class Readable(Protocol):
    def read(self, size: int = -1) -> bytes: ...

def process_stream(stream: Readable) -> bytes:
    return stream.read()  # any object with .read() works

# ✅ Runtime-checkable protocol
@runtime_checkable
class Drawable(Protocol):
    def draw(self) -> None: ...

def render(obj: object) -> None:
    if isinstance(obj, Drawable):
        obj.draw()
```

## TypedDict for Structured Dicts

```python
from typing import TypedDict, Required, NotRequired

# ✅ Type-safe dictionaries — prefer over bare dict[str, Any]
class ConfigDict(TypedDict, total=False):
    debug: bool
    timeout: int
    host: Required[str]  # this one is mandatory
```

## Async Patterns

### Don't block the event loop

```python
# ❌ Blocking call in async context
async def bad():
    data = std_fs_read("file.txt")  # blocks entire event loop
    time.sleep(1)  # blocks entire event loop

# ✅ Use async APIs
async def good():
    data = await aiofiles.open("file.txt")
    await asyncio.sleep(1)

# ✅ If blocking is unavoidable, use executor
async def with_executor():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, blocking_function, arg)
```

### Task cancellation handling

```python
# ❌ Ignoring cancellation
async def bad_worker():
    while True:
        await do_work()  # no cleanup on cancel

# ✅ Handle CancelledError, clean up, re-raise
async def good_worker():
    try:
        while True:
            await do_work()
    except asyncio.CancelledError:
        await cleanup()
        raise  # re-raise so caller knows

# ✅ TaskGroup for structured concurrency (Python 3.11+)
async def fetch_multiple():
    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch_url("url1"))
        task2 = tg.create_task(fetch_url("url2"))
    return task1.result(), task2.result()
```

### Concurrency limiting

```python
# ✅ Semaphore to limit concurrent operations
async def fetch_with_limit(urls: list[str], max_concurrent: int = 10):
    semaphore = asyncio.Semaphore(max_concurrent)
    async def fetch_one(url: str) -> str:
        async with semaphore:
            return await fetch_url(url)
    return await asyncio.gather(*[fetch_one(url) for url in urls])
```

## Exception Handling

### Catch specific, preserve chain

```python
# ❌ Bare except or swallowed exception
try:
    result = risky_operation()
except:  # catches KeyboardInterrupt too
    pass

# ❌ Losing original exception context
try:
    result = external_api.call()
except APIError as e:
    raise RuntimeError("API failed")  # original error lost

# ✅ Specific catch + exception chain
try:
    result = external_api.call()
except APIError as e:
    raise RuntimeError("API failed") from e  # preserves chain

# ✅ Multiple specific types
try:
    result = parse_and_process(data)
except (ValueError, TypeError, KeyError) as e:
    raise DataProcessingError(str(e)) from e
```

### Custom exception hierarchies

```python
# ✅ Structured exceptions for your domain
class AppError(Exception): pass

class ValidationError(AppError):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f"{field}: {message}")

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str | int):
        super().__init__(f"{resource} with id {id} not found")
```

## Common Pitfalls

### Mutable default arguments

```python
# ❌ Shared across all calls — classic Python bug
def add_item(item, items=[]):
    items.append(item)
    return items
# add_item(1) → [1], add_item(2) → [1, 2] (!!)

# ✅ Use None sentinel
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```

### Mutable class attributes

```python
# ❌ Shared across ALL instances
class User:
    permissions = []  # every User shares this list

# ✅ Initialize in __init__ or use dataclass
@dataclass
class User:
    permissions: list = field(default_factory=list)
```

### Closure over loop variable

```python
# ❌ All lambdas capture the same variable
funcs = [lambda: i for i in range(3)]
[f() for f in funcs]  # [2, 2, 2] — not [0, 1, 2]

# ✅ Capture value via default argument
funcs = [lambda i=i: i for i in range(3)]
```

## Performance Judgment Calls

### Data structure choice

```python
# ❌ Linear search in list — O(n) per lookup
if item in large_list: ...

# ✅ Set for membership testing — O(1)
large_set = set(large_list)
if item in large_set: ...
```

### Generator vs list

```python
# ❌ Materializes entire list into memory
def get_all_users():
    return [User(row) for row in db.fetch_all()]

# ✅ Generator for large datasets — lazy evaluation
def get_all_users():
    for row in db.fetch_all():
        yield User(row)

# ✅ Generator expression (no intermediate list)
total = sum(x**2 for x in range(1_000_000))
```

### Thread pool vs process pool

```python
# ✅ IO-bound → ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=10) as executor:
    results = list(executor.map(fetch_url, urls))

# ✅ CPU-bound → ProcessPoolExecutor
with ProcessPoolExecutor() as executor:
    results = list(executor.map(heavy_computation, data))
```

## Modern Python (3.10+)

```python
# ✅ Pattern matching — cleaner than if/elif chains for structured data
match response:
    case {"status": "ok", "data": data}:
        return process_data(data)
    case {"status": "error", "message": msg}:
        raise APIError(msg)
    case _:
        raise ValueError("Unknown response")

# ✅ ExceptionGroup for batch errors (3.11+)
errors = []
for item in items:
    try: process(item)
    except Exception as e: errors.append(e)
if errors:
    raise ExceptionGroup("Batch failed", errors)
```
