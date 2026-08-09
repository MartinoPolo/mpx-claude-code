# Rust Review Reference

Judgment-based patterns not caught by the compiler or clippy.
Adapted from [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill).

---

## Ownership & Borrowing

### Unnecessary clone()

```rust
// ❌ clone() to bypass borrow checker — ask: is this necessary?
fn bad_process(data: &Data) -> Result<()> {
    let owned = data.clone();
    expensive_operation(owned)
}

// ✅ Pass reference instead
fn good_process(data: &Data) -> Result<()> {
    expensive_operation(data)
}

// ✅ If clone IS needed, document why
let owned = data.clone(); // Clone needed: data moves to spawned task
tokio::spawn(async move { process(owned).await });
```

### Arc<Mutex<T>> — really needed?

```rust
// ❌ Shared state may be unnecessary
struct BadService {
    cache: Arc<Mutex<HashMap<String, Data>>>,
}

// ✅ Single owner if concurrency isn't needed
struct GoodService {
    cache: HashMap<String, Data>,
}

// ✅ If concurrent access needed, consider finer-grained structures
use dashmap::DashMap;
struct ConcurrentService {
    cache: DashMap<String, Data>,
}
```

### Cow — avoid allocation when possible

```rust
use std::borrow::Cow;

// ❌ Always allocates a new String
fn bad(name: &str) -> String {
    if name.is_empty() { "Unknown".to_string() }
    else { name.to_string() }  // unnecessary allocation
}

// ✅ Borrow when possible, allocate only when needed
fn good(name: &str) -> Cow<'_, str> {
    if name.is_empty() { Cow::Borrowed("Unknown") }
    else { Cow::Borrowed(name) }
}

fn normalize(name: &str) -> Cow<'_, str> {
    if name.chars().any(|c| c.is_uppercase()) {
        Cow::Owned(name.to_lowercase())  // must allocate to modify
    } else {
        Cow::Borrowed(name)
    }
}
```

## Unsafe Code Review (highest priority)

### Every unsafe block needs a SAFETY comment

```rust
// ❌ No justification — red flag
unsafe { *slice.get_unchecked(index) }

// ✅ SAFETY comment explains WHY it's safe
debug_assert!(index < slice.len());
// SAFETY: bounds check performed above via debug_assert
unsafe { *slice.get_unchecked(index) }
```

### Every unsafe fn needs # Safety docs

```rust
// ❌ No safety contract
unsafe fn bad_transmute<T, U>(t: T) -> U {
    std::mem::transmute(t)
}

// ✅ Document invariants the caller must uphold
/// # Safety
/// - `T` and `U` must have the same size and alignment
/// - `T` must be a valid bit pattern for `U`
unsafe fn documented_transmute<T, U>(t: T) -> U {
    std::mem::transmute(t)
}
```

### Wrap unsafe in safe APIs

```rust
// ✅ Safe public API, unsafe contained internally
pub fn checked_get(slice: &[u8], index: usize) -> Option<u8> {
    if index < slice.len() {
        // SAFETY: bounds check above
        Some(unsafe { *slice.get_unchecked(index) })
    } else {
        None
    }
}
```

## Async Code

### Don't block in async context

```rust
// ❌ Blocks the executor, starves other tasks
async fn bad() {
    let data = std::fs::read_to_string("file.txt").unwrap(); // blocking IO
    std::thread::sleep(Duration::from_secs(1)); // blocking sleep
}

// ✅ Use async APIs
async fn good() -> Result<String> {
    let data = tokio::fs::read_to_string("file.txt").await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(data)
}

// ✅ spawn_blocking for unavoidable blocking work
let result = tokio::task::spawn_blocking(|| expensive_cpu_work()).await?;
```

### Don't hold std::sync::Mutex across .await

