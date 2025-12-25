import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useDashboardStore } from "@/stores/dashboard";
import { useBuilderStore } from "@/stores/builder";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import BuilderPage from "./pages/BuilderPage";
import VariablesPage from "./pages/VariablesPage";
import EmbedAuthPage from "./pages/EmbedAuthPage";
import NotFound from "./pages/NotFound";
import DebugControlPanel from "./components/debug/DebugControlPanel";

const queryClient = new QueryClient();

const App = () => {
  const { fetchConnections } = useDashboardStore();
  const { loadPagesFromDatabase, loadVariablesFromDatabase, loadProjectFromDatabase } = useBuilderStore();

  // Initialize app on mount - load all data immediately (no auth check)
  useEffect(() => {
    const initializeApp = async () => {
      await Promise.all([
        fetchConnections().catch(console.error),
        loadProjectFromDatabase().catch(console.error),
        loadPagesFromDatabase().catch(console.error),
        loadVariablesFromDatabase().catch(console.error)
      ]);
    };

    initializeApp();
  }, [fetchConnections, loadProjectFromDatabase, loadPagesFromDatabase, loadVariablesFromDatabase]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Root redirects to dashboard - no auth needed */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {/* All routes are now public */}
              <Route path="/dashboard/*" element={<Dashboard />} />
              <Route path="/builder/:pageId" element={<BuilderPage />} />
              <Route path="/variables" element={<VariablesPage />} />
              <Route path="/embed/auth/:formId" element={<EmbedAuthPage />} />
              {/* Legacy auth routes redirect to dashboard */}
              <Route path="/auth/*" element={<Navigate to="/dashboard" replace />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <DebugControlPanel />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
