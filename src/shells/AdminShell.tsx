import { useState, useContext, Children, cloneElement, useEffect } from "react";
import { createPortal } from "react-dom";
import { GLOBAL_CSS } from "../theme";
import { AppCtx } from "../AppCtx";
import { Toast } from "../components/ui";
import { Avatar } from "../components/Avatar";

// ── Nav items — Material Symbols Outlined ligature names ─────────────────────
const NAV_ITEMS = [
  { key: "users",          label: "All Users",       icon: "group"       },
  { key: "verifications",  label: "Verifications",   icon: "verified"    },
  { key: "catalog",        label: "Parts Catalog",   icon: "inventory_2" },
  { key: "autodukan",      label: "Autodukan",       icon: "sync"        },
  { key: "audit",          label: "Audit Logs",      icon: "history"     },
  { key: "system-monitor", label: "System Monitor",  icon: "monitoring"  },
];

// ── Design tokens ─────────────────────────────────────────────────────────────
const AC = {
  // Sidebar (dark navy)
  sidebarBg:     "#0F1117",
  sidebarBorder: "#1C2030",
  sidebarHover:  "#161B27",
  sidebarActive: "#1B2238",
  // Text on sidebar
  navText:       "#8B95A8",
  navActive:     "#FFFFFF",
  // Brand accent (Red Piston red)
  accent:        "#C0392B",
  accentGlow:    "rgba(192,57,43,0.28)",
  // Content area
  bg:            "#F2F5FB",
  surface:       "#FFFFFF",
  border:        "#E0E7F0",
  borderLight:   "#EBF0F7",
  // Text
  t1:            "#0D1117",
  t2:            "#3D4A5C",
  t3:            "#7A8699",
};

const SIDEBAR_W = 232;

