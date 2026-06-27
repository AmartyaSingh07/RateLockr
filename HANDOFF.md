# RateLockr — Fix Handoff

> **Written**: 2026-06-27  
> **Scope**: All confirmed real bugs from the audit. Items marked false positives in the audit
> review are excluded. Nothing in this doc touches the Lua scripts, algorithm logic, or
> Redis data structures — those are correct and must not change.

---

## Deployment topology (read this first)

Both the API and the dashboard deploy from a **single repo to Vercel** — two separate
Vercel projects, same GitHub repo.

| Surface | Vercel project | Root directory | Entry point | How it builds |
|---|---|---|---|---|
| **API** | `ratelockr-api` (or equivalent) | `api/` | `api/api/[...all].ts` — serverless function that imports `../src/app` | Vercel runs `tsc` + Lua copy at build time; `vercel.json` rewrites all routes to `/api/[...all]` |
| **Dashboard** | `rate-lockr` | `dashboard/` | `dashboard/src/main.tsx` | Standard Vite build; reads `VITE_API_URL` at build time |

**How the API serverless handler works**: `api/api/[...all].ts` calls `initRedis()` once
per cold start (guarded by a module-level promise so it only runs once), then delegates
every request directly to the Express `app`. The eviction background interval is
automatically disabled on Vercel (`redis.ts` checks `process.env["VERCEL"]`).

**`VITE_API_URL` must be updated**: `dashboard/.env.production` currently points to
`https://api-ratelockr.render.com`. Change this to your Vercel API deployment URL
(e.g. `https://ratelockr-api.vercel.app`) in the Vercel dashboard environment variables
for the dashboard project — not in the file, since `.env.production` is gitignored.

**Critical**: `api/dist/` is currently **committed to git** and tracked. Vercel compiles
TypeScript at deploy time so the committed `dist/` is dead weight — but removing it
requires a `.gitignore` update AND a `git rm -r --cached api/dist/` to untrack without
deleting. Do this carefully (Fix 6).

**Local uncommitted changes**: `git status` shows ~80 modified files across `api/dist/`,
`api/src/`, `dashboard/src/`, and config files — none staged. Before making any fix,
run `git stash` or commit the in-progress changes first so you have a clean baseline.

---

## Fix 1 — Remove hardcoded admin key fallback

**File**: `api/src/middleware/auth.ts`  
**Risk**: Low — one line change, no deploy config needed beyond setting the env var

**Current code** (line 3–4):
```typescript
const apiKey = req.headers["x-api-key"];
const expectedKey = process.env.ADMIN_API_KEY || "dev_admin_secret_key_987654321";
```

**Problem**: If `ADMIN_API_KEY` is missing from the Render environment, the hardcoded
fallback means `/api/rules` and `/api/stats` are wide open to anyone who reads the source.

**Replace the entire file with**:
```typescript
import { Request, Response, NextFunction } from "express";

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const expectedKey = process.env["ADMIN_API_KEY"];

  // Fail loud at startup if the key is not configured — do not silently
  // fall back to a default that is committed in the public repo.
  if (!expectedKey) {
    res.status(503).json({
      error: "Service misconfigured",
      message: "ADMIN_API_KEY environment variable is not set.",
    });
    return;
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
```

**Before deploying**: Set `ADMIN_API_KEY` in two places in the Vercel dashboard before
pushing this code:
1. The **API project** (Vercel → ratelockr-api → Settings → Environment Variables): add `ADMIN_API_KEY`
2. The **dashboard project** (Vercel → rate-lockr → Settings → Environment Variables): add `VITE_ADMIN_API_KEY` with the same value

If you push the code before these exist, the dashboard immediately loses access to rules
and stats.

**Verify**: After deploy, `curl https://<your-api-vercel-url>/api/rules` (no key) should
return `401`. With `X-API-Key: <your-key>` it should return `200`.

---

## Fix 2 — Verify Vercel build configuration

**Where**: Vercel dashboard — API project settings  
**Risk**: Zero — no code changes, just confirming platform config

On Vercel serverless there is no long-running process, so SIGTERM graceful shutdown
doesn't apply. However, you need to confirm the Vercel build is configured correctly
for the API project or deployments will silently use stale `dist/` files.

**Check these settings** in Vercel → ratelockr-api → Settings → Build & Output Settings:

