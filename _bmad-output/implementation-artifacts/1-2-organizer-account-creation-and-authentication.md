# Story 1.2: Organizer Account Creation & Authentication

Status: done

## Story

As an organizer,
I want to create an account using my email or a Google/GitHub OAuth provider and securely log in,
So that I have authenticated access to my competition management dashboard.

## Acceptance Criteria

1. Given the sign-up page, when I enter a valid email and complete Clerk's registration flow, then my organizer account is created and I am redirected to my dashboard.

2. Given the sign-up page, when I click "Continue with Google" and authorize, then my account is created via OAuth and I am redirected to my dashboard without creating a password.

3. Given I am logged in with a valid session, when my 15-minute JWT expires, then a refresh token automatically issues a new JWT with no interruption to my session (Clerk handles this automatically — verify no extra configuration needed).

4. Given I am not logged in, when I navigate to any route under `(admin)/` or `(presenter)/`, then Next.js middleware redirects me to the sign-in page.

5. Given I am logged in, when I click "Sign out", then my Clerk session is invalidated, all auth tokens are cleared, and I am redirected to the sign-in page.

## Tasks / Subtasks

- [x] Task 1: Install Clerk and tRPC packages (AC: all)
  - [x] Add `@clerk/nextjs` to `apps/web/package.json` devDependencies
  - [x] Add `@clerk/backend` to `apps/api/package.json` dependencies
  - [x] Add tRPC packages to `apps/api/package.json`: `@trpc/server`, `zod`
  - [x] Add tRPC client packages to `apps/web/package.json`: `@trpc/client`, `@trpc/react-query`, `@trpc/server`, `@tanstack/react-query`
  - [x] Run `pnpm install` from repo root

