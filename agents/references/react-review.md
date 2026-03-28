# React Review Reference

Judgment-based patterns not caught by linting.
Adapted from [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill).

---

## useEffect Discipline

### Don't use for derived state

```tsx
// ❌ Extra render cycle for no reason
function Bad({ items }) {
  const [filtered, setFiltered] = useState([]);
  useEffect(() => {
    setFiltered(items.filter(i => i.active));
  }, [items]);
}

// ✅ Compute inline or with useMemo
function Good({ items }) {
  const filtered = useMemo(() => items.filter(i => i.active), [items]);
}
```

### Don't use for event responses

```tsx
// ❌ Effect responds to state change caused by user action
useEffect(() => {
  if (query) analytics.track('search', { query });
}, [query]);

// ✅ Do it in the event handler
const handleSearch = (q: string) => {
  setQuery(q);
  analytics.track('search', { query: q });
};
```

### Always clean up

```tsx
// ✅ Cancel stale requests, clear timers, unsubscribe
useEffect(() => {
  let cancelled = false;
  fetchUser(userId).then(data => { if (!cancelled) setUser(data); });
  return () => { cancelled = true; };
}, [userId]);
```

## useMemo / useCallback — Only When Needed

```tsx
// ❌ Over-optimization — constants don't need memoization
const config = useMemo(() => ({ timeout: 5000 }), []);
const handleClick = useCallback(() => console.log('clicked'), []);

// ✅ Simple values are fine without memoization
const config = { timeout: 5000 };
const handleClick = () => console.log('clicked');

// ✅ DO memoize when passing to React.memo children
const MemoChild = React.memo(function Child({ onClick, items }) {
  return <div onClick={onClick}>{items.length}</div>;
});

function Parent({ rawItems }) {
  const items = useMemo(() => processItems(rawItems), [rawItems]);
  const handleClick = useCallback(() => console.log(items.length), [items]);
  return <MemoChild onClick={handleClick} items={items} />;
}
```

## Component Design

```tsx
// ❌ Component defined inside — new instance every render
function BadParent() {
  function ChildComponent() { return <div>child</div>; }
  return <ChildComponent />;
}

// ✅ Define components externally
function ChildComponent() { return <div>child</div>; }
function GoodParent() { return <ChildComponent />; }

// ❌ Inline objects/functions as props to memoized components
<MemoizedComponent style={{ color: 'red' }} onClick={() => {}} />

// ✅ Stable references
const style = { color: 'red' };
function Good() {
  const handleClick = useCallback(() => {}, []);
  return <MemoizedComponent style={style} onClick={handleClick} />;
}
```

## Error Boundaries & Suspense

```tsx
// ❌ No error boundary — error crashes entire app
<Suspense fallback={<Loading />}>
  <DataComponent />
</Suspense>

// ✅ Error Boundary wraps Suspense
<ErrorBoundary fallback={<ErrorUI />}>
  <Suspense fallback={<Loading />}>
    <DataComponent />
  </Suspense>
</ErrorBoundary>

// ✅ Independent Suspense boundaries — stream independently
<>
  <Header />
  <Suspense fallback={<ContentSkeleton />}>
    <MainContent />
  </Suspense>
  <Suspense fallback={<SidebarSkeleton />}>
    <Sidebar />
  </Suspense>
</>
```

## Server Components (RSC)

```tsx
// ❌ Hooks in Server Component
function BadServerComponent() {
  const [count, setCount] = useState(0); // Error — no hooks in RSC
}

// ✅ Extract interactive logic to 'use client' leaf components
'use client';
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// Server Component fetches data, delegates interaction
async function Page() {
  const data = await fetchData();
  return <div><h1>{data.title}</h1><Counter /></div>;
}

// ❌ 'use client' too high — entire tree becomes client
'use client'; // in layout.tsx — makes ALL children client components

// ✅ Push 'use client' to leaf components that need interactivity
```

## React 19 Actions

### useActionState — unified form state

```tsx
// ❌ Scattered state: isPending + error + data as separate useState
// ✅ useActionState unifies it:
const [state, formAction, isPending] = useActionState(
  async (prevState, formData: FormData) => {
    try {
      const result = await submitForm(formData);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  { success: false, data: null, error: null }
);
```

### useFormStatus — no prop drilling for form state

```tsx
// ✅ Must be called inside a <form> child component
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Submitting...' : 'Submit'}</button>;
}

// ❌ Calling useFormStatus at the same level as <form> — won't work
function BadForm() {
  const { pending } = useFormStatus(); // can't access form state here
  return <form><button disabled={pending}>Submit</button></form>;
}
```

### useOptimistic — instant UI feedback

```tsx
const [optimisticLikes, addOptimisticLike] = useOptimistic(
  likes,
  (current, increment: number) => current + increment
);

const handleLike = async () => {
  addOptimisticLike(1); // immediate UI update
  await likePost(postId); // sync in background, auto-rollback on failure
};
```

## TanStack Query v5 (if used)

### queryOptions — DRY query definitions

```tsx
// ❌ Duplicated queryKey/queryFn across components and prefetches
// ✅ Centralize with queryOptions
const userQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ['users', userId],
    queryFn: () => fetchUser(userId),
  });

// Reuse everywhere: useQuery(userQueryOptions(id)), prefetchQuery, getQueryData
```

### Common pitfalls

```tsx
// ❌ staleTime defaults to 0 — refetches on every mount
// ✅ Set meaningful staleTime
useQuery({ queryKey: ['data'], queryFn: fetchData, staleTime: 60_000 });

// ❌ queryKey missing data-affecting params
useQuery({ queryKey: ['items'], queryFn: () => fetchItems(filters) });
// ✅ Include all params in queryKey
useQuery({ queryKey: ['items', filters], queryFn: () => fetchItems(filters) });
```

### useSuspenseQuery constraints

| Feature         | useQuery        | useSuspenseQuery     |
| --------------- | --------------- | -------------------- |
| `enabled`       | supported       | NOT supported        |
| `placeholderData`| supported      | NOT supported        |
| `data` type     | `T \| undefined`| `T` (guaranteed)     |
| Error handling  | `error` prop    | throws to ErrorBoundary |

```tsx
// ❌ useSuspenseQuery with enabled — not supported
// ✅ Use conditional rendering in parent instead
function Parent({ userId }) {
  if (!userId) return <NoUserSelected />;
  return <Suspense fallback={<Skeleton />}><UserData userId={userId} /></Suspense>;
}
```

### v5 state field changes

```tsx
// isPending: no cached data (first load)
// isFetching: request in flight (including background refresh)
// isLoading: isPending && isFetching (first load in progress)
// Use isPending for "show spinner", not isLoading
```
