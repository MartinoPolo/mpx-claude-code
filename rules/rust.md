---
paths:
  - "**/*.rs"
---

# Rust

- Scrutinize every `clone()` call. Most clones exist to work around borrow checker errors, but passing a reference is usually the correct solution. When cloning is genuinely necessary (e.g., data must move into a spawned task), add a comment explaining why.
- Only use `Arc<Mutex<T>>` when you have proven concurrent access from multiple threads. For single-threaded or single-owner scenarios, use the value directly. For concurrent hash maps, consider `DashMap` instead of `Arc<Mutex<HashMap>>`.
- Use `Cow<'_, str>` in functions that sometimes need to allocate a new string and sometimes can return the input unchanged. This avoids unnecessary allocations in the borrow-only path.
- Every `unsafe` block must have a `// SAFETY:` comment explaining why the unsafe operation is sound in this specific context. Every `unsafe fn` must have a `# Safety` doc section documenting the invariants the caller must uphold. Wrap unsafe operations inside safe public APIs wherever possible.
- In async code, never call blocking operations like `std::fs` functions or `std::thread::sleep()` inside an async context, because they block the entire executor and starve other tasks. Use `tokio::fs`, `tokio::time::sleep`, or `tokio::task::spawn_blocking` for unavoidable blocking work.
- Never hold a `std::sync::Mutex` guard across an `.await` point, because this can cause deadlocks. Either clone the data and release the lock before awaiting, or use `tokio::sync::Mutex` which is designed for async contexts.
- Document cancel safety for async functions where cancellation between await points could cause data loss or inconsistent state. Use transactions or atomic operations to make cancel-unsafe sequences safe.
- Use `tokio::spawn` only when you need true parallel execution across tasks. For sequential async operations, just `.await` them directly. For concurrent execution of independent futures, prefer `tokio::try_join!` which provides structured concurrency.
- In library crates, use `thiserror` to define structured error enums that callers can match on. In application crates, use `anyhow` for convenient error propagation. Always use `.context()` to add human-readable descriptions when propagating errors.
- Avoid unnecessary `collect()` calls between iterator adapters. Keep iterators lazy and only collect at the final consumption point. When building strings in a loop, pre-allocate with `String::with_capacity()` or use `.join()`.
- Prefer concrete types over trait abstractions unless you genuinely need polymorphism. When polymorphism is needed, prefer generics (static dispatch, can be inlined) over trait objects (dynamic dispatch via vtable). Only use `dyn Trait` for heterogeneous collections.
