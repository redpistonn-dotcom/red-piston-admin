# RedPiston — Admin App

The platform-admin console for RedPiston. If you're RedPiston staff
managing users, verifying shops, curating the parts catalog, or running an
Autodukan bulk import — this is the app you're in. It has no ERP, no
marketplace, no mechanic tooling — just the single-role admin surface.

## Where this fits

RedPiston is moving from one monolithic frontend into three apps sharing
one backend and one database:

| App | Domain (planned) | Audience | Repo |
|---|---|---|---|
| Marketplace | `redpiston.com` | Public + customers | `red-piston-frontend` (current monolith, keeps this role) |
| Shop | `shop.redpiston.com` | Shop owner, staff, mechanic | `red-piston-shop` |
| **Admin** (this repo) | `admin.redpiston.com` | Platform admin | `admin.app.redpiston` |
| Backend API | `api.redpiston.com` | all of the above | `red-piston-backend`, unchanged |

This repo was split off from `red-piston-frontend` by copying it whole and
then deleting everything that isn't platform-admin-facing — see
`AGENT_NOTES.md` for exactly what was kept, dropped, and why. It is **not
yet** wired to a separate domain or deployed anywhere; it's a local,
independent app you can run and verify side by side with the monolith.

## What's in here

- **Admin console** (`/admin`): the one real page in this app —
  `SuperAdminPage`, tabbed into All Users, Verifications, Parts Catalog,
  Autodukan Import, and System Monitor.
- **Generic account pages**: `/profile`, `/settings` — same shared
  components every RedPiston frontend uses, unmodified.
- **Sign-in** (`/`): `LoginPage` mounted directly at the admin-only entry
  step — no shop/customer/mechanic picker, no "Back" button (there's
  nowhere else to go in this app).

Everything here talks to the same backend and database as the other apps —
no separate schema, no separate API.

## Running it

```bash
npm install
npm run dev      # http://localhost:5175
```

Needs `red-piston-backend` running on `localhost:3001` (see that repo's
own README). A `.env` file with `VITE_API_URL`, Firebase, and Sentry keys
is required for full functionality — copy the shape from
`red-piston-frontend`'s `.env` (same backend, same third-party projects).

## Code layout

```
src/
├── App.tsx              # routes + auth/token lifecycle — no business handlers
├── main.tsx             # React root, providers (React Query, Store, Router)
├── shells/AdminShell.tsx # the only shell in this app
├── pages/
│   ├── LoginPage.tsx     # shared file, mounted at admin-only entry step
│   ├── SuperAdminPage.tsx, admin/SystemMonitor.tsx
│   ├── ProfilePage.tsx, SettingsPage.tsx, ResetPasswordPage.tsx
├── context/
│   ├── store.ts          # near-empty — just the startup `loaded` gate
│   └── AppCtx.ts         # auth + toast + impersonation, no business handlers
├── api/                  # vehicleCatalog.ts (vehicle lookups for the
│                           catalog tab) + client.ts + the few others
│                           SuperAdminPage/ProfilePage/SettingsPage use
├── components/ui/        # generic UI kit (Btn, Input, Modal, StatCard...)
└── theme.ts, store.ts, AppCtx.ts  # one-line re-export shims, see note below
```

**About the shim files** (`src/theme.ts`, `src/store.ts`, `src/AppCtx.ts`):
these are one-line `export * from './styles/theme'` (etc) re-exports. Most
of the codebase imports via the shim path (`../theme`, `../store`) rather
than the real file (`../styles/theme.ts`, `../context/store.ts`) — that's
the established convention here, not a mistake to "fix".

## What changed in the split (for anyone diffing against red-piston-frontend)

- Removed entirely: every ERP page/shell, every mechanic page/shell, the
  whole customer marketplace, every car-decor/services owner-management
  page, 27 dead `api/*.ts` files and 23 dead components (confirmed
  zero consumers before deletion), `CommandPalette`/`ShortcutOverlay`
  (hardcode ERP routes that don't exist here).
- Renamed: `api/marketplace.ts` → `api/vehicleCatalog.ts`, trimmed to the
  two vehicle-lookup functions `SuperAdminPage`'s catalog tab uses (same
  trim `red-piston-shop` did, independently, for its own two consumers).
- `App.tsx`'s route guards (`requireRole`, root route, catch-all) branch on
  a local `isPlatformAdmin()` check instead of the shared `getDefaultRoute`
  utility — this app has no route for any non-admin role, so calling
  `getDefaultRoute` here would bounce a shop-owner/mechanic session between
  `/` and `/admin` forever. See `AGENT_NOTES.md` for the full reasoning.
- **Known limitation**: `SuperAdminPage`'s "Login as X" (impersonation)
  mints a valid session for the target user but then navigates to a route
  (e.g. `/dashboard`) that doesn't exist in this app — it needs the
  cross-domain SSO handoff to `shop.redpiston.com`/`redpiston.com` that
  hasn't been built yet. See `AGENT_NOTES.md`.

## Full architecture reference

For the diagram, subdomain plan, and the reasoning behind the split, see
the "RedPiston Architecture" PDF (delivered separately) — this README
covers only what's specific to running and understanding this repo.
