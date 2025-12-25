/**
 * Auth Store (Stubbed - No Authentication)
 * 
 * This is a minimal stub that always returns authenticated state.
 * All auth logic has been removed for uninterrupted development.
 */

import { create } from 'zustand';

// User interface kept for type compatibility
export interface User {
  id: string;
  username: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Stub actions for compatibility
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  cleanupAuthState: () => void;
  resetBackendConnection: () => Promise<boolean>;
  validateSession: () => boolean;
  forceReauth: () => void;
}

// Default user for development
const defaultUser: User = {
  id: 'dev-user',
  username: 'developer',
  email: 'dev@frontbase.local',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const useAuthStore = create<AuthState>()((set) => ({
  // Always authenticated with default user
  user: defaultUser,
  isAuthenticated: true,
  isLoading: false,
  error: null,

  // All actions are no-ops or return success
  login: async () => ({ success: true }),
  register: async () => ({ success: true }),
  logout: () => {
    // No-op - stay authenticated
  },
  checkAuth: async () => {
    // No-op - always authenticated
  },
  clearError: () => set({ error: null }),
  cleanupAuthState: () => {
    // No-op
  },
  resetBackendConnection: async () => true,
  validateSession: () => true,
  forceReauth: () => {
    // No-op
  },
}));