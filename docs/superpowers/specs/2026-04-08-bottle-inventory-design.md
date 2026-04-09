# Bottle Inventory App — Design Spec
**Date:** 2026-04-08  
**Status:** Approved

---

## Overview

A cross-platform bar inventory app that uses AI photo recognition to identify bottles by brand and spirit type, estimate fill levels, and calculate volume remaining in oz/ml. The app supports a small bar team with individual accounts, tracks consumption over time, integrates with Toast POS for theoretical usage calculation, and flags variance between expected and actual pour levels.

---

## Architecture

**Stack:** Expo (React Native + Web via Expo Router) · Supabase · Claude Vision API

**Why Expo:** Single codebase covers iOS, Android, and web. Fast to build, handles app store deployment, and the web experience is sufficient for an internal business tool.

**Client:** Expo app running on iOS, Android, and web browser. Camera access is native on mobile; web uses device camera API.

**Backend:** Supabase provides:
- Auth (email/password, per-user accounts)
- Postgres database
- File storage (bottle scan images)
- Edge Functions (orchestrate Claude Vision API calls)

**AI:** Claude Vision API analyzes every scan photo to identify brand, spirit type, and fill percentage. Volume remaining (oz/ml) is calculated by multiplying fill percentage by the bottle's known total capacity from the catalog.

**Scan flow:**
1. User takes photo (single bottle or shelf)
2. Image uploaded to Supabase Storage
3. Edge Function calls Claude Vision API with the image
4. Claude returns: brand name, spirit type, fill percentage, bottle count (shelf scan)
5. App calculates ml remaining using catalog capacity
6. Results displayed for confirmation, then saved to database

---

## Database Schema

| Table | Key Fields |
|---|---|
| `bottles` | id, brand, spirit_type, total_volume_ml, bottle_image_ref |
| `inventory_scans` | id, bottle_id, fill_pct, volume_remaining_ml, scan_image_url, scanned_by, scanned_at |
| `alerts` | id, bottle_id, threshold_ml, triggered_at, resolved_at |
| `recipes` | id, name, toast_menu_item_name |
| `recipe_ingredients` | id, recipe_id, bottle_id, quantity_oz |
| `toast_uploads` | id, uploaded_by, date_range_start, date_range_end, uploaded_at |
| `toast_sales` | id, upload_id, recipe_id, units_sold |
| `users` | id (Supabase auth), display_name, email, role (admin/staff) |
| `bar` | id, name — single row, all users belong to one bar |

---

## Scan Modes

### Single Bottle — Precision Mode
- Camera shows a guide overlay to center the bottle
- Claude identifies brand, spirit type, and fill percentage
- App calculates volume remaining in ml and oz using catalog capacity
- User sees result with a fill bar and percentage + ml/oz
- User confirms or edits before saving
- If bottle is not in catalog: Claude prompts for brand name and total bottle size once, saves to catalog automatically

### Shelf Scan — Quick Count Mode
- User points camera at a shelf with multiple bottles
- Claude detects all visible bottles simultaneously
- Each bottle is outlined with its percentage and ml remaining overlaid
- Results shown as a list: brand, percentage, ml remaining
- Low-stock bottles flagged with ⚠️ text (no color coding — percentages are the primary signal)
- One tap saves all detected bottles to inventory
- New bottles detected in a shelf scan are queued: after tapping "Save All", the app steps through each unknown bottle one at a time (name + size prompt) before the batch is committed

---

## Inventory & Dashboard

### Home Dashboard
- Bar name and logged-in user name
- Summary stats: total bottle count, low-stock count, spirit type count, date of last scan
- Quick action buttons: Scan, Inventory, Report
- Recent activity feed (team member actions with timestamps)

### Inventory List
- Searchable by brand name
- Filterable by spirit type (Whiskey, Gin, Vodka, Rum, Liqueur, etc.)
- Each row: brand, spirit type, bottle size, fill percentage, ml remaining, fill bar
- Tapping a bottle shows its scan history (fill level over time)

