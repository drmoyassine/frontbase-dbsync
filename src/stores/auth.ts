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

// API base URL - prefer relative URLs in production for proper HTTPS handling
// Set VITE_API_URL=http://localhost:8000 for local development
const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_URL;

  // If no URL set or empty, use relative paths (recommended for production)
  if (!envUrl) return '';

  // If URL matches current origin, use relative paths to avoid protocol issues
  if (typeof window !== 'undefined' && envUrl.includes(window.location.hostname)) {
    return '';
  }

  return envUrl;
};

const API_BASE = getApiBase();

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
        }
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