| Setting | Required value |
|---|---|
| Framework Preset | Other |
| Root Directory | `api` |
| Build Command | `npm run build` (runs `tsc && cpy "src/scripts/**/*.lua" dist/scripts/`) |
| Output Directory | *(leave blank — Vercel uses `api/[...all].ts` as the function entry)* |
| Install Command | `npm install` |

**Why the build command matters**: `npm run build` compiles TypeScript and copies the Lua
scripts into `dist/scripts/`. The Lua scripts are loaded inline from `luaScripts.ts` (as
embedded strings), not read from disk at runtime, so the copy step is technically
redundant for the serverless handler — but it keeps the build output clean.

**Also confirm** the `api/api/[...all].ts` file is being picked up as the serverless
function. Vercel auto-detects files under `api/` as function handlers. The `vercel.json`
rewrite `"source": "/(.*)" → "destination": "/api/[...all]"` routes everything through it.

**Verify**: After any deploy, `GET /health` on the Vercel API URL should return
`{ "status": "ok", "redis": "connected" }`.

---

## Fix 3 — Delete `/test-scan` debug endpoint

**File**: `api/src/app.ts`  
**Risk**: Zero — pure deletion, no callers

**Remove lines 56–63**:
```typescript
app.get("/test-scan", async (_req, res) => {
  try {
    const rawResult = await redis.scan("0", "MATCH", "rl:rules:*", "COUNT", 100);
    res.status(200).json({ rawResult });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});
```

This endpoint has no auth guard and dumps raw Redis key data to any caller.

**Verify**: After deploy, `GET /test-scan` should return 404.

---

## Fix 4 — Deduplicate `scanKeys()`

**Files**: `api/src/store/redis.ts`, `api/src/routes/rules.ts`, `api/src/routes/stats.ts`  
**Risk**: Low — pure refactor, behavior identical

**Problem**: The same 15-line cursor-based `scanKeys()` function is copy-pasted in all
three files. A bug fix in one won't propagate to the others.

**Step 1** — The function already exists in `redis.ts` as a module-private function.
Export it by adding `export` to its declaration in `redis.ts`:

```typescript
// redis.ts — find this line (~line 433):
async function scanKeys(pattern: string): Promise<string[]> {

// Change to:
export async function scanKeys(pattern: string): Promise<string[]> {
```

**Step 2** — In `api/src/routes/rules.ts`, delete the local `scanKeys` function (lines
21–38) and add this import at the top:

```typescript
import { redis, scanKeys } from "../store/redis";
```

**Step 3** — In `api/src/routes/stats.ts`, delete the local `scanKeys` function (lines
53–72) and add the same import:

```typescript
import { redis, scanKeys } from "../store/redis";
```

**Verify**: `npm run lint` (runs `tsc --noEmit`) must pass. Then verify the dashboard
rules table and stats still load correctly after deploy.

---

## Fix 5 — Unify telemetry recording into `lib/telemetry.ts`

**Files**: `api/src/middleware/rateLimiter.ts`, `api/src/routes/check.ts`  
**Risk**: Medium — touches two hot paths. Test locally before deploying.

**Problem**: `rateLimiter.ts` has `recordRequestEvent()` (~38 lines) and `check.ts` has
`recordTimelineEvent()` (~22 lines). They both write time-bucket keys and lifetime
counters. The difference: `rateLimiter.ts` does both in one function; `check.ts` does
the lifetime counter inline and the bucket in a separate function. Logic drift is
guaranteed as the codebase evolves.

**Step 1** — Create `api/src/lib/telemetry.ts`:

```typescript
import { redis } from "../store/redis";
import { statsAllowKey, statsDenyKey } from "./keys";
import { logger } from "./logger";

/**
 * Records a single rate-limit decision event.
 * Increments the lifetime counter and writes a 1-second time-bucket key.
 * Called after every allow/deny decision in both check.ts and rateLimiter.ts.
 */
export async function recordEvent(clientId: string, allowed: boolean): Promise<void> {
  // 1. Lifetime counter
  const counterKey = allowed ? statsAllowKey(clientId) : statsDenyKey(clientId);
  try {
    await redis.incr(counterKey);
  } catch (err) {
    logger.error({ err, clientId, allowed }, "Failed to increment lifetime counter");
  }

  // 2. Per-second time buckets (TTL 120s)
  const nowSec = Math.floor(Date.now() / 1000);
  const field = allowed ? "allowed" : "denied";
  const globalKey = `rl:tsbkt:g:${field}:${nowSec}`;
  const clientKey = `rl:tsbkt:${clientId}:${field}:${nowSec}`;

  try {
    const pipe = redis.pipeline();
    pipe.incr(globalKey);
    pipe.incr(clientKey);
    pipe.expire(globalKey, 120);
    pipe.expire(clientKey, 120);
    await pipe.exec();
  } catch (err) {
    logger.error({ err, clientId, nowSec }, "Pipeline bucket write failed — falling back to direct writes");
    redis.incr(globalKey).then(() => redis.expire(globalKey, 120)).catch(() => {});
    redis.incr(clientKey).then(() => redis.expire(clientKey, 120)).catch(() => {});
  }
}
```