---

## Low-Stock Alerts

- Per-bottle threshold set in ml (e.g., alert when Campari drops below 200ml)
- Alert fires when a scan records volume below threshold
- Alerts screen lists all triggered items with: bottle name, current %, current ml, threshold, how long it's been below threshold
- Each alert has an "Add to Order List" action
- Order list accumulates flagged bottles and can be exported as CSV or shared

---

## Recipe Management

- Recipe tab: list of cocktail recipes, each linked to a Toast menu item name
- Each recipe defines its ingredients as spirit → quantity in oz (e.g., Negroni: Gin 1oz, Campari 1oz, Sweet Vermouth 1oz)
- Bitters and non-spirit ingredients (e.g., Angostura, Peychaud's) are added to the bottle catalog and tracked like any other bottle
- Ingredients not tracked as bottles (Prosecco, soda, juice, garnishes) are added to recipes as reference-only — they appear in the recipe but are excluded from variance calculations
- Recipes are created and edited by Admins only
- Recipe → bottle mapping uses the same bottle catalog entries

---

## Toast POS Integration & Variance Analysis

### Toast Product Mix Upload
- Admin exports a product mix CSV from Toast (Reports → Product Mix) covering a date range
- CSV is uploaded in-app; the app parses it to extract menu item names and units sold
- Each menu item is matched to a recipe by the `toast_menu_item_name` field
- Theoretical usage per spirit = sum across all recipes of (units sold × recipe oz for that spirit), converted to ml

### Variance Report
- Compares theoretical usage (from Toast upload) vs actual usage (from bottle scans) for the same date range
- Actual usage = sum of consumption across all scan pairs for each bottle in the period. When a bottle is replaced mid-period (volume goes up between scans), that reset is treated as a new bottle starting full — consumption is calculated segment by segment and summed, so replacement bottles are counted correctly
- Variance displayed as: theoretical ml, actual ml, difference ml, and percentage variance
- High variance (configurable threshold, default 10%) is flagged with ⚠️ and a note ("Possible over-pouring or spillage — review")
- Exportable as CSV

### Consumption Report
- Shows ml consumed per bottle and per spirit type for a selected date range (week/month/custom)
- Bar chart of most-consumed bottles
- Export: CSV snapshot of current inventory, CSV consumption history (date, bottle, before/after/used ml), PDF, email

---

## Team & Auth

### Roles

| Permission | Admin | Staff |
|---|---|---|
| Scan bottles | ✓ | ✓ |
| View inventory | ✓ | ✓ |
| Edit recipes | ✓ | — |
| View reports & variance | ✓ | — |
| Upload Toast CSV | ✓ | — |
| Manage team | ✓ | — |
| Set alert thresholds | ✓ | — |

### Invite Flow
1. Admin enters staff email and sends invite
2. Staff receives email with sign-up link (expires 48h, handled by Supabase Auth)
3. Staff creates password and is automatically scoped to the bar with Staff role
4. Admin can promote to Admin or remove at any time

### Activity Log
Every scan, edit, recipe change, Toast upload, and export is logged with user name and timestamp. Visible to Admins on the dashboard activity feed.

---

## Key UX Decisions

- **Percentages over color coding:** Fill levels are communicated as explicit percentages (and ml) — not color alone — throughout the app
- **Catalog builds as you scan:** No upfront data entry required. First scan of an unknown bottle prompts for name + size once; subsequent scans recognize it automatically
- **Confirmation before saving:** Single bottle scans require explicit confirmation. Shelf scans show a review list before bulk save
- **Staff simplicity:** Staff see only Scan and Inventory — the UI is uncluttered for their primary use case

---

## Out of Scope

- Multi-location support (single bar only)
- Integration with distributors or ordering systems (order list is manual/CSV only)
- Wine or beer inventory (bottle-based spirits only for now)
- Cost/pricing tracking
