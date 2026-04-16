/**
 * Auth Store - Dual-mode Authentication
 *
 * Self-host mode: Session-based auth via FastAPI cookies (existing behavior)
 * Cloud mode:     JWT-based auth with signup support
 *
 * Connects to FastAPI backend. Mode detection via edition.ts.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isCloud } from '@/lib/edition';

// User interface — extended for cloud tenancy
export interface User {
  id: string;
  email: string;
  username?: string;
  tenant_id?: string;      // Cloud only
  tenant_slug?: string;    // Cloud only
  role?: string;           // Cloud only (owner | admin | editor | viewer | master)
  is_master?: boolean;     // Cloud only
  created_at: string;
  updated_at: string;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
}

interface AuthState {
  user: User | null;
  tenant: TenantInfo | null;
  token: string | null;          // JWT token (cloud mode only)
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Auth actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, workspaceName: string, slug: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;

  // Legacy compatibility
  cleanupAuthState: () => void;
  resetBackendConnection: () => Promise<boolean>;
  validateSession: () => boolean;
  forceReauth: () => void;
}

// API base URL - ALWAYS use relative URLs in production for proper HTTPS handling
const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl || envUrl === '') return '';
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'https:' || envUrl.includes(window.location.hostname)) {
      return '';
    }
  }
  return envUrl;
};

const API_BASE = getApiBase();

/**
 * Build fetch options — cloud mode adds JWT Authorization header,
 * self-host mode uses credentials: 'include' for cookies.
 */
function fetchOpts(token: string | null, extra: RequestInit = {}): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra.headers as Record<string, string> || {}),
  };

  if (isCloud() && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return {
    ...extra,
    headers,
    credentials: isCloud() ? 'omit' : 'include',
  };
}

// Module-level dedup for checkAuth — App.tsx and ProtectedRoute.tsx both call it on mount
let _checkAuthPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(
            `${API_BASE}/api/auth/login`,
            {
              method: 'POST',
              ...fetchOpts(null, { body: JSON.stringify({ email, password }) }),
            }
          );

          if (!response.ok) {
            const data = await response.json();
            set({ isLoading: false, error: data.detail || 'Login failed' });
            return { success: false, error: data.detail };
          }

          const data = await response.json();

          if (isCloud()) {
            // Cloud mode — JWT response
            set({
              user: data.user,
              tenant: data.tenant || null,
              token: data.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            // Self-host mode — session cookie response
            set({
              user: data.user,
              tenant: null,
              token: null,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          }
          return { success: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Network error';
          set({ isLoading: false, error });
          return { success: false, error };
        }
      },

      signup: async (email, password, workspaceName, slug) => {
        if (!isCloud()) {
          return { success: false, error: 'Signup is only available in cloud mode' };
        }

        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              password,
              workspace_name: workspaceName,
              slug,
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            set({ isLoading: false, error: data.detail || 'Signup failed' });
            return { success: false, error: data.detail };
          }

          const data = await response.json();

          set({
            user: data.user,
            tenant: data.tenant || null,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return { success: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Network error';
          set({ isLoading: false, error });
          return { success: false, error };
        }
      },

      logout: async () => {
        const { token } = get();
        try {
          if (!isCloud()) {
            // Self-host: hit logout endpoint to clear server session
            await fetch(`${API_BASE}/api/auth/logout`, {
              method: 'POST',
              credentials: 'include',
            });
          }
          // Cloud: JWT is stateless — just clear local state
        } catch {
          // Ignore logout errors
        }
        set({ user: null, tenant: null, token: null, isAuthenticated: false, error: null });
      },

      checkAuth: async () => {
        // Dedup: if a check is already in-flight, wait for it
        if (_checkAuthPromise) {
          await _checkAuthPromise;
          return;
        }

        _checkAuthPromise = (async () => {
          const { token } = get();

          // Cloud mode with no token — skip network call
          if (isCloud() && !token) {
            set({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
            return;
          }

          set({ isLoading: true });
          try {
            const response = await fetch(
              `${API_BASE}/api/auth/me`,
              fetchOpts(token),
            );

            if (response.ok) {
              const data = await response.json();
              set({
                user: data.user,
                tenant: data.tenant || get().tenant,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              set({ user: null, tenant: null, token: null, isAuthenticated: false, isLoading: false });
            }
          } catch {
            set({ user: null, tenant: null, token: null, isAuthenticated: false, isLoading: false });
          } finally {
            _checkAuthPromise = null;
          }
        })();

        await _checkAuthPromise;
      },

      clearError: () => set({ error: null }),

      // Legacy compatibility methods
      cleanupAuthState: () => set({ user: null, tenant: null, token: null, isAuthenticated: false, error: null }),
      resetBackendConnection: async () => {
        await get().checkAuth();
        return get().isAuthenticated;
      },
      validateSession: () => get().isAuthenticated,
      forceReauth: () => set({ user: null, tenant: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'frontbase-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);