- [x] Task 2: Configure Clerk in Next.js web app (AC: #1, #2, #4, #5)
  - [x] Update `apps/web/src/app/layout.tsx` to wrap the app with `<ClerkProvider>`
  - [x] Update `apps/web/src/proxy.ts` to use `clerkMiddleware` from `@clerk/nextjs/server`, protecting `(admin)/` and `(presenter)/` routes
  - [x] Create `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` using Clerk's `<SignIn>` component
  - [x] Create `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` using Clerk's `<SignUp>` component
  - [x] Create `apps/web/src/app/(auth)/layout.tsx` with centered auth layout (no sidebar)
  - [x] Update `apps/web/src/app/(admin)/layout.tsx` to add `<UserButton>` in header + server-side auth check

- [x] Task 3: Implement Clerk provider in NestJS API (AC: #3, #4)
  - [x] Create `apps/api/src/modules/auth/infrastructure/clerk.provider.ts` — Clerk backend SDK client as NestJS provider
  - [x] Create `apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.ts` — validates Clerk JWT from Authorization header
  - [x] Create `apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.spec.ts` — unit tests for guard
  - [x] Create `apps/api/src/modules/auth/application/queries/get-current-user.query.ts` — extracts current user from Clerk JWT
  - [x] Update `apps/api/src/modules/auth/auth.module.ts` to export ClerkProvider and ClerkAuthGuard

- [x] Task 4: Set up tRPC infrastructure in NestJS (AC: #4)
  - [x] Create `apps/api/src/trpc/trpc.context.ts` — request context type with Clerk `userId`
  - [x] Create `apps/api/src/trpc/trpc.init.ts` — extracted `t = initTRPC...create()` to break circular import
  - [x] Create `apps/api/src/trpc/trpc.router.ts` — root tRPC router combining sub-routers
  - [x] Create `apps/api/src/trpc/trpc.module.ts` — NestJS module mounting tRPC as Express middleware
  - [x] Create `apps/api/src/trpc/routers/auth.router.ts` — protected `auth.getMe` procedure
  - [x] Create `apps/api/src/trpc/index.ts` — types-only export for cross-package AppRouter type sharing
  - [x] Update `apps/api/src/app.module.ts` to import `TrpcModule`

- [x] Task 5: Set up tRPC client in Next.js (AC: #4)
  - [x] Create `apps/web/src/lib/trpc.tsx` — typed tRPC React client using `@trpc/react-query` (`.tsx` for JSX)
  - [x] Update `apps/web/src/app/layout.tsx` to include `TrpcProvider` and `QueryClientProvider`

- [x] Task 6: Env validation (AC: #3, #4)
  - [x] Update `apps/api/src/config/env.config.ts` to include `CLERK_SECRET_KEY` in Zod schema

- [x] Task 7: Verify CI passes
  - [x] Run `pnpm exec turbo run lint typecheck test build` — all 11/11 tasks passed

## Dev Notes

### CRITICAL — Story 1.1 Gotchas (MUST READ BEFORE CODING)

1. **`proxy.ts` NOT `middleware.ts`**: Next.js 16 in this project uses `apps/web/src/proxy.ts` with an exported function named `proxy`. Architecture docs reference `middleware.ts` — **that is wrong for this project**. Always use `proxy.ts`. This was confirmed working in Story 1.1.

2. **Current `proxy.ts` is a pass-through stub** from Story 1.1 — this story replaces its body with `clerkMiddleware`.

3. **`reflect-metadata` in Vitest setup** — `apps/api/vitest.config.ts` has `setupFiles: ['reflect-metadata']`. All NestJS spec files inherit this; do not import it manually.

4. **ESLint `disableTypeChecked` for spec files** — `apps/api/eslint.config.mjs` disables type-checked rules on `**/*.spec.ts`. This is intentional — do not remove it.

5. **Vitest `passWithNoTests: true`** — Both `apps/api` and `apps/web` vitest configs have this. Tests must exist and pass, but the pipeline won't fail if a package has no test files.

6. **`export {}` on placeholder files** — All placeholder `.ts` files in packages need `export {}` to be valid TypeScript modules. This was fixed in Story 1.1.

### Clerk Architecture Decisions

| Decision       | Choice                    | Notes                               |
| -------------- | ------------------------- | ----------------------------------- |
| Organizer Auth | Clerk (JWT)               | SOC 2, zero-ops, email + OAuth      |
| JWT expiry     | 15-min + refresh          | Clerk handles refresh automatically |
| Judge Auth     | Invite tokens (NOT Clerk) | Story 2.5 — NOT this story          |
| Public views   | Unauthenticated           | No Clerk on public routes           |

**Packages:**

- `@clerk/nextjs` — Next.js frontend integration (ClerkProvider, SignIn, SignUp, UserButton, auth(), useAuth())
- `@clerk/backend` — NestJS/Node.js JWT verification (`createClerkClient`, `verifyToken`)

**Environment variables** (already in `.env.example` from Story 1.1):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...   # Web only
CLERK_SECRET_KEY=sk_test_...                     # Web + API
```

### Clerk + Next.js 16 `proxy.ts` Integration

Clerk's `clerkMiddleware()` is designed for Next.js middleware. Wrap it for the `proxy` export:

```typescript
// apps/web/src/proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/competitions(.*)',
  '/present/(.*)', // presenter routes require organizer auth
]);

export const proxy = clerkMiddleware(async (auth, request: NextRequest) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

> **⚠️ VERIFY at runtime**: If Clerk's `clerkMiddleware()` return type does not satisfy Next.js 16's expected `proxy` signature, wrap it:
>
> ```typescript
> export function proxy(req: NextRequest) {
>   return clerkMiddleware(async (auth, request) => {
>     if (isProtectedRoute(request)) await auth.protect();
>   })(req);
> }
> ```

### Clerk + NestJS Guard Pattern

The `ClerkAuthGuard` extracts the Bearer token from `Authorization` header and verifies via `@clerk/backend`:

```typescript
// apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; userId?: string }>();
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing auth token');

    const clerk = createClerkClient({ secretKey: process.env['CLERK_SECRET_KEY'] });
    try {
      const payload = await clerk.verifyToken(token);
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid auth token');
    }
  }
}
```

The `clerk.provider.ts` should provide `createClerkClient(...)` as an injectable NestJS provider so it can be injected and mocked in tests.

### tRPC + NestJS Setup

Use Express middleware mount approach (avoids 3rd party adapter dependency):

```typescript
// apps/api/src/trpc/trpc.module.ts
// Mount tRPC router at /trpc using Express adapter
// NestFactory.create<NestExpressApplication>(AppModule) in main.ts is required
```

```typescript
// apps/api/src/main.ts — ensure NestExpressApplication
import { NestExpressApplication } from '@nestjs/platform-express';
const app = await NestFactory.create<NestExpressApplication>(AppModule);
```

**tRPC context** extracts Clerk `userId` from the request (set by `ClerkAuthGuard` or from middleware):

```typescript
// apps/api/src/trpc/trpc.context.ts
export interface TrpcContext {
  userId: string | null;
  req: Request;
}
```

**Auth router** — single protected procedure for this story:

```typescript
// apps/api/src/trpc/routers/auth.router.ts
export const authRouter = router({
  getMe: protectedProcedure.query(({ ctx }) => ({ userId: ctx.userId })),
});
```

### Web: Root Layout Updates

`<ClerkProvider>` wraps the entire app. `QueryClientProvider` and `TrpcProvider` are added alongside:

```typescript
// apps/web/src/app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';
import { TrpcProvider } from '@/lib/trpc';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <TrpcProvider>{children}</TrpcProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

### Auth Route Group `(auth)`

Clerk requires dedicated sign-in and sign-up pages. Create a new `(auth)` route group:

```
apps/web/src/app/
├── (auth)/
│   ├── sign-in/[[...sign-in]]/page.tsx   ← Clerk catch-all for sign-in flow
│   ├── sign-up/[[...sign-up]]/page.tsx   ← Clerk catch-all for sign-up flow
│   └── layout.tsx                         ← centered, no sidebar
```

The `[[...sign-in]]` pattern (double-bracket) is Clerk's standard catch-all — it handles all sub-paths of the multi-step sign-in flow. Configure in Clerk dashboard:

- Sign-in URL: `/sign-in`
- Sign-up URL: `/sign-up`
- After sign-in redirect URL: `/dashboard`
- After sign-up redirect URL: `/dashboard`

### Admin Layout Auth Check

Update `apps/web/src/app/(admin)/layout.tsx` for defense-in-depth (middleware is primary protection):

```typescript
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div>
      <header>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>
      <main>{children}</main>
    </div>
  );
}
```

### Route Protection Summary

| Route Group     | Auth Required | Protection Method                         |
| --------------- | ------------- | ----------------------------------------- |
| `(admin)/*`     | Clerk JWT     | `clerkMiddleware` + layout `auth()` check |
| `(presenter)/*` | Clerk JWT     | `clerkMiddleware`                         |
| `(auth)/*`      | None (public) | Excluded from matcher                     |
| `(judge)/*`     | Invite token  | NOT Clerk — implemented in Story 2.5      |
| `(public)/*`    | None          | No middleware                             |

### Env Config Zod Schema Update

```typescript
// apps/api/src/config/env.config.ts — add to schema:
CLERK_SECRET_KEY: z.string().min(1),
```

### Testing Strategy

**API (Vitest, co-located):**

`clerk-auth.guard.spec.ts` — mock `@clerk/backend`:

```typescript
vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn().mockReturnValue({
    verifyToken: vi.fn().mockResolvedValue({ sub: 'user_abc123' }),
  }),
}));
// Test: valid token → userId set; missing token → UnauthorizedException; invalid token → UnauthorizedException
```

**Web (Vitest + jsdom):**

`(admin)/layout.spec.tsx` — smoke test using Clerk's testing utilities:

```typescript
// @clerk/nextjs provides mock providers for testing
import { ClerkProvider } from '@clerk/nextjs';
// Render layout in mock authenticated state; verify no crash
```

### Project Structure Notes

**New files for this story:**

```
apps/web/src/app/(auth)/layout.tsx
apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
apps/api/src/modules/auth/infrastructure/clerk.provider.ts
apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.ts
apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.spec.ts
apps/api/src/modules/auth/application/queries/get-current-user.query.ts
apps/api/src/trpc/trpc.context.ts
apps/api/src/trpc/trpc.router.ts
apps/api/src/trpc/trpc.module.ts
apps/api/src/trpc/routers/auth.router.ts
apps/web/src/lib/trpc.ts
```

**Modified files:**

```
apps/web/src/proxy.ts                          ← replace stub with clerkMiddleware
apps/web/src/app/layout.tsx                    ← add ClerkProvider + TrpcProvider
apps/web/src/app/(admin)/layout.tsx            ← add auth() check + UserButton
apps/api/src/modules/auth/auth.module.ts       ← export guard + provider
apps/api/src/app.module.ts                     ← add TrpcModule
apps/api/src/config/env.config.ts              ← add CLERK_SECRET_KEY to Zod schema
apps/api/package.json                          ← add @clerk/backend, @trpc/server, zod
apps/web/package.json                          ← add @clerk/nextjs, @trpc/* packages
```

### Anti-Patterns to Avoid

- ❌ Do NOT use `middleware.ts` — this project uses `proxy.ts`
- ❌ Do NOT implement judge invite token auth here — that is Story 2.5
- ❌ Do NOT create `users` or `organizations` database tables — that is Story 1.3
- ❌ Do NOT add RLS guard setup — that is Story 1.3
- ❌ Do NOT implement tRPC procedures beyond `auth.getMe` — leave other routers as empty shells
- ❌ Do NOT use `any` types — TypeScript strict mode is enforced
- ❌ Do NOT commit `.env.local` — only `.env.example` goes to git (already in `.gitignore`)
- ❌ Do NOT skip the `NestExpressApplication` type if using Express middleware mount for tRPC

### References

- Clerk auth decision [Source: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`]
- Auth module file structure [Source: `_bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure` lines 722–738]
- Route boundaries [Source: `_bmad-output/planning-artifacts/architecture.md#Architectural Boundaries`]
- FR56–FR61 coverage [Source: `_bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping`]
- tRPC gap analysis [Source: `_bmad-output/planning-artifacts/architecture.md#Gap Analysis Results`]
- Story 1.2 acceptance criteria [Source: `_bmad-output/planning-artifacts/epics.md#Story 1.2`]
- Story 1.1 proxy.ts gotcha [Source: `_bmad-output/implementation-artifacts/1-1-monorepo-foundation-and-local-development-environment.md#Completion Notes List`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- **Circular import fix**: `trpc.init.ts` extracted `t = initTRPC.context<TrpcContext>().create()` to break circular dependency between `trpc.router.ts` ↔ `auth.router.ts`. Both now import `t` from `trpc.init.ts`.
- **Framework-agnostic TrpcContext**: `trpc.context.ts` has no express imports (`userId: string | null` only). This allows the web app to import `AppRouter` type via workspace dep without pulling express into the Next.js build.
- **Cross-package type sharing**: `apps/api/package.json` exports `{ "./trpc": { "types": "./src/trpc/index.ts" } }`. `apps/web` adds `@competition-platform/api: "workspace:*"` as devDependency and imports `type { AppRouter } from '@competition-platform/api/trpc'`. Using `AnyTRPCRouter` instead triggers a tRPC v11 string-literal type error.
- **`createContext` inlined in `trpc.module.ts`**: Not in a shared module — the express types (`Request`, `Response`) are only safe to use in the API context. Moving it there avoided type errors in the web app.
- **`trpc.tsx` not `.ts`**: The `TrpcProvider` component in `apps/web/src/lib/trpc.tsx` uses JSX (`<trpc.Provider>`), requiring `.tsx` extension.
- **Clerk v5 guard**: Uses standalone `verifyToken(token, { secretKey })` from `@clerk/backend` directly (not via `createClerkClient`). `clerk.provider.ts` wraps `createClerkClient` as an injectable for future use.
- **Test mock queue**: Vitest `mockResolvedValueOnce`/`mockRejectedValueOnce` mocks queue. If a guard throws before calling `verifyToken`, the unconsumed mock leaks to the next test. Test 3 ("Bearer token part missing") must NOT queue a mock — the guard short-circuits before calling `verifyToken`.
- **CI result**: Full turbo pipeline passed: 11/11 tasks (lint ×2, typecheck ×6 cached, test ×2, build ×2).

**Code Review Fixes (applied during review):**

- **[H1] tRPC `createContext` now verifies JWT directly**: NestJS guards don't run for Express middleware routes. `createContext` in `trpc.module.ts` was changed to `async`, imports `verifyToken` from `@clerk/backend`, and extracts + validates the Bearer token from `req.headers['authorization']` itself. No longer relies on `req.userId` from the guard pipeline.
- **[H1] tRPC client now sends Clerk JWT**: `apps/web/src/lib/trpc.tsx` updated — `TrpcProvider` calls `useAuth()` to get `getToken`, and passes an async `headers()` function to `httpBatchLink` that injects `Authorization: Bearer <token>` on every request.
- **[M1] Clerk routing props added**: `<SignIn routing="path" path="/sign-in" />` and `<SignUp routing="path" path="/sign-up" />` — required for proper path-based routing with `[[...sign-in]]` / `[[...sign-up]]` catch-all conventions (multi-step flows, OAuth callbacks).
- **[M2] Clerk redirect URL env vars added to `.env.example`**: `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard`.
- **[M3] Dead `CLERK_CLIENT` Symbol removed** from `clerk.provider.ts` — was exported but never used as a DI token.
- **[M4] `proxy.ts` middleware callback made `async`**: `await auth().protect()` — consistent with Clerk docs and safe against future async changes to `protect()`.
- **CI after fixes**: 11/11 tasks pass.

### File List

**New files:**

- `apps/api/src/modules/auth/infrastructure/clerk.provider.ts`
- `apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.ts`
- `apps/api/src/modules/auth/infrastructure/guards/clerk-auth.guard.spec.ts`
- `apps/api/src/modules/auth/application/queries/get-current-user.query.ts`
- `apps/api/src/trpc/trpc.context.ts`
- `apps/api/src/trpc/trpc.init.ts`
- `apps/api/src/trpc/trpc.router.ts`
- `apps/api/src/trpc/trpc.module.ts`
- `apps/api/src/trpc/routers/auth.router.ts`
- `apps/api/src/trpc/index.ts`
- `apps/web/src/app/(auth)/layout.tsx`
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- `apps/web/src/lib/trpc.tsx`

**Modified files:**

- `apps/web/src/proxy.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/(admin)/layout.tsx`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.config.ts`
- `apps/api/package.json`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `.env.example` ← added Clerk redirect URL env vars (code review fix)
