/**
 * App.jsx — root orchestrator for the Admin app (admin.app.redpiston).
 *
 * This is the platform-admin split of the original single-SPA
 * red-piston-frontend — carries AdminShell + SuperAdminPage (+ its
 * SystemMonitor tab) only. ERPShell/MPShell/MechanicShell and every
 * ERP/marketplace/mechanic route live in the other (separately split
 * or not-yet-split) apps, not here.
 *
 * WHAT LIVES HERE:
 *   - Auth state + token lifecycle (login, logout, impersonation, refresh)
 *   - AppCtx.Provider — AdminShell/pages consume this via useContext(AppCtx)
 *   - Route tree — just the admin console + generic account pages
 *
 * NO business handlers here (saveProduct, handleSale, etc.) — those are
 * ERP-only and don't exist in this app at all, unlike the Shop split
 * where they were kept in full.
 */
import { useState, useCallback, useEffect, Component, useMemo, lazy, Suspense, cloneElement, isValidElement } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { LoadingBar } from "./components/LoadingBar";
import { T, FONT, GLOBAL_CSS } from "./theme";
import { useStore } from "./store";
import { useToast } from "./components/ui";
import { setTokens, clearTokens, getAccessToken, silentRefresh, api } from "./api/client.js";
import { getDefaultRoute, getUserRole } from "./components/routes";
import { Avatar } from "./components/Avatar";
import { AppCtx } from "./AppCtx.js";

// Shell — manages its own chrome (sidebar, topbar, modals)
import { AdminShell } from "./shells/AdminShell";

// ── Lazy-loaded pages (each becomes its own JS chunk) ─────────────────────────
const LoginPage         = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ProfilePage       = lazy(() => import("./pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const SettingsPage      = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const SuperAdminPage    = lazy(() => import("./pages/SuperAdminPage").then(m => ({ default: m.SuperAdminPage })));

// ── Page skeleton shown while a lazy chunk downloads ──────────────────────────
const PageLoader = () => (
  <div style={{ padding: "28px 32px", fontFamily: FONT.ui }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
      <div className="skeleton-shimmer" style={{ width: 40, height: 40, borderRadius: 10 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton-shimmer" style={{ height: 16, width: "30%", borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton-shimmer" style={{ height: 11, width: "18%", borderRadius: 6 }} />
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
      {[1,2,3,4].map(i => <div key={i} className="skeleton-shimmer" style={{ height: 80, borderRadius: 12 }} />)}
    </div>
    <div className="skeleton-shimmer" style={{ height: 220, borderRadius: 12, marginBottom: 14 }} />
    <div className="skeleton-shimmer" style={{ height: 120, borderRadius: 12 }} />
  </div>
);

// ── Top-level error boundary — full-screen fallback for catastrophic failures ──
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.ui }}>
          <div style={{ textAlign: "center", maxWidth: 420, padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.t1, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 14, color: T.t3, marginBottom: 24, lineHeight: 1.6 }}>{this.state.error?.message || "An unexpected error occurred."}</div>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{ background: T.amber, color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT.ui }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Page-level error boundary — renders error INSIDE the shell so sidebar/header survive ──
// Wraps each individual route's page component. If the page crashes, the user can
// still navigate to another section using the sidebar instead of losing the whole app.
class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error("[PageErrorBoundary]", error, info);
    // After a new deploy, stale chunk URLs (hashed filenames) 404. Auto-reload once to
    // fetch fresh HTML and correct chunk URLs so the user never sees the broken screen.
    const isChunkError = /Failed to fetch dynamically imported module|Loading chunk|ChunkLoad/i.test(
      (error?.message || "") + (error?.name || "")
    );
    if (isChunkError && !sessionStorage.getItem("rp_chunk_reload")) {
      sessionStorage.setItem("rp_chunk_reload", "1");
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "48px 32px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", fontFamily: FONT.ui }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.t1, marginBottom: 8 }}>This section failed to load</div>
            <div style={{ fontSize: 13, color: T.t3, marginBottom: 20, lineHeight: 1.6 }}>{this.state.error?.message || "An unexpected error occurred on this page."}</div>
            <button
              onClick={() => { sessionStorage.removeItem("rp_chunk_reload"); this.setState({ hasError: false, error: null }); }}
              style={{ background: T.amber, color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT.ui }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    // Forward extra props (e.g. activeTab/setActiveTab from AdminShell) to the child
    const { children, ...extra } = this.props;
    if (Object.keys(extra).length > 0 && isValidElement(children)) {
      return cloneElement(children, extra);
    }
    return children;
  }
}

