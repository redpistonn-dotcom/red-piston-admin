# AGENT_NOTES — admin.app.redpiston

How and why this app was split off from `red-piston-frontend`, for whoever
touches this next (human or agent). Same copy-then-trim process used for
`red-piston-shop`, applied to the platform-admin surface instead.

## Process

1. Full copy of `red-piston-frontend` (`robocopy ... /E /XD node_modules dist .git`).
2. Delete everything not platform-admin-facing.
3. Fix whatever the compiler/build surfaces as dangling.
4. Verify: `vite build`, `tsc --noEmit` (compared against baseline, not
   zero), `vitest run`, live browser login as a real `PLATFORM_ADMIN`.
5. Docs + git init.

Not extract-then-share: this repo duplicates `theme.ts`, `api/client.ts`,
the UI kit, etc. rather than pulling them into a shared package. Same
tradeoff `red-piston-shop` made — proving three independent apps work
before investing in shared-package plumbing.

## What was kept

Traced from the 3 files that actually matter in this app:
`AdminShell.tsx`, `SuperAdminPage.tsx` (+ its nested `SystemMonitor.tsx`
tab), and the generic account pages every RedPiston frontend has
(`ProfilePage`, `SettingsPage`, `ResetPasswordPage`, `LoginPage`).

- `src/shells/AdminShell.tsx` — the only shell.
- `src/pages/SuperAdminPage.tsx`, `src/pages/admin/SystemMonitor.tsx`.
- `src/pages/LoginPage.tsx`, `ProfilePage.tsx`, `SettingsPage.tsx`,
  `ResetPasswordPage.tsx` — shared across every RedPiston frontend,
  unmodified except `LoginPage`'s new `initialStep` prop (below).
- `src/components/ui/*`, `theme.ts` / `styles/theme.ts` — zero
  admin-specific logic, safe to copy whole (same call `red-piston-shop`
  made).
- `src/api/client.ts` (pure transport) + the handful of `api/*.ts` files
  `SuperAdminPage`/`ProfilePage`/`SettingsPage` actually import.

## What was dropped

Everything ERP (`ERPShell`, every owner/staff page, every car-decor
owner-management page, POS/inventory/parties/reports/returns/warranty...),
everything mechanic (`MechanicShell`, `pages/mechanic/*`), and the whole
customer marketplace (`MPShell`, `LandingPage`, `CartContext`,
marketplace/booking/storefront pages) — none of it is reachable by a
`PLATFORM_ADMIN` session and none of it existed to serve this app's users.

Also dropped after a **zero-consumer sweep** (grep every remaining `src/`
file for each candidate's import path before deleting, not just guessing):

- 27 dead `api/*.ts` files. Notable: **`api/auth.ts` had zero real
  consumers** despite looking load-bearing — every auth call site in this
  codebase calls `api.post(...)`/`api.get(...)` directly with a raw URL
  string instead of importing a wrapper function. Pre-existing pattern in
  `red-piston-frontend`, not something this split introduced or should
  "fix" by itself.
- 3 dead `hooks/*.ts` files (`queries.ts`, `useJobCardHistory.ts`,
  `useShopMarketplaceSales.ts`).
- 23 dead components (barcode scanner, sale/purchase/return modals,
  party/supplier autocompletes, image pickers, etc — all ERP/marketplace-
  only, zero references once those pages were gone).
- `components/CommandPalette.tsx`, `ShortcutOverlay.tsx` — kept in
  `red-piston-shop` (ERP routes exist there) but dropped here:
  `CommandPalette.tsx` hardcodes ERP paths (`/dashboard`, `/inventory`...)
  that don't exist in this app.
- `api/marketplace.ts` → replaced by `api/vehicleCatalog.ts`, trimmed from
  14 exports down to the 2 `SuperAdminPage`'s catalog tab uses
  (`fetchVehicleManufacturers`, `fetchVehicleModelsByManufacturer`). Same
  trim `red-piston-shop` did independently, for its own 2 consumers.
- `api/sync.ts` — deleted last, after `context/store.ts` was rewritten and
  no longer called `syncProductSave`.

## `context/store.ts` — trimmed to near-nothing

Admin needs none of the ERP/marketplace collections the original store
carried. What's left: `loaded` (a startup-finished gate a couple of
components check) and `activeShopId`/`clearStore` (harmless no-ops that
`App.tsx`'s auth handlers call unconditionally on login/logout/
impersonate — kept so those call sites don't need admin-specific branches).

## `LoginPage.tsx` — `initialStep` prop, not a fork

Added `initialStep = STEPS.LANDING` (default preserves every other app's
behavior) so `App.tsx` can mount it at `STEPS.ADMIN_AUTH` directly:
```tsx
<LoginPage onLogin={handleLogin} initialStep="admin_auth" />
```
The `ADMIN_AUTH` step's "← Back" button is hidden when
`initialStep === STEPS.ADMIN_AUTH` — there's nowhere meaningful to go back
to (no 3-role landing page exists in this app). The file otherwise still
contains every step from the original (`SIGNIN`, `REG_ROLE`,
`SHOP_DETAILS`, `MECHANIC_DETAILS`, ...) — unreachable here, harmless dead
code, not trimmed this pass (same staged approach `red-piston-shop` used:
minimal entry-point change now, bigger content trim only if requested
later).

## `App.tsx` — no business handlers, local role check instead of `getDefaultRoute`

This is the one file with real, non-mechanical changes:

- Deleted the entire business-handlers block (`saveProduct`, `handleSale`,
  `handleMultiItemSale`, `handlePurchase`, `handleAdjustment`,
  `handlePaymentReceipt`, `handleBulkStockIn`, ~260 lines) — ERP-only,
  don't exist in this app at all. (Contrast with `red-piston-shop`, which
  kept all of them — it still has ERP.)
