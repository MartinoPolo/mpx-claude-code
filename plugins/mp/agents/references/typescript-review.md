# TypeScript Review Reference

Judgment-based patterns not caught by linting or type-checking.
Adapted from [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill).

---

## Type Narrowing

```typescript
// ❌ Unsafe type assertion
function getLength(value: string | string[]) {
  return (value as string[]).length; // crashes if string
}

// ✅ Type guard
function getLength(value: string | string[]): number {
  if (Array.isArray(value)) return value.length;
  return value.length;
}

// ✅ `in` operator for discriminated interfaces
interface Dog { bark(): void }
interface Cat { meow(): void }

function speak(animal: Dog | Cat) {
  if ('bark' in animal) animal.bark();
  else animal.meow();
}
```

## Literal Types & as const

```typescript
// ❌ Type too wide — method is string
const config = { endpoint: '/api', method: 'GET' };

// ✅ as const narrows to literal types
const config = { endpoint: '/api', method: 'GET' } as const;
// method is now 'GET', not string
```

## Discriminated Unions

```typescript
// ✅ Invalid states become unrepresentable
type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

function handleResult(result: Result<User, Error>) {
  if (result.success) {
    console.log(result.data.name); // TS knows data exists
  } else {
    console.log(result.error.message); // TS knows error exists
  }
}
```

## Generic Constraints

```typescript
// ❌ No constraint — can't access properties
function getProperty<T>(obj: T, key: string) {
  return obj[key]; // Error
}

// ✅ keyof constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## Utility Types (avoid reinventing)

```typescript
type PartialUser = Partial<User>;       // all optional
type RequiredUser = Required<User>;     // all required
type ReadonlyUser = Readonly<User>;     // all readonly
type NameOnly = Pick<User, 'name'>;     // subset
type WithoutId = Omit<User, 'id'>;      // exclude fields
type UserRecord = Record<string, User>; // index signature
```

## Conditional & Mapped Types

```typescript
// Extract array element type
type ElementType<T> = T extends (infer U)[] ? U : never;

// Transform all properties
type Nullable<T> = { [K in keyof T]: T[K] | null };

// Template literal types for type-safe naming
type EventName = 'click' | 'focus' | 'blur';
type HandlerName = `on${Capitalize<EventName>}`;
// 'onClick' | 'onFocus' | 'onBlur'
```

## Promise.all vs Promise.allSettled

```typescript
// ❌ Promise.all — one failure rejects everything
const users = await Promise.all(ids.map(fetchUser));

// ✅ Promise.allSettled — get all results, handle failures individually
const results = await Promise.allSettled(ids.map(fetchUser));
const users = results
  .filter((r): r is PromiseFulfilledResult<User> => r.status === 'fulfilled')
  .map(r => r.value);
```

## Race Condition Handling

```typescript
// ❌ Stale response overwrites newer one
useEffect(() => {
  fetch(`/api/search?q=${query}`)
    .then(r => r.json())
    .then(setResults); // old request may resolve last
}, [query]);

// ✅ AbortController cancels stale requests
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then(r => r.json())
    .then(setResults)
    .catch(e => { if (e.name !== 'AbortError') throw e; });
  return () => controller.abort();
}, [query]);
```

## Immutability

```typescript
// ❌ Mutates input array
function processUsers(users: User[]) {
  users.sort((a, b) => a.name.localeCompare(b.name)); // mutates original
  return users;
}

// ✅ readonly prevents mutation, spread creates copy
function processUsers(users: readonly User[]): User[] {
  return [...users].sort((a, b) => a.name.localeCompare(b.name));
}
```
