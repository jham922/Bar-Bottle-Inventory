# Bar Bottle Inventory — Claude Code Guide

## Project overview

React Native / Expo web app for bar bottle inventory management. Deployed as a **static SPA** on Vercel. Backend is Supabase (Postgres + RLS + Edge Functions).

**Live URL:** https://bar-bottle-inventory.vercel.app

## Tech stack

- **Expo SDK 54** with Expo Router v6 (file-based routing)
- **React Native Web** — this is a web-only app, not a native mobile app
- **Supabase** — auth, database, RLS row-level security
- **Vercel** — static hosting of pre-built `dist/` folder

## Deployment workflow

**Always build locally and commit `dist/`. Never rely on Vercel to build.**

```bash
npx expo export -p web   # reads .env.local, inlines EXPO_PUBLIC_* vars
git add dist/
git commit -m "rebuild dist"
git push                 # Vercel auto-deploys on push
```

Reason: Metro bundler must inline `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` at build time. Vercel's build environment cannot do this correctly for Expo. The `.env.local` file (gitignored) holds the real credentials; `lib/supabase.ts` also has hardcoded fallback values as a safety net.

## Environment variables

Stored in `.env.local` (gitignored). Required:

```
EXPO_PUBLIC_SUPABASE_URL=https://wqxuuqnmnuaokvmccpjt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## Supabase

- Project ref: `wqxuuqnmnuaokvmccpjt`
- RLS is enabled on all tables. Policies use `current_user_role()` and `current_bar_id()` helper functions.
- Migrations live in `supabase/migrations/`. Apply via Supabase MCP or the Supabase dashboard SQL editor.
- Edge function `analyze-bottle` is deployed with `verify_jwt: false` — the function handles auth internally. Do NOT redeploy with `verify_jwt: true` or all scan requests will 401.

## Key files

| Path | Purpose |
|------|---------|
| `lib/supabase.ts` | Supabase client (hardcoded fallback credentials + `.trim()`) |
| `lib/inventory.ts` | Inventory list queries |
| `lib/scan.ts` | Scan utilities (ml/oz conversion, etc.) |
| `app/_layout.tsx` | Root layout — seeds auth state from `getSession()` on load to prevent blank screen on refresh |
| `app/(app)/inventory/index.tsx` | Inventory list — reloads on focus via `useFocusEffect` so deleted bottles disappear immediately |
| `app/(app)/inventory/[id].tsx` | Bottle detail + delete — uses `.maybeSingle()` not `.single()` |
| `app/(app)/scan/single.tsx` | Single bottle scan + confirm screen — fill %, brand, spirit type, size all editable |
| `app/(app)/scan/shelf.tsx` | Shelf scan — review list with per-bottle editable fill % input |
| `supabase/functions/analyze-bottle/index.ts` | Claude Vision edge function for bottle analysis |
| `vercel.json` | Static output dir + catch-all rewrite for SPA routing |

## Routing

`vercel.json` has a catch-all rewrite `/(.*) → /index.html` so all routes serve the SPA shell. Expo Router handles client-side routing from there.

## Scan flow

**Single scan:** camera → analyzing → confirm screen (fill % at top, editable via TextInput; brand, spirit type, size also editable) → save → inventory

**Shelf scan:** camera → analyzing → review list (each bottle shows editable fill % TextInput + fill bar) → save all → inventory

Fill % is always editable before saving. The AI estimate is a starting point only.

## Common gotchas

- **`.single()` vs `.maybeSingle()`** — always use `.maybeSingle()` for queries that might return 0 rows. `.single()` throws "Cannot coerce the result to a single JSON object" when no rows are found.
- **Inventory list stale after delete** — `useFocusEffect` reloads the list on screen focus. Don't remove it.
- **Blank screen on refresh** — fixed by calling `supabase.auth.getSession()` in `app/_layout.tsx` before waiting for `onAuthStateChange`. Do not revert to `onAuthStateChange`-only.
- **Analysis failed (401)** — the edge function `analyze-bottle` must have `verify_jwt: false`. If redeployed with `verify_jwt: true`, all scan requests will 401. The function does its own JWT validation internally.
- **Browser cache** — after deploying, iOS Safari aggressively caches the old bundle. Users need to open in a Private tab or clear site data to get the updated version.
- **CRLF on Windows** — Git warns about LF→CRLF on `dist/` files. This is harmless.
- **Do not add a `buildCommand` to `vercel.json`** — Vercel should serve `dist/` as-is, not rebuild.
- **Do not use raw HTML elements** (`<input>`, `<button>`) in React Native JSX — they cause silent rendering failures in Expo's static export. Use React Native components only.
