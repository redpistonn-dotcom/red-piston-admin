import { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ─── Typed store value shape ──────────────────────────────────────────────────
// This app (Admin) carries none of the ERP/marketplace collections the
// original store had (products, movements, cart, etc — see AGENT_NOTES.md).
// What's left is just the generic "app has finished its startup checks" gate
// and the shop-scope/clear-session no-ops App.tsx's auth handlers call
// unconditionally on login/logout/impersonate.

export interface StoreContextValue {
  activeShopId:    number | string;
  setActiveShopId: (id: number | string) => void;
  clearStore:      () => void;
  loaded:          boolean;
}

export const StoreContext = createContext<StoreContextValue | null>(null);

// ─── Provider hook ────────────────────────────────────────────────────────────

export function useStoreProvider(): StoreContextValue {
  const [activeShopId, setActiveShopId] = useState<number | string>(() => {
    try {
      const val = localStorage.getItem('vl_shopId') || 's1';
      const num = parseInt(val, 10);
      return !isNaN(num) ? num : val;
    } catch { return 's1'; }
  });

  const [loaded, setL] = useState(false);
  useEffect(() => { setL(true); }, []);

  const clearStore = useCallback(() => {
    setActiveShopId('s1');
    try { localStorage.removeItem('vl_shopId'); } catch {}
  }, []);

  return { activeShopId, setActiveShopId, clearStore, loaded };
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}

// Force a full page reload when this module is hot-replaced in development.
// Without this, Vite re-evaluates createContext() and creates a new StoreContext
// object — the Provider in main.tsx still holds the old reference while consumers
// get the new one, so useContext returns null → "must be used within StoreProvider".
if (import.meta.hot) {
  import.meta.hot.decline();
}
