---
paths:
  - "**/*.rs"
---

# Rust

- Question every `clone()`. Pass references when possible. If clone needed, comment why
- `Arc<Mutex<T>>` only when concurrent access is proven. Consider `DashMap` for concurrent maps
- Use `Cow<'_, str>` to avoid allocation when borrowing suffices
- Every `unsafe` block needs a `// SAFETY:` comment. Every `unsafe fn` needs `# Safety` docs
- Wrap unsafe in safe public APIs
- Async: never block executor (`std::fs`, `thread::sleep`). Use `tokio::fs`, `tokio::time::sleep`, `spawn_blocking`
- Never hold `std::sync::Mutex` across `.await`. Use `tokio::sync::Mutex` or clone-and-release
- Document cancel safety for async functions that aren't cancel-safe
- `tokio::spawn` only for true parallelism. Just `.await` simple operations. Prefer `try_join!`
- Libraries: `thiserror` for structured errors. Applications: `anyhow`. Always `.context()` to preserve chain
- Avoid unnecessary `collect()`. Keep iterators lazy. Pre-allocate strings with `with_capacity`
- Concrete types over traits. Generics (static dispatch) over trait objects unless heterogeneous collection needed