interface AdminShellProps { children: import('react').ReactNode; }
export function AdminShell({ children }: AdminShellProps) {
  const { toasts, removeToast, currentUser, handleLogout } = useContext(AppCtx);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Persist active tab in URL hash so refresh and browser back-button work
  const hashTab = window.location.hash.slice(1);
  const validKeys = NAV_ITEMS.map(t => t.key);
  const [activeTab, setActiveTabState] = useState(validKeys.includes(hashTab) ? hashTab : "users");

  const setActiveTab = (key: string) => {
    setActiveTabState(key);
    window.location.hash = key;
  };

  useEffect(() => {
    const onHashChange = () => {
      const k = window.location.hash.slice(1);
      if (validKeys.includes(k)) setActiveTabState(k);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "Admin";
  const displayEmail = currentUser?.email || "";

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <style>{`
        /* ── Material Symbols font ── */
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
          font-size: 20px; line-height: 1; vertical-align: middle;
        }

        /* ── Sidebar nav item ── */
        .adn-item {
          display: flex; align-items: center; gap: 11px;
          padding: 10px 14px 10px 18px;
          border-radius: 10px; margin: 1px 10px;
          cursor: pointer; font-size: 13px; font-weight: 500;
          color: ${AC.navText}; background: transparent;
          border: none; text-align: left; width: calc(100% - 20px);
          transition: color 0.14s, background 0.14s;
          font-family: 'Inter', sans-serif;
          white-space: nowrap;
        }
        .adn-item:hover { background: ${AC.sidebarHover}; color: #D8E0EE; }
        .adn-item.active {
          background: ${AC.sidebarActive};
          color: ${AC.navActive};
        }
        .adn-item.active::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: ${AC.accent};
          border-radius: 0 3px 3px 0;
        }
        .adn-item { position: relative; }
        .adn-item.active .adn-icon { color: ${AC.accent}; }

        /* ── Sidebar scroll ── */
        .adn-nav-scroll {
          scrollbar-width: thin;
          scrollbar-color: ${AC.sidebarHover} transparent;
        }
        .adn-nav-scroll::-webkit-scrollbar { width: 4px; }
        .adn-nav-scroll::-webkit-scrollbar-track { background: transparent; }
        .adn-nav-scroll::-webkit-scrollbar-thumb { background: ${AC.sidebarHover}; border-radius: 4px; }

        /* ── Mobile hamburger ── */
        .adn-hamburger {
          display: none;
          position: fixed; top: 14px; left: 14px; z-index: 600;
          width: 40px; height: 40px;
          background: ${AC.surface}; border: 1px solid ${AC.border};
          border-radius: 10px; cursor: pointer;
          align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        /* ── Mobile overlay ── */
        .adn-overlay {
          display: none; position: fixed; inset: 0; z-index: 500;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
        }

        /* ── Signout hover ── */
        .adn-signout:hover { background: rgba(192,57,43,0.1) !important; color: ${AC.accent} !important; border-color: rgba(192,57,43,0.25) !important; }

        /* ── Content area ── */
        .adn-content { min-height: 100vh; background: ${AC.bg}; }

        /* ── Page header shared style ── */
        .admin-page-header {
          margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid ${AC.border};
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .admin-page-title { font-size: 20px; font-weight: 800; color: ${AC.t1}; font-family: 'Plus Jakarta Sans','Inter',sans-serif; letter-spacing: -0.02em; margin: 0; }
        .admin-page-subtitle { font-size: 13px; color: ${AC.t3}; margin-top: 4px; font-family: 'Inter',sans-serif; margin: 0; }
        @media (max-width: 600px) { .admin-page-header { flex-wrap: wrap; } }

        /* ── Table ── */
        .admin-table-wrap {
          background: ${AC.surface}; border: 1px solid ${AC.border};
          border-radius: 14px; overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .admin-table-wrap-inner { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .admin-table-wrap-inner table { min-width: 900px; width: 100%; border-collapse: collapse; }
        .admin-table-row:hover { background: ${AC.borderLight} !important; }

        /* ── Stats grid ── */
        .admin-stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 28px; }
        .admin-stat-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.08) !important; transform: translateY(-1px) !important; }

        /* ── Controls row ── */
        .admin-controls-row { display: flex; gap: 10px; margin-bottom: 18px; align-items: center; flex-wrap: wrap; }
        .admin-add-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .btn-impersonate:hover { background: rgba(124,58,237,0.12) !important; }
        .btn-toggle-active:hover { background: rgba(192,57,43,0.14) !important; }
        .btn-toggle-inactive:hover { background: rgba(22,163,74,0.14) !important; }

        /* ── Mobile card ── */
        .admin-user-card { display: none; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        @media (max-width: 1200px) {
          .admin-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }

        /* ── Mobile breakpoint ── */
        @media (max-width: 860px) {
          .adn-hamburger { display: flex !important; }
          .adn-sidebar-fixed {
            transform: translateX(-${SIDEBAR_W}px);
            transition: transform 0.25s ease;
          }
          .adn-sidebar-fixed.open {
            transform: translateX(0);
            box-shadow: 6px 0 48px rgba(0,0,0,0.3);
          }
          .adn-overlay.open { display: block !important; }
          .adn-content { margin-left: 0 !important; }
          .adn-content-inner { padding: 68px 16px 40px !important; }
          .admin-stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; margin-bottom: 18px !important; }
          .admin-controls-row { gap: 8px !important; }
          .admin-table-wrap-inner { overflow: visible !important; }
          .admin-table-wrap-inner table { display: none !important; }
          .admin-user-card { display: block !important; }
        }

        @media (max-width: 480px) {
          .admin-stats-grid { gap: 8px !important; }
        }
      `}</style>

      {/* ── Mobile hamburger ── */}
      <button className="adn-hamburger" onClick={() => setSidebarOpen(v => !v)}>
        <span className="material-symbols-outlined" style={{ color: AC.t1, fontSize: 22 }}>menu</span>
      </button>

      {/* ── Mobile overlay ── */}
      <div
        className={`adn-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside
        className={`adn-sidebar-fixed${sidebarOpen ? " open" : ""}`}
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: SIDEBAR_W,
          background: AC.sidebarBg,
          borderRight: `1px solid ${AC.sidebarBorder}`,
          display: "flex", flexDirection: "column",
          zIndex: 550,
          transition: "box-shadow 0.25s",
        }}
      >
        {/* ── Brand ── */}
        <div style={{
          padding: "22px 20px 18px",
          borderBottom: `1px solid ${AC.sidebarBorder}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `linear-gradient(135deg, ${AC.accent} 0%, #8B1515 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: `0 0 24px ${AC.accentGlow}`,
            }}>
              <span className="material-symbols-outlined" style={{ color: "#fff", fontSize: 20 }}>build</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.01em", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
                Red Piston
              </div>
              <div style={{ fontSize: 9, color: AC.navText, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Inter',sans-serif", marginTop: 1 }}>
                Admin Console
              </div>
            </div>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="adn-nav-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 0 8px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: AC.navText, textTransform: "uppercase", letterSpacing: "0.13em", padding: "4px 20px 10px", fontFamily: "'Inter',sans-serif", opacity: 0.55 }}>
            Management
          </div>
          {NAV_ITEMS.map(({ key, label, icon }) => (
            <button
              key={key}
              className={`adn-item${activeTab === key ? " active" : ""}`}
              onClick={() => { setActiveTab(key); setSidebarOpen(false); }}
            >
              <span className={`adn-icon material-symbols-outlined`} style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: AC.sidebarBorder, flexShrink: 0 }} />

        {/* ── User block ── */}
        <div style={{ padding: "16px 14px 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar user={currentUser} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Inter',sans-serif" }}>
                {displayName}
              </div>
              <div style={{ fontSize: 10, color: AC.navText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Inter',sans-serif", marginTop: 1 }}>
                {displayEmail}
              </div>
            </div>
          </div>
          <button
            className="adn-signout"
            onClick={() => setShowLogoutConfirm(true)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 7, padding: "9px 14px", borderRadius: 9,
              border: `1px solid ${AC.sidebarBorder}`,
              background: "transparent", color: AC.navText,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Inter',sans-serif",
              transition: "all 0.15s",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ══ CONTENT ══════════════════════════════════════════════════════════ */}
      <div className="adn-content" style={{ marginLeft: SIDEBAR_W }}>
        <div className="adn-content-inner" style={{ padding: "32px 36px 52px" }}>
          {Children.map(children, child => cloneElement(child, { activeTab, setActiveTab }))}
        </div>
      </div>

      {/* ══ LOGOUT MODAL ═════════════════════════════════════════════════════ */}
      {showLogoutConfirm && createPortal(
        <div style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: AC.surface,
            border: `1px solid ${AC.border}`,
            borderRadius: 18, padding: "36px 32px", maxWidth: 360, width: "90%",
            boxShadow: "0 32px 80px rgba(0,0,0,0.2)",
            textAlign: "center",
            fontFamily: "'Inter', sans-serif",
          }}>
            <div style={{
              width: 54, height: 54, borderRadius: 14,
              background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: AC.accent }}>logout</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: AC.t1, marginBottom: 10, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
              Sign out?
            </div>
            <div style={{ fontSize: 13, color: AC.t3, lineHeight: 1.65, marginBottom: 28 }}>
              You'll be logged out of the Admin Console.<br />Your session will be securely terminated.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1, padding: "12px", background: AC.surface,
                  border: `1.5px solid ${AC.border}`, borderRadius: 10,
                  color: AC.t2, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}
                style={{
                  flex: 1, padding: "12px",
                  background: AC.accent,
                  border: "none", borderRadius: 10,
                  color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Inter',sans-serif",
                  boxShadow: `0 6px 20px ${AC.accentGlow}`,
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Toast items={toasts} onRemove={removeToast} />
    </>
  );
}
