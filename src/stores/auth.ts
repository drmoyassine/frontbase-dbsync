import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debug } from '@/lib/debug';
import { requestDeduplicator, generateRequestKey } from '@/lib/request-deduplicator';

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
          debug.error('AUTH', 'Logout error:', error);
        } finally {
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
        }
      },

      checkAuth: async () => {
        const requestKey = generateRequestKey('/api/auth/me');
        
        return requestDeduplicator.dedupe(requestKey, async () => {
          debug.critical('AUTH', 'Starting authentication check');
          const currentState = get();
          
          try {
            set({ isLoading: true });
            
            const response = await fetch('/api/auth/me', {
              credentials: 'include',
            });

            if (response.ok) {
              const data = await response.json();
              
              if (data.recovered) {
                debug.auth.recovery('CHECK', data.user?.id);
              } else {
                debug.auth.success('CHECK', data.user?.id);
              }
              
              set({ 
                user: data.user, 
                isAuthenticated: true, 
                isLoading: false 
              });
            } else {
              // Check if we should attempt session recovery
              const isOnLoginPage = window.location.pathname.includes('/auth/login');
              
              if (response.status === 401 && currentState.user && currentState.isAuthenticated && !isOnLoginPage) {
                debug.critical('AUTH', 'Attempting session recovery for user:', currentState.user.id);
                
                try {
                  const recoveryResponse = await fetch('/api/auth/me', {
                    credentials: 'include',
                    headers: {
                      'X-Recovery-User-Id': currentState.user.id,
                      'Authorization': 'Bearer recovery-token'
                    }
                  });

                  if (recoveryResponse.ok) {
                    const recoveryData = await recoveryResponse.json();
                    debug.auth.recovery('RECOVERY', recoveryData.user?.id);
                    
                    set({ 
                      user: recoveryData.user, 
                      isAuthenticated: true, 
                      isLoading: false 
                    });
                    return;
                  }
                } catch (recoveryError) {
                  debug.error('AUTH', 'Session recovery failed:', recoveryError);
                }
              } else if (isOnLoginPage && currentState.user && currentState.isAuthenticated) {
                debug.critical('AUTH', 'Clearing stale auth data on login page');
              }
              
              debug.auth.failure('CHECK', `Status: ${response.status}`);
              set({ 
                user: null, 
                isAuthenticated: false, 
                isLoading: false 
              });
            }
          } catch (error) {
            debug.error('AUTH', 'Network/parse error:', error);
            set({ 
              user: null, 
              isAuthenticated: false, 
              isLoading: false 
            });
          }
        });
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