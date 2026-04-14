# Bar Bottle Inventory

A web app for tracking bar bottle inventory. Scan bottles, monitor fill levels, set low-stock alerts, and view consumption reports.

**Live:** https://bar-bottle-inventory.vercel.app

## Features

- **Bottle scanning** — scan a bottle photo to identify it and record fill level
- **Inventory list** — browse all bottles with fill bars, search, and filter by spirit type
- **Scan history** — per-bottle history of every scan with timestamps
- **Low-stock alerts** — set a threshold (ml) per bottle; get flagged when stock runs low
- **Consumption reports** — variance and consumption analytics over time
- **Team management** — invite staff, manage roles (admin / staff)
- **Toast POS import** — import bottle data from Toast CSV exports
- **Recipe management** — track cocktail recipes and ingredient usage

## Tech stack

- [Expo](https://expo.dev) (SDK 54) + Expo Router v6
- React Native Web
- [Supabase](https://supabase.com) — Postgres, Auth, RLS
- [Vercel](https://vercel.com) — static hosting

## Local development

```bash
npm install
# create .env.local with your Supabase credentials:
# EXPO_PUBLIC_SUPABASE_URL=...
# EXPO_PUBLIC_SUPABASE_ANON_KEY=...
npm run web
```

## Deploying

Build locally and push — Vercel serves the pre-built `dist/` folder:

```bash
npx expo export -p web
git add dist/
git commit -m "rebuild dist"
git push
```

## Database

Supabase project: `wqxuuqnmnuaokvmccpjt`

Migrations are in `supabase/migrations/`. Run them in order via the Supabase SQL editor or Supabase MCP.

## Roles

| Role | Permissions |
|------|------------|
| `admin` | Full access — add/edit/delete bottles, manage team, set alerts |
| `staff` | Scan bottles, view inventory and reports |
