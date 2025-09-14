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
        console.log('=== AUTH STORE: CHECK AUTH ===');
        console.log('Starting authentication check...');
        console.log('Current URL:', window.location.href);
        console.log('Current cookies:', document.cookie);
        
        try {
          set({ isLoading: true });
          
          const response = await fetch('/api/auth/me', {
            credentials: 'include',
          });

          console.log('Auth check response status:', response.status);
          console.log('Auth check response ok:', response.ok);
          console.log('Auth check response headers:', Object.fromEntries(response.headers.entries()));

          if (response.ok) {
            const data = await response.json();
            console.log('Auth check successful, user data:', data);
            set({ 
              user: data.user, 
              isAuthenticated: true, 
              isLoading: false 
            });
            console.log('User is authenticated:', data.user);
          } else {
            const errorText = await response.text();
            console.log('Auth check failed with status:', response.status);
            console.log('Auth check error response:', errorText);
            set({ 
              user: null, 
              isAuthenticated: false, 
              isLoading: false 
            });
            console.log('User is NOT authenticated');
          }
        } catch (error) {
          console.error('Auth check network/parse error:', error);
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
          console.log('User is NOT authenticated due to error');
        }
        console.log('=== AUTH CHECK COMPLETED ===');
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