// ── Routes /profile and /settings — this app has only PLATFORM_ADMIN users,
// no ERPShell/MPShell to pick between, so no shell wraps them here.
function AuthenticatedShell({ user, children }) {
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── Role gate — used for /admin. Anyone who isn't PLATFORM_ADMIN gets sent
// back to "/", where the root route (below) treats a non-admin currentUser
// as logged-out rather than calling getDefaultRoute again — that avoids the
// "/" <-> "/admin" redirect loop a shared getDefaultRoute would cause here,
// since this app has no real destination for any other role.
function requireRole(user, role, element) {
  if (getUserRole(user) === role) return element;
  return <Navigate to="/" replace />;
}

function isPlatformAdmin(user) {
  return getUserRole(user) === "PLATFORM_ADMIN";
}

// ========== MAIN APP COMPONENT ==========
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Auth state ───────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem("as_user");
      if (stored) {
        const user = JSON.parse(stored);
        const rt = localStorage.getItem("as_refresh_token");
        if (rt) setTokens(null, rt);
        return user;
      }
    } catch {}
    return null;
  });

  // tokenReady: true once silentRefresh has resolved (or is skipped).
  // The UI no longer waits for this — localStorage data shows immediately.
  // tokenReady gates syncFromAPI so we don't fire it before we have a token.
  const [tokenReady, setTokenReady] = useState(() => {
    // If there's already an access token in memory (e.g. login just happened)
    // or no stored user at all, we're ready right away.
    try { return !localStorage.getItem("as_user") || !!getAccessToken(); } catch { return true; }
  });

  // ── Startup: wake the Render backend immediately on every page load ──────────
  // Fired unconditionally so logged-in users don't sit on skeletons while the
  // backend cold-starts. Fire-and-forget — never blocks the UI.
  useEffect(() => {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    fetch(`${BASE_URL}/health`, { method: 'GET' }).catch(() => {});
  }, []);

  // ── Number inputs: never change on scroll or ↑/↓ keys (ticket 2607012) ───────
  // A focused <input type="number"> mutates its value on mouse-wheel/trackpad
  // scroll and on Arrow Up/Down, which silently corrupts prices/quantities while
  // the user is just scrolling the page. Globally: blur on wheel (so the page
  // scrolls instead of the value), and swallow the arrow-key increment. Values
  // can then only be changed by typing.
  useEffect(() => {
    const isNumberInput = (el: EventTarget | null): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.type === 'number';
    const onWheel = (e: WheelEvent) => {
      if (isNumberInput(document.activeElement)) (document.activeElement as HTMLInputElement).blur();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isNumberInput(e.target)) e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  // ── Auto-recover from stale chunks after a deploy ────────────────────────────
  // After a new deploy the old hashed chunk files are gone; a dynamic import that
  // isn't triggered during render (route preload, an import() in an event handler)
  // rejects outside the error boundary, so the user just sees a broken/blank
  // action. Catch those globally and reload once to pick up the fresh bundle. A
  // 10s guard prevents a reload loop while still re-arming for the next deploy.
  useEffect(() => {
    const reloadOnce = () => {
      const last = Number(sessionStorage.getItem("rp_chunk_reload_ts") || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem("rp_chunk_reload_ts", String(Date.now()));
        window.location.reload();
      }
    };
    const isChunkMsg = (s: string) => /Failed to fetch dynamically imported module|Loading chunk|ChunkLoad|error loading dynamically imported module/i.test(s);
    const onPreloadError = () => reloadOnce();
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkMsg(String(e?.reason?.message || e?.reason || ""))) reloadOnce();
    };
    window.addEventListener("vite:preloadError", onPreloadError as EventListener);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError as EventListener);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // ── Startup: restore access token from refresh token (page reload) ───────────
  useEffect(() => {
    if (!localStorage.getItem("as_user")) return;
    if (getAccessToken()) { setTokenReady(true); return; } // already have token
    const restore = async () => {
      try {
        const impToken = sessionStorage.getItem('as_imp_token');
        if (impToken) { setTokens(impToken, null); return; }
        // Race against 6s so a cold-start backend doesn't block sync forever.
        // The first 401 from any API call will trigger a retry via the interceptor.
        await Promise.race([
          silentRefresh(),
          new Promise(resolve => setTimeout(() => resolve(null), 6000)),
        ]);
      } catch (err) {
        if (err?.code === 'SESSION_EXPIRED') {
          clearTokens();
          try { localStorage.removeItem("as_user"); localStorage.removeItem("as_refresh_token"); } catch {}
          setCurrentUser(null);
        }
      } finally {
        setTokenReady(true);
      }
    };
    restore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global session-expired event (fired by api/client.js) ────────────────────
  // If the token that expired was an impersonation token, try to restore the admin's
  // own session before falling back to a full logout — otherwise the admin loses their
  // context and has to log in again from scratch.
  useEffect(() => {
    const handler = async () => {
      clearTokens();
      try { sessionStorage.removeItem('as_imp_token'); } catch {}

      const impBackup = (() => {
        try { const s = localStorage.getItem('as_impersonating'); return s ? JSON.parse(s) : null; } catch { return null; }
      })();

      if (impBackup?.user && impBackup?.refreshToken) {
        localStorage.removeItem('as_impersonating');
        try {
          const res = await api.post('/api/auth/refresh', { refreshToken: impBackup.refreshToken });
          const newAccess = res.accessToken || (res as any).data?.accessToken;
          const newRefresh = (res as any).refreshToken || (res as any).data?.refreshToken;
          if (newAccess) {
            setTokens(newAccess, newRefresh ?? null);
            setCurrentUser(impBackup.user);
            localStorage.setItem('as_user', JSON.stringify(impBackup.user));
            localStorage.setItem('as_refresh_token', newRefresh ?? impBackup.refreshToken);
            window.location.replace('/admin');
            return;
          }
        } catch {
          // Admin token also expired — fall through to full logout
        }
      }

      try { localStorage.removeItem("as_user"); localStorage.removeItem("as_refresh_token"); localStorage.removeItem("as_impersonating"); } catch {}
      setCurrentUser(null);
      window.location.replace("/");
    };
    window.addEventListener("auth:session-expired", handler);
    return () => window.removeEventListener("auth:session-expired", handler);
  }, []);

  // ── Proactive token refresh every 7.5 hours ───────────────────────────────────
  // Only end the session if the refresh token was actually rejected — a transient
  // network failure (e.g. backend cold start) must never log the user out; the
  // request-level interceptor will retry the refresh on the next API call anyway.
  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(async () => {
      try {
        await silentRefresh();
      } catch {}
    }, 7.5 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [currentUser]);

  // ── Prevent stale BFCache after logout ────────────────────────────────────────
  useEffect(() => {
    const handlePageShow = (e) => {
      if (e.persisted && !localStorage.getItem("as_user")) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // ── Store ────────────────────────────────────────────────────────────────────
  // This app carries none of the ERP collections (products/movements/orders/
  // etc) — just the generic `loaded` gate and `setActiveShopId`/`clearStore`,
  // which handleLogin/handleLogout/handleImpersonate call unconditionally
  // (harmless no-ops here since there's no shop-scoped state to touch).
  const { loaded, setActiveShopId, clearStore } = useStore();

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [impersonating, setImpersonating] = useState(() => {
    try { const s = localStorage.getItem('as_impersonating'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const { items: toasts, add: toast, remove: removeToast } = useToast();

  // ── Route persistence — save & restore current path across page refreshes ────
  // WHY: On refresh, auth loading guards (authReady=false / loaded=false) temporarily
  // prevent routes from rendering. If requireRole fires a redirect during that window,
  // the user ends up on their default route instead of where they were.
  // Saving path to sessionStorage and restoring after auth+store are ready fixes this.
  // NOTE: must live AFTER useStore() so `loaded` is already declared (avoids TDZ error).

  // Save path on every navigation when user is logged in
  useEffect(() => {
    if (!currentUser) return;
    const SKIP = ['/', '/login', '/reset-password'];
    if (!SKIP.includes(location.pathname)) {
      try { sessionStorage.setItem('rp_last_path', location.pathname + location.search); } catch {}
    }
  }, [location.pathname, location.search, currentUser]);

  // After both token + store are ready, navigate to the saved path (once per page load)
  const [routeRestored, setRouteRestored] = useState(false);
  useEffect(() => {
    if (!tokenReady || !loaded || routeRestored) return;
    setRouteRestored(true);
    if (!currentUser) return;
    try {
      const saved = sessionStorage.getItem('rp_last_path');
      const SKIP = ['/', '/login', '/reset-password'];
      if (saved && !SKIP.includes(saved) && saved !== location.pathname) {
        navigate(saved, { replace: true });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady, loaded]);

  // ── Auth handlers ─────────────────────────────────────────────────────────────
  const handleLogin = useCallback((user) => {
    // Clear stale inventory/movement data from any previous session so a fresh
    // shop owner never sees another shop's products or leftover dev seed data.
    // clearStore() wipes vl_products, vl_movements, vl_parties, etc. from both
    // state and localStorage. We then re-set the new user's shopId immediately.
    clearStore();
    setCurrentUser(user);
    try { localStorage.setItem("as_user", JSON.stringify(user)); } catch {}
    if (user?.shopId) {
      setActiveShopId(user.shopId);
      try { localStorage.setItem("vl_shopId", String(user.shopId)); } catch {}
    }
    navigate(getDefaultRoute(user), { replace: true });
  }, [navigate, setActiveShopId, clearStore]);

  const handleLogout = useCallback(() => {
    const rt = localStorage.getItem("as_refresh_token");
    // Fire-and-forget: revoke the refresh token on the server (non-blocking)
    api.post("/api/auth/logout", { refreshToken: rt }).catch((err) => {
      console.warn("[Auth] Logout revoke failed (non-critical):", err?.message);
    });
    clearTokens();
    clearStore();
    localStorage.removeItem("as_user");
    localStorage.removeItem("as_refresh_token");
    localStorage.removeItem("as_impersonating");
    try {
      sessionStorage.removeItem("as_imp_token");
      sessionStorage.removeItem("vl_low_stock_dismissed");
    } catch {}
    setCurrentUser(null);
    window.location.replace("/");
  }, [clearStore]);

  const handleImpersonate = useCallback((targetUser, impersonationToken) => {
    const adminBackup = { user: currentUser, refreshToken: localStorage.getItem('as_refresh_token') };
    setTokens(impersonationToken, null);
    setCurrentUser(targetUser);
    localStorage.setItem('as_user', JSON.stringify(targetUser));
    setImpersonating(adminBackup);
    localStorage.setItem('as_impersonating', JSON.stringify(adminBackup));
    try { sessionStorage.setItem('as_imp_token', impersonationToken); } catch {}
    if (targetUser.shopId) {
      setActiveShopId(targetUser.shopId);
      try { localStorage.setItem('vl_shopId', targetUser.shopId); } catch {}
    }
    navigate(getDefaultRoute(targetUser), { replace: true });
  }, [currentUser, navigate, setActiveShopId]);

  const handleExitImpersonation = useCallback(async () => {
    if (!impersonating) return;
    const backup = impersonating;
    localStorage.removeItem('as_impersonating');
    try { sessionStorage.removeItem('as_imp_token'); } catch {}
    clearTokens();
    setImpersonating(null);

    let restored = false;
    try {
      if (backup.refreshToken) {
        const res = await api.post('/api/auth/refresh', { refreshToken: backup.refreshToken });
        const newAccess = (res as any).accessToken || (res as any).data?.accessToken;
        const newRefresh = (res as any).refreshToken || (res as any).data?.refreshToken;
        if (newAccess) {
          setTokens(newAccess, newRefresh ?? backup.refreshToken);
          restored = true;
        }
      }
    } catch (err) {
      console.warn("[Auth] Could not restore admin token after impersonation:", err?.message);
    }

    if (!restored) {
      // Admin's refresh token expired — do a clean logout so they get a fresh login screen
      // rather than landing on /admin with no token and hitting a messy 401 cascade.
      try { localStorage.removeItem('as_user'); localStorage.removeItem('as_refresh_token'); } catch {}
      setCurrentUser(null);
      window.location.replace('/');
      return;
    }

    setCurrentUser(backup.user);
    localStorage.setItem('as_user', JSON.stringify(backup.user));
    navigate('/admin', { replace: true });
  }, [impersonating, navigate]);

  // ── AppCtx value — everything AdminShell/pages need, stable reference via useMemo
  // No business handlers here — this app has no ERP data to save/sync.
  const appCtxValue = useMemo(() => ({
    // Toast (consumed by AdminShell and pages)
    toast, toasts, removeToast,
    // Auth (consumed by AdminShell + LoginPage)
    currentUser, setCurrentUser, handleLogin, handleLogout,
    impersonating, handleExitImpersonation,
  }), [
    toast, toasts, removeToast, currentUser, setCurrentUser, handleLogin, handleLogout,
    impersonating, handleExitImpersonation,
  ]);

  // Block render until the access token is restored on page reload.
  // Without this, shells fire API calls before silentRefresh() completes → 401 wave.
  // Only gate when there IS a stored user but no token yet (not on public pages).
  if (!loaded || (!tokenReady && !!currentUser)) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: FONT.ui }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ height: 56, background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 12 }}>
          <div className="skeleton-shimmer" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
          <div className="skeleton-shimmer" style={{ width: 120, height: 14, borderRadius: 6 }} />
          <div style={{ flex: 1 }} />
          <div className="skeleton-shimmer" style={{ width: 80, height: 28, borderRadius: 8 }} />
          <div className="skeleton-shimmer" style={{ width: 32, height: 32, borderRadius: 8 }} />
        </div>
        <div style={{ padding: "32px 28px", maxWidth: 900 }}>
          <div className="skeleton-shimmer" style={{ height: 24, width: "22%", borderRadius: 8, marginBottom: 24 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton-shimmer" style={{ height: 90, borderRadius: 12 }} />)}
          </div>
          <div className="skeleton-shimmer" style={{ height: 260, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  // ── Route tree — clean, no prop drilling ─────────────────────────────────────
  // WHY no props on pages: pages call useStore() for data and useContext(AppCtx)
  // for handlers. Routes were previously 200+ chars per line; now they're readable.
  return (
    <AppCtx.Provider value={appCtxValue}>
      {/* Top loading bar — shows during route navigation */}
      <LoadingBar />
      {/* Impersonation banner */}
      {impersonating && (
        <div className="impersonation-bar" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: `${T.surface}f8`, borderTop: `2px solid ${T.violet}`,
          backdropFilter: 'blur(14px)', padding: '8px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          fontFamily: FONT.ui, boxShadow: `0 -4px 28px ${T.violetBg}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.violet, boxShadow: `0 0 6px ${T.violet}`, flexShrink: 0 }} />
          <div className="impersonation-user-info" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ color: T.t3, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>Viewing as</span>
            <div style={{ border: `1.5px solid ${T.violet}`, borderRadius: '50%', flexShrink: 0 }}>
              <Avatar user={currentUser} size={24} />
            </div>
            <strong style={{ color: T.t1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser?.name || currentUser?.email || 'Unknown User'}
            </strong>
            <span style={{ background: T.violetBg, border: `1px solid ${T.violet}`, color: T.violet, borderRadius: 6, padding: '1px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {currentUser?.userType?.name || currentUser?.role}
            </span>
            <span className="impersonation-admin-label" style={{ color: T.t4, fontSize: 11, whiteSpace: 'nowrap' }}>
              Admin: <span style={{ color: T.t3, fontWeight: 600 }}>{impersonating.user?.name || impersonating.user?.email}</span>
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            style={{
              background: `linear-gradient(135deg, ${T.violet}, #6D28D9)`,
              border: 'none', borderRadius: 8, padding: '7px 14px', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.ui,
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
              boxShadow: `0 2px 10px ${T.violetBg}`, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            🛡️ <span className="impersonation-btn-text">Back to Admin Console</span>
          </button>
        </div>
      )}

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* "/" is the admin sign-in screen. A signed-in PLATFORM_ADMIN goes
              straight to the console; anyone else (wrong role, or no session)
              just sees the sign-in form — this app has no other destination
              for a non-admin account, so there's nothing to redirect them to. */}
          <Route path="/" element={
            isPlatformAdmin(currentUser)
              ? <Navigate to="/admin" replace />
              /* "admin_auth" must match LoginPage's internal STEPS.ADMIN_AUTH value */
              : <LoginPage onLogin={handleLogin} initialStep="admin_auth" />
          } />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Admin console */}
          <Route path="/admin" element={requireRole(currentUser, "PLATFORM_ADMIN", <AdminShell><PageErrorBoundary><SuperAdminPage onImpersonate={handleImpersonate} /></PageErrorBoundary></AdminShell>)} />

          {/* Generic account pages — no ERPShell/MPShell to pick between here */}
          <Route path="/profile"  element={<AuthenticatedShell user={currentUser}><ProfilePage user={currentUser} onUserUpdate={(u) => setCurrentUser(u)} onLogout={handleLogout} /></AuthenticatedShell>} />
          <Route path="/settings" element={<AuthenticatedShell user={currentUser}><SettingsPage onLogout={handleLogout} /></AuthenticatedShell>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={isPlatformAdmin(currentUser) ? "/admin" : "/"} replace />} />
        </Routes>
      </Suspense>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