**Step 2** — In `api/src/middleware/rateLimiter.ts`:
- Delete the `recordRequestEvent` function (~lines 45–82)
- Add import: `import { recordEvent } from "../lib/telemetry";`
- Replace both call sites:
  - `recordRequestEvent(resolvedClientId, false).catch(...)` → `recordEvent(resolvedClientId, false).catch(...)`
  - `recordRequestEvent(resolvedClientId, true).catch(...)` → `recordEvent(resolvedClientId, true).catch(...)`

**Step 3** — In `api/src/routes/check.ts`:
- Delete the `recordTimelineEvent` function (~lines 23–42)
- Delete the inline `redis.incr(statsDenyKey(client_id))` and `redis.incr(statsAllowKey(client_id))` calls
- Add import: `import { recordEvent } from "../lib/telemetry";`
- Replace both call sites:
  - After the deny branch: `recordEvent(client_id, false).catch(...)`
  - After the allow branch: `recordEvent(client_id, true).catch(...)`

**Verify**: Run the concurrency integration test (`npm test` from `api/`) — it fires 20
simultaneous requests and asserts exactly 10 allow + 10 deny. This must still pass.
Then check the dashboard timeline chart is still updating after a traffic burst.

---

## Fix 6 — Stop tracking `api/dist/` in git

**Files**: `.gitignore`, git index  
**Risk**: Medium — requires understanding why `dist/` is committed before removing it

**Why it was committed**: Early in the project, the Vercel serverless entry point
(`api/api/[...all].ts`) was structured to import pre-built JS from `dist/`. That
architecture has since changed — `[...all].ts` now imports directly from `../src/app`
(TypeScript source), and Vercel compiles it at deploy time via `npm run build`. The
committed `dist/` serves no deployment purpose and causes ~50 noisy file diffs on every
`git status`.

**Step 1** — Fix `.gitignore`. Currently it has `dashboard/dist/` and `service/dist/`
but not `api/dist/`. Add it:

```
# in .gitignore, under "Local Compilation Build Directories & Maps":
api/dist/
```

**Step 2** — Untrack the directory from git without deleting the local files:

```bash
git rm -r --cached api/dist/
```

This stages the deletions. The files remain on disk (they're still built locally by
`npm run build`) but git stops tracking them.

**Step 3** — Commit:

```bash
git add .gitignore
git commit -m "chore: stop tracking api/dist/ in git"
git push
```

**Step 4** — Immediately watch the Vercel deployment log (Vercel → ratelockr-api →
Deployments) to confirm the build completes. If it fails with a TypeScript error, the
build command isn't running — check Fix 2's Vercel settings and revert with
`git revert HEAD` and push if needed.

**Verify**: `git status` after the commit should show no `api/dist/` files.
`GET /health` on the Vercel API URL should return `{ "status": "ok", "redis": "connected" }`.

---

## Fix 7 — Align time-bucket TTL with chart window

**File**: `api/src/middleware/rateLimiter.ts` and `api/src/lib/telemetry.ts` (after Fix 5)  
**Risk**: Zero — cosmetic constant change, no behavioral impact

**Problem**: Buckets are written with a 120s TTL but the stats endpoint only reads the
last 30 seconds. 90 seconds of data exists in Redis with no reader. This wastes memory
and will silently break if someone extends the chart window beyond 120s.

After Fix 5 creates `lib/telemetry.ts`, the TTL constant lives in one place. Change the
two `expire` calls from `120` to `45`:

```typescript
pipe.expire(globalKey, 45);
pipe.expire(clientKey, 45);
```

45 seconds = 30s chart window + 15s buffer for clock skew and polling jitter. If you
ever extend the chart to 60s, bump this to 75s.

If you haven't done Fix 5 yet, apply this to both the `recordRequestEvent` function in
`rateLimiter.ts` and the `recordTimelineEvent` function in `check.ts`.

