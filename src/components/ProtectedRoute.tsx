import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  // Check for auth bypass in development/preview mode
  const urlParams = new URLSearchParams(window.location.search);
  const skipAuth = urlParams.get('skip_auth') === 'true';
  const isDevMode = window.location.hostname.includes('lovable') || 
                   window.location.hostname.includes('localhost') ||
                   import.meta.env.DEV;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow bypass in development mode only
  if (!isAuthenticated && !(isDevMode && skipAuth)) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <>
      {isDevMode && skipAuth && (
        <div className="fixed top-0 left-0 z-50 bg-yellow-500/90 text-black px-3 py-1 text-xs font-medium">
          🎨 Visual Edit Mode (Auth Bypassed)
        </div>
      )}
      {children}
    </>
  );
};

export default ProtectedRoute;