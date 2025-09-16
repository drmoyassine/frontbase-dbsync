import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useCallback, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { useDashboardStore } from "@/stores/dashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import BuilderPage from "./pages/BuilderPage";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => {
  const { checkAuth, isLoading, isAuthenticated } = useAuthStore();
  const { fetchConnections } = useDashboardStore();
  const [appInitialized, setAppInitialized] = useState(false);

  // Sequential initialization: Auth → Dashboard → Ready
  const initializeApp = useCallback(async () => {
    try {
      // Step 1: Check authentication
      await checkAuth();
      
      // Step 2: If authenticated, fetch dashboard connections
      if (isAuthenticated && !isLoading) {
        await fetchConnections();
        setAppInitialized(true);
      }
    } catch (error) {
      console.error('App initialization failed:', error);
      setAppInitialized(true); // Still show the app even if connections fail
    }
  }, [checkAuth, fetchConnections, isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      initializeApp();
    }
  }, [initializeApp, isLoading]);

  if (isLoading || !appInitialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {isLoading ? 'Checking authentication...' : 'Loading connections...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/dashboard/*" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/builder/:pageId" element={
              <ProtectedRoute>
                <BuilderPage />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
