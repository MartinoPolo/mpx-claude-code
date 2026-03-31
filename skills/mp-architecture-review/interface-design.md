# Interface Design for Testability

Three rules that make code naturally testable — no test-specific hacks needed.

## Rule 1: Accept Dependencies, Don't Create Them

When a function creates its own dependencies, tests can't substitute them. Pass dependencies in so tests can inject fakes at system boundaries.

**Testable:**

```typescript
function createNotificationService(dependencies: {
  emailSender: EmailSender;
  clock: () => number;
}) {
  return {
    async sendReminder(userId: string, message: string) {
      const timestamp = dependencies.clock();
      await dependencies.emailSender.send(userId, message, timestamp);
      return { sentAt: timestamp };
    },
  };
}

// Test: inject fake clock + fake sender, assert on return value
```

**Hard to test:**

```typescript
function createNotificationService() {
  const emailSender = new SmtpEmailSender(process.env.SMTP_HOST!);

  return {
    async sendReminder(userId: string, message: string) {
      const timestamp = Date.now();
      await emailSender.send(userId, message, timestamp);
      // returns nothing — how do you verify what happened?
    },
  };
}

// Test: must mock SmtpEmailSender constructor, stub Date.now globally
```

## Rule 2: Return Results, Don't Produce Side Effects

Functions that return values are trivially testable — call them and assert on the output. Functions that only produce side effects (write to DB, fire events, mutate global state) force tests to observe those side effects through back channels.

**Testable:**

```typescript
function calculateDiscount(order: Order, rules: DiscountRule[]): DiscountResult {
  const applicable = rules.filter((rule) => rule.matches(order));
  const bestDiscount = applicable.reduce(
    (best, rule) => Math.max(best, rule.percentage),
    0,
  );
  return { percentage: bestDiscount, appliedRule: applicable[0]?.name ?? null };
}

// Test: call it, check the return value. Done.
```

**Hard to test:**

```typescript
function applyDiscount(order: Order, rules: DiscountRule[]) {
  const applicable = rules.filter((rule) => rule.matches(order));
  const bestDiscount = applicable.reduce(
    (best, rule) => Math.max(best, rule.percentage),
    0,
  );
  order.discount = bestDiscount; // mutates input
  order.discountRuleName = applicable[0]?.name ?? null; // mutates input
  analyticsTracker.track("discount_applied", { percentage: bestDiscount }); // side effect
}

// Test: must inspect mutated order AND mock analytics tracker
```

## Rule 3: Small Surface Area

Fewer methods and parameters = fewer tests needed = fewer ways to misuse.

**Small surface:**

```typescript
interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs?: number): void;
}
// 2 methods. TTL has a sensible default. Clear contract.
```

**Bloated surface:**

```typescript
interface Cache<T> {
  get(key: string): T | undefined;
  getOrDefault(key: string, fallback: T): T;
  getOrCompute(key: string, compute: () => T): T;
  set(key: string, value: T): void;
  setWithTTL(key: string, value: T, ttlMs: number): void;
  setIfAbsent(key: string, value: T): boolean;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  keys(): string[];
  values(): T[];
  entries(): [string, T][];
}
// 13 methods. Most are convenience wrappers. Each needs tests.
// Callers must decide which get/set variant to use.
```

## Summary

| Principle                        | Makes testing easier because...              |
| -------------------------------- | -------------------------------------------- |
| Accept dependencies              | Tests inject fakes at boundaries             |
| Return results                   | Tests assert on return values directly       |
| Small surface area               | Fewer code paths to cover                    |
