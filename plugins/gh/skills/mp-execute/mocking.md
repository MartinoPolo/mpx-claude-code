# When to Mock

## Mock at System Boundaries Only

Mocks replace things **you don't control** — the outside world:

- **External APIs** — third-party HTTP services, webhooks
- **Databases** — when a real test database is impractical (prefer real DB in integration tests)
- **Time / randomness** — `Date.now()`, `Math.random()`, UUIDs
- **File system** — when tests must stay fast and side-effect-free

## Never Mock What You Own

- Your own classes, modules, or internal collaborators
- Anything you can change the source of
- Internal utility functions

If you need to mock your own code to test something, the design is wrong — fix the design.

## Designing for Mockability

### 1. Dependency Injection: Pass Dependencies In

**Injectable (testable):**

```typescript
interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

function createOrderService(dependencies: { emailSender: EmailSender }) {
  return {
    async placeOrder(order: Order) {
      const saved = await saveOrder(order);
      await dependencies.emailSender.send(
        order.email,
        "Order confirmed",
        `Order #${saved.id} placed.`,
      );
      return saved;
    },
  };
}

// In test: pass a fake emailSender
// In production: pass the real one
```

**Non-injectable (hard to test):**

```typescript
import { sendEmail } from "../lib/email"; // hard-coded import

function createOrderService() {
  return {
    async placeOrder(order: Order) {
      const saved = await saveOrder(order);
      // How do you replace sendEmail in a test?
      await sendEmail(order.email, "Order confirmed", `Order #${saved.id}`);
      return saved;
    },
  };
}
```

### 2. Prefer Specific Interfaces Over Generic Fetchers

**Specific (easy to fake):**

```typescript
interface WeatherProvider {
  getCurrentTemperature(city: string): Promise<number>;
}

// Test fake is trivial:
const fakeWeather: WeatherProvider = {
  getCurrentTemperature: async () => 22,
};
```

**Generic (painful to fake):**

```typescript
interface HttpClient {
  get(url: string, headers?: Record<string, string>): Promise<unknown>;
  post(url: string, body: unknown): Promise<unknown>;
}

// Now your fake must know about URLs, payloads, headers...
// You're testing HTTP plumbing instead of weather logic.
```

## Decision Rule

> Can I swap this dependency in production for a different provider?
> If yes, it's a system boundary — mock it in tests.
> If no, it's internal — test the real thing.
