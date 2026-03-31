# Good vs Bad Tests

## Good Tests

- **Test observable behavior** through public APIs — not internal wiring
- **Describe WHAT**, not HOW — test name reads as a requirement
- **Survive internal refactors** — if behavior stays the same, tests stay green
- **One logical assertion per test** — clear failure message, obvious what broke
- **Integration-style by default** — exercise the real path users/callers take

## Bad Tests

- Mock internal collaborators you control
- Test private methods directly
- Assert on call counts, call order, or implementation shape
- Break when refactoring without behavior change
- Test name describes HOW the code works instead of WHAT it does

## Example

### Good: Test via public interface

```typescript
// tests/user-service.test.ts
import { createUserService } from "../src/user-service";
import { createTestDatabase } from "./helpers/test-database";

test("created user can be retrieved by email", async () => {
  const database = createTestDatabase();
  const service = createUserService({ database });

  await service.createUser({ name: "Ada", email: "ada@example.com" });
  const found = await service.getUserByEmail("ada@example.com");

  expect(found).toEqual(
    expect.objectContaining({ name: "Ada", email: "ada@example.com" }),
  );
});
```

Why this works: tests the real contract (create then retrieve), uses a real database helper, survives any internal refactor that preserves the behavior.

### Bad: Mock internals, bypass interface

```typescript
// tests/user-service.test.ts
import { createUserService } from "../src/user-service";

test("createUser calls database.insert with correct args", async () => {
  const mockDatabase = {
    insert: vi.fn().mockResolvedValue({ id: 1 }),
    query: vi.fn(),
  };
  const service = createUserService({ database: mockDatabase });

  await service.createUser({ name: "Ada", email: "ada@example.com" });

  expect(mockDatabase.insert).toHaveBeenCalledWith("users", {
    name: "Ada",
    email: "ada@example.com",
  });
  expect(mockDatabase.insert).toHaveBeenCalledTimes(1);
});
```

Why this fails you: asserts on HOW (`.insert` called with specific args, exactly once). Rename the internal method or batch inserts differently — test breaks despite identical behavior. Tests nothing a caller cares about.

## Decision Checklist

Before writing a test, ask:

1. Am I testing a behavior a caller/user can observe?
2. Would a pure refactor (same behavior, different internals) leave this test green?
3. Does the test name finish the sentence "It should..."?

If any answer is no, rethink the test.
