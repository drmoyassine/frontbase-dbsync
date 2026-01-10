/**
 * ProtectedRoute - Auth Guard Component
 * 
 * Wraps routes that require authentication.
 * Redirects to login page if not authenticated.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useEffect } from 'react';

interface ProtectedRouteProps {
    children?: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
    const location = useLocation();

    // Check auth on mount
    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Show loading state while checking auth
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Render children or outlet
    return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;
