# Marmee

Two-sided marketplace matching experienced moms (helpers) with career moms (families)
needing household help in Greater Portland, Maine.

## Structure — each folder is one live site
| Folder | Live at | What it is |
|--------|---------|------------|
| `console/` | console.hiremarmee.com | Operator cockpit (Mike + sister) |
| `moms/`    | moms.hiremarmee.com    | Mom sign-up + dashboard |
| `family/`  | book.hiremarmee.com    | Family request + dashboard |
| `database/`| (Supabase)             | SQL setup scripts, for reference |

## Netlify publish directory per site
- console site  → publish directory: `console`
- moms site     → publish directory: `moms`
- family site   → publish directory: `family`
Build command: (none — static HTML)

## Backend
Supabase project `dlargnwijzrlruaxzsgj`. Auth + Postgres + row-level security.