```rust
// ❌ Potential deadlock — std Mutex held across await point
async fn bad(mutex: &std::sync::Mutex<Data>) {
    let guard = mutex.lock().unwrap();
    async_operation().await;  // holding lock while awaiting!
    process(&guard);
}

// ✅ Minimize lock scope — clone and release
async fn good(mutex: &std::sync::Mutex<Data>) {
    let data = { mutex.lock().unwrap().clone() }; // release immediately
    async_operation().await;
    process(&data);
}

// ✅ Or use tokio::sync::Mutex (designed for async)
async fn good_tokio(mutex: &tokio::sync::Mutex<Data>) {
    let guard = mutex.lock().await;
    async_operation().await; // OK with tokio Mutex
    process(&guard);
}
```

## Cancel Safety

```rust
// ❌ Cancel-unsafe: if cancelled between receive and ack, data is lost
async fn cancel_unsafe(conn: &mut Connection) -> Result<()> {
    let data = receive_data().await;  // if cancelled here...
    conn.send_ack().await;            // ...ack never sent
    Ok(())
}

// ✅ Use transactions/atomic operations
async fn cancel_safe(conn: &mut Connection) -> Result<()> {
    let tx = conn.begin_transaction().await?;
    let data = receive_data().await;
    tx.commit_with_ack(data).await?;  // atomic
    Ok(())
}
```

### Document cancel safety for async fns

```rust
/// # Cancel Safety
/// This method is **not** cancel safe. If cancelled while reading,
/// partial data may be lost. Use `read_message_buffered` instead.
async fn read_message(stream: &mut TcpStream) -> Result<Message> { ... }
```

## spawn vs await

```rust
// ❌ Unnecessary spawn — adds overhead for no benefit
let handle = tokio::spawn(async { simple_op().await });
handle.await.unwrap();

// ✅ Just await simple operations directly
simple_op().await;

// ✅ spawn for true parallelism
let (a, b) = tokio::try_join!(
    tokio::spawn(fetch_service_a()),
    tokio::spawn(fetch_service_b()),
)?;

// ✅ Prefer join!/try_join! for structured concurrency
let (a, b, c) = tokio::try_join!(fetch_a(), fetch_b(), fetch_c())?;
```

## Error Handling

### Library: thiserror. Application: anyhow

```rust
// ❌ Library using anyhow — callers can't match errors
pub fn parse(s: &str) -> anyhow::Result<Config> { ... }

// ✅ Library: structured errors with thiserror
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("invalid syntax at line {line}: {message}")]
    Syntax { line: usize, message: String },
    #[error("missing field: {0}")]
    MissingField(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
```

### Preserve error context

```rust
// ❌ Original error lost
operation().map_err(|_| anyhow!("failed"))?;

// ✅ .context() preserves the chain
operation().context("failed to perform operation")?;
```

## Performance

### Avoid unnecessary collect()

```rust
// ❌ Intermediate allocation for no reason
items.iter().filter(|x| x.is_valid()).collect::<Vec<_>>().iter().sum()

// ✅ Lazy iteration
items.iter().filter(|x| x.is_valid()).copied().sum()
```

### Pre-allocate strings

```rust
// ❌ Repeated allocation in loop
let mut s = String::new();
for item in items { s = s + item; }

// ✅ join or with_capacity
items.join("")
// or
let mut s = String::with_capacity(total_len);
for item in items { s.push_str(item); }
```

## Trait Design

```rust
// ❌ Over-abstraction — not Java, don't trait everything
trait Processor { fn process(&self); }
trait Handler { fn handle(&self); }
trait Manager { fn manage(&self); }

// ✅ Concrete types are simpler and faster. Use traits only for polymorphism
struct DataProcessor { config: Config }
impl DataProcessor {
    fn process(&self, data: &Data) -> Result<Output> { ... }
}

// ✅ Prefer generics (static dispatch) over trait objects (dynamic dispatch)
fn good<H: Handler>(handler: &H) { handler.handle(); } // may inline
fn dynamic(handler: &dyn Handler) { handler.handle(); } // vtable call

// ✅ Trait objects only for heterogeneous collections
fn store(handlers: Vec<Box<dyn Handler>>) { ... }
```
