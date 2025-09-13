import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (username: string, password: string) => {
        try {
          set({ isLoading: true });
          
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include',
          });

          const data = await response.json();

          if (response.ok) {
            set({ 
              user: data.user, 
              isAuthenticated: true, 
              isLoading: false 
            });
            return { success: true };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error || 'Login failed' };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: 'Network error' };
        }
      },

      register: async (username: string, email: string, password: string) => {
        try {
          set({ isLoading: true });
          
          const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password }),
            credentials: 'include',
          });

          const data = await response.json();

          if (response.ok) {
            set({ 
              user: data.user, 
              isAuthenticated: true, 
              isLoading: false 
            });
            return { success: true };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error || 'Registration failed' };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: 'Network error' };
        }
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
          });
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
        }
      },

      checkAuth: async () => {
        try {
          set({ isLoading: true });
          
          const response = await fetch('/api/auth/me', {
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            set({ 
              user: data.user, 
              isAuthenticated: true, 
              isLoading: false 
            });
          } else {
            set({ 
              user: null, 
              isAuthenticated: false, 
              isLoading: false 
            });
          }
        } catch (error) {
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
        }
      },

      setUser: (user: User | null) => {
        set({ 
          user, 
          isAuthenticated: !!user 
        });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'frontbase-auth',
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);