- **Redirect-loop fix**: the shared `getDefaultRoute(user)` utility
  (`components/routes.ts`) returns a role-based path — `/dashboard` for
  `SHOP_OWNER`, `/mechanic` for `MECHANIC`, `/admin` for `PLATFORM_ADMIN`.
  None of the non-admin routes exist in this app. Using `getDefaultRoute`
  in this app's root/catch-all logic would infinite-loop for any non-admin
  session (redirect to a route that isn't registered → catch-all fires →
  redirect again). Fixed with a local `isPlatformAdmin(user)` helper used
  directly at the two route sites that matter:
  ```tsx
  function isPlatformAdmin(user) {
    return getUserRole(user) === "PLATFORM_ADMIN";
  }
  // root:      isPlatformAdmin(currentUser) ? <Navigate to="/admin" /> : <LoginPage initialStep="admin_auth" />
  // catch-all: <Navigate to={isPlatformAdmin(currentUser) ? "/admin" : "/"} />
  ```
  `requireRole`'s fallback was simplified to always `<Navigate to="/" />`
  (never calls `getDefaultRoute`) for the same reason. This is a
  **local, app-specific fix** — the shared `routes.ts` utility itself was
  not touched, since `red-piston-shop` and `red-piston-frontend` both still
  rely on its current behavior.
- `appCtxValue` trimmed to `{ toast, toasts, removeToast, currentUser,
  setCurrentUser, handleLogin, handleLogout, impersonating,
  handleExitImpersonation }`. This is narrower than the shared
  `AppCtxValue` TS type (defined in `types.ts`, shaped for the full ERP
  app) — `tsc` flags it as missing properties (`pModal`, `catalogModal`,
  etc). Left as a known, harmless type mismatch rather than editing the
  shared type: nothing in this app's kept components (`AdminShell`,
  `SuperAdminPage`, `ProfilePage`, `SettingsPage`) reads the missing
  fields, and narrowing the shared type would risk breaking `red-piston-
  frontend`/`red-piston-shop`, which still populate it in full.

## Known limitation: impersonation doesn't cross the app boundary

`SuperAdminPage` renders a real "Login as X" button
(`onImpersonate={handleImpersonate}`), and `handleImpersonate`/
`handleExitImpersonation` in `App.tsx` are fully correct in isolation —
mint/store an impersonation token, back up the admin's own session,
navigate. The problem is the last step:
`navigate(getDefaultRoute(targetUser), { replace: true })` resolves to a
route that lives in a **different app** (`/dashboard` for a shop owner,
`/mechanic` for a mechanic) — this app doesn't have that route, so the
catch-all immediately bounces back to `/` since the newly-set
`currentUser` is no longer `PLATFORM_ADMIN`.

This isn't a bug introduced by the split — it's the same code
`red-piston-frontend` has today, just newly *reachable* here (in
`red-piston-shop`, the trigger — `SuperAdminPage` — doesn't exist, so the
same dead code is harmless there). Fixing it for real needs the
cross-domain SSO/handoff infrastructure from the architecture doc (hand
the target user off to `shop.redpiston.com` or `redpiston.com` with a
shared cookie or a one-time token in the URL) — not built yet, out of
scope for this mechanical split.

## Pre-existing bug noticed, not introduced here

`src/pages/admin/SystemMonitor.tsx:396` references `sentryToken`, which is
never declared (only `setSentryToken`/`activeSentryToken` exist) — clicking
the "System Monitor" tab throws `sentryToken is not defined` and the
`PageErrorBoundary` catches it ("This section failed to load"). Confirmed
identical, unmodified in `red-piston-frontend` — not something this split
caused, out of scope to fix here.

## Verification performed

- `vite build` — clean, 2905 modules, 10.19s.
- `tsc --noEmit` — 216 errors, dominated by the same pre-existing errors
  in `ProfilePage.tsx`/`LoginPage.tsx`/`SuperAdminPage.tsx`/
  `SettingsPage.tsx` that exist unchanged in `red-piston-frontend`'s own
  baseline (627 errors, larger app). The only errors specific to files
  this split actually rewrote: `vehicleCatalog.ts` (3, identical to
  `red-piston-shop`'s copy of the same file) and `App.tsx`'s
  `appCtxValue`/`SuperAdminPage`-props shape mismatches (documented above,
  both harmless).
- `vitest run` — 87/87 passing (`validation.test.js`, `billing.test.js`,
  `dateFilters.test.js`).
- Live browser verification against the real backend/DB: logged in as an
  existing `PLATFORM_ADMIN` account (session minted directly via
  `generateTokens`/`prisma.refreshToken.create`, cleaned up after), landed
  on `/` and saw the `ADMIN_AUTH` sign-in card with no "Back" button and no
  3-role landing page, confirmed `/admin` renders `AdminShell` +
  `SuperAdminPage` with real data (27 users, 5 shops, all 5 tabs present),
  confirmed `/profile` and `/settings` render correctly, confirmed an
  unknown route redirects a logged-in admin back to `/admin` with no loop.
