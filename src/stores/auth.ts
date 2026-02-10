/**
 * Auth Store - Real Authentication
 * 
 * Connects to FastAPI backend for session-based authentication.
 * Manages user state, login, logout, and session verification.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// User interface
export interface User {
  id: string;
  email: string;
  username?: string;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Auth actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, username?: string) => Promise<{ success: boolean; error?: string }>;
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
// Set VITE_API_URL=http://localhost:8000 for local development only
const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;

  // Debug logging (remove in production)
  console.log('[Auth] VITE_API_URL:', envUrl);
  console.log('[Auth] window.location.origin:', typeof window !== 'undefined' ? window.location.origin : 'N/A');

  // If no URL set or empty, use relative paths
  if (!envUrl || envUrl === '') return '';

  // In production (HTTPS), always use relative paths to avoid mixed content
  if (typeof window !== 'undefined') {
    // If on HTTPS or same hostname, use relative URLs
    if (window.location.protocol === 'https:' || envUrl.includes(window.location.hostname)) {
      console.log('[Auth] Using relative URLs (production mode)');
      return '';
    }
  }

  console.log('[Auth] Using absolute URL:', envUrl);
  return envUrl;
};

const API_BASE = getApiBase();

// Module-level dedup for checkAuth — App.tsx and ProtectedRoute.tsx both call it on mount
let _checkAuthPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Include cookies
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            const data = await response.json();
            set({ isLoading: false, error: data.detail || 'Login failed' });
            return { success: false, error: data.detail };
          }

          const data = await response.json();
          set({
            user: data.user,
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

      register: async (email, password, username) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password, username }),
          });

          if (!response.ok) {
            const data = await response.json();
            set({ isLoading: false, error: data.detail || 'Registration failed' });
            return { success: false, error: data.detail };
          }

          const data = await response.json();
          set({
            user: data.user,
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
        try {
          await fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // Ignore logout errors
        }
        set({ user: null, isAuthenticated: false, error: null });
      },

      checkAuth: async () => {
        // Dedup: if a check is already in-flight, wait for it
        if (_checkAuthPromise) {
          await _checkAuthPromise;
          return;
        }

        _checkAuthPromise = (async () => {
          set({ isLoading: true });
          try {
            const response = await fetch(`${API_BASE}/api/auth/me`, {
              credentials: 'include',
            });

            if (response.ok) {
              const data = await response.json();
              set({ user: data.user, isAuthenticated: true, isLoading: false });
            } else {
              set({ user: null, isAuthenticated: false, isLoading: false });
            }
          } catch {
            set({ user: null, isAuthenticated: false, isLoading: false });
          } finally {
            _checkAuthPromise = null;
          }
        })();

        await _checkAuthPromise;
      },

      clearError: () => set({ error: null }),

      // Legacy compatibility methods
      cleanupAuthState: () => set({ user: null, isAuthenticated: false, error: null }),
      resetBackendConnection: async () => {
        await get().checkAuth();
        return get().isAuthenticated;
      },
      validateSession: () => get().isAuthenticated,
      forceReauth: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'frontbase-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);