**Verify**: No observable change to the dashboard. The chart still shows 30 data points.

---

## Fix 8 — Add client_id / endpoint sanitization to key builder

**File**: `api/src/lib/keys.ts`  
**Risk**: Low — adds a guard, doesn't change key format for valid inputs

**Problem**: `client_id` and `endpoint` are user-supplied strings concatenated directly
into Redis keys. A client ID containing `:` (e.g. `"foo:bar"`) corrupts the key
namespace and breaks SCAN pattern matching (the stats route would match
`stats:allow:foo:bar:*` as a pattern, finding nothing). A client ID of empty string
produces `rl:tb::endpoint`, which would silently merge all unidentified clients.

Add a shared sanitizer and apply it in every key builder:

```typescript
// api/src/lib/keys.ts

/**
 * Strips characters that would corrupt the Redis key namespace.
 * Colons are the namespace delimiter; spaces and wildcards break SCAN patterns.
 */
function sanitize(input: string): string {
  if (!input || input.trim() === "") {
    throw new Error(`Redis key segment cannot be empty (got: ${JSON.stringify(input)})`);
  }
  // Replace colons, spaces, wildcards, and null bytes with underscores
  return input.replace(/[:\s*?\x00]/g, "_");
}

export function tokenBucketKey(clientId: string, endpoint: string): string {
  return `rl:tb:${sanitize(clientId)}:${sanitize(endpoint)}`;
}

export function slidingWindowKey(clientId: string, endpoint: string): string {
  return `rl:sw:${sanitize(clientId)}:${sanitize(endpoint)}`;
}

export function fixedWindowKey(clientId: string, endpoint: string): string {
  return `rl:fw:${sanitize(clientId)}:${sanitize(endpoint)}`;
}

export function rulesKey(clientId: string): string {
  return `rl:rules:${sanitize(clientId)}`;
}

export function statsAllowKey(clientId: string): string {
  return `stats:allow:${sanitize(clientId)}`;
}

export function statsDenyKey(clientId: string): string {
  return `stats:deny:${sanitize(clientId)}`;
}
```

**Important**: The Zod schemas already enforce `max(128)` and `max(256)` on inputs, and
the existing seeded `client_id` values (`anonymous_crawler`, `user_premium_zone`, etc.)
contain no colons. Sanitization is a defense-in-depth layer, not a breaking change for
any valid existing data.

**Verify**: Run `npm run lint` and the full test suite. The seeded client IDs and
endpoints should produce identical keys before and after (no colons or wildcards in them).

---

## Execution order

Do these in sequence. Each fix is independent, but the order avoids any deploy that
could break the running service:

1. **Fix 1** (auth key) — set `ADMIN_API_KEY` in Vercel dashboard for both projects first, then push the code
2. **Fix 2** (Vercel build config) — verify in Vercel dashboard, no code push needed
3. **Fix 3** (delete `/test-scan`) — push with Fix 1, same commit is fine
4. **Fix 4** (deduplicate `scanKeys`) — push separately, run `npm run lint` first
5. **Fix 5** (unify telemetry) — push separately, run `npm test` first
6. **Fix 7** (TTL constant) — can be in the same commit as Fix 5 since `telemetry.ts` is new
7. **Fix 8** (key sanitization) — push separately, run `npm run lint` and `npm test`
8. **Fix 6** (untrack `api/dist/`) — do this last, after confirming Vercel build settings

---

## What was deliberately excluded

These items from the audit were investigated and found to be non-issues or by-design:

- **CORS config** — the whitelist is correct. CORS is browser-enforced only; server-to-server callers are unaffected. `/api/check` is designed to be called server-side.
- **No auth on `/api/check`** — intentional public consumption endpoint. Adding auth here would require every downstream service to manage credentials, which is out of scope for a gateway.
- **Lua EXPIRE race condition** — impossible. Lua scripts execute atomically in Redis's single-threaded loop. The `current_count == cost` condition correctly detects key creation.
- **Global error middleware missing** — it exists. `app.ts:103–110` is a valid 4-argument Express error handler that returns `{ error: "Internal Server Error" }` with no stack trace.
- **SCAN performance** — low risk at current scale. The stats route already uses cursor-based SCAN, not `KEYS`. A `rl:clients` secondary index would be worth adding if the client count exceeds a few hundred.
- **`render.yaml`** — this file can be deleted from the repo since everything deploys to Vercel. It has no effect while it's there, but it's dead config.
