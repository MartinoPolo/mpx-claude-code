# Deep vs Shallow Modules

From John Ousterhout's _A Philosophy of Software Design_.

## Core Idea

A module's value = functionality provided / interface complexity.

**Deep module** = small interface, lots of implementation behind it. High value.
**Shallow module** = large interface, little implementation behind it. Low value.

```
         Deep Module                     Shallow Module

    ┌──────────────────┐            ┌──────────────────────────────────┐
    │    interface      │            │           interface              │
    ├──────────────────┤            ├──────────────────────────────────┤
    │                  │            │                                  │
    │                  │            │         implementation           │
    │                  │            │                                  │
    │  implementation  │            └──────────────────────────────────┘
    │                  │
    │                  │
    │                  │
    │                  │
    └──────────────────┘
```

## Deep Module: Unix File I/O

Five functions (`open`, `read`, `write`, `lseek`, `close`) hide enormous complexity — buffering, caching, disk scheduling, file systems, permissions. The interface is tiny; the implementation is massive. That's deep.

## Shallow Module: Pass-through Methods

```typescript
// Shallow — adds nothing, just forwards
class UserController {
  getUser(id: string) {
    return this.userService.getUser(id);
  }
  createUser(data: UserData) {
    return this.userService.createUser(data);
  }
  updateUser(id: string, data: UserData) {
    return this.userService.updateUser(id, data);
  }
  deleteUser(id: string) {
    return this.userService.deleteUser(id);
  }
}
```

Each method does nothing but relay to another layer. The interface is as complex as the implementation. No depth.

## Design Questions

When designing a module, ask:

1. **Can I reduce the number of methods?** Combine related operations if they always happen together.
2. **Can I simplify parameters?** Use defaults, derive values internally, accept fewer options.
3. **Can I hide more complexity?** If callers must understand internals to use the interface, the abstraction leaks.
4. **Does this layer add real logic?** If a class/function just delegates, consider removing it.

## Impact on Testing

Deep modules need fewer tests relative to the functionality they provide — the small interface means fewer code paths to exercise. Shallow modules invert this: lots of surface area, little payoff per test.

Prefer deep modules. Your tests (and callers) will thank you.
