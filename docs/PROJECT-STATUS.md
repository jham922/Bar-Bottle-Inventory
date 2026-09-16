# Project status — bar-bottle-inventory

_Maintained jointly. Last updated 2026-09-16 by the Hermes assistant._
_Read `docs/CHANGES.md` for the running log; append a line there after any session._

## 3. Bar Bottle Inventory — *strongest product, parked 4 months*

**What it is:** photo-based bottle counting. Scan a single bottle or a whole shelf; AI identifies brand and estimates fill level; fill % editable before saving; counts shown as decimal bottles (2.5, not 3).

**Where:** repo `Bar-Bottle-Inventory` · live at `bar-bottle-inventory.vercel.app` · Supabase `wqxuuqnmnuaokvmccpjt` · Expo + React Native Web + TypeScript, Jest tests, 5 migrations, 3 phased feature branches

**Done:** single + shelf scan, editable fill, decimal-bottle aggregation, inventory sessions and history, admin/staff roles, reports, recipes, Toast import, CSV export. Multi-tenant from the first migration.

**Next**
1. **Catalog-first identification** — identify each product once against a reference image, then later scans are cheap matching instead of a paid vision call. This is the fix for the cost problem.
2. One canonical item ID shared with the costing and ops apps (today the same bottle has three names).
3. Offline queue — counts happen in walk-ins with bad wi-fi.
4. Feed its ounce-accurate counts into the ops variance engine, which currently assumes whole bottles.
5. Complements the voice counting wanted on the ops app (see §1, item 6): photo capture for a shelf of back stock, voice for quick item-by-item counts. Both follow the same confirm-before-save rule.

**Blocking:** vision API cost; catalog not built; untouched since 12 May.

---

---

Source: full cross-project survey kept on the Hermes host (`~/business-reports/project-status-2026-09-16.md`).
