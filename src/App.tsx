import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useDashboardStore } from "@/stores/dashboard";
import { useBuilderStore } from "@/stores/builder";
import { useAuthStore } from "@/stores/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Unified Shell & DB-Sync Pages
import { Layout as UnifiedShell } from "./modules/dbsync/components/Layout";
import { Dashboard as Overview } from "./modules/dbsync/pages/Dashboard";
import { DataStudio } from "./modules/dbsync/pages/DataStudio";
import { Datasources } from "./modules/dbsync/pages/Datasources";
import { SyncConfigs } from "./modules/dbsync/pages/SyncConfigs";
import { Conflicts } from "./modules/dbsync/pages/Conflicts";
import { Jobs } from "./modules/dbsync/pages/Jobs";

// Frontbase Panels
import { PagesPanel } from "@/components/dashboard/PagesPanel";
import { UsersPanel } from "@/components/dashboard/UsersPanel";
import { StoragePanel } from "@/components/dashboard/StoragePanel";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";

// Auth Pages
import LoginPage from "./pages/auth/LoginPage";

// Other Pages
import BuilderPage from "./pages/BuilderPage";
import ActionsPage from "./pages/ActionsPage";
import VariablesPage from "./pages/VariablesPage";
import EmbedAuthPage from "./pages/EmbedAuthPage";
import NotFound from "./pages/NotFound";

// Create QueryClient with cacheTime for persistence
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - data kept in localStorage
      refetchOnWindowFocus: false, // Don't refetch when switching browser tabs
    },
  },
});

// Create localStorage persister
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'frontbase-query-cache',
});

const App = () => {
  const { fetchConnections } = useDashboardStore();
  const { loadPagesFromDatabase, loadVariablesFromDatabase, loadProjectFromDatabase } = useBuilderStore();
  const { isAuthenticated, checkAuth } = useAuthStore();

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Initialize app data only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const initializeApp = async () => {
      await Promise.all([
        fetchConnections().catch(console.error),
        loadProjectFromDatabase().catch(console.error),
        loadPagesFromDatabase().catch(console.error),
        loadVariablesFromDatabase().catch(console.error)
      ]);
    };

    initializeApp();
  }, [isAuthenticated, fetchConnections, loadProjectFromDatabase, loadPagesFromDatabase, loadVariablesFromDatabase]);

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename="/frontbase-admin">
            <Routes>
              {/* Admin root redirects to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/embed/auth/:formId" element={<EmbedAuthPage />} />

              {/* Protected Routes - Require Authentication */}
              <Route element={<ProtectedRoute />}>
                {/* Unified App Shell */}
                <Route element={<UnifiedShell />}>
                  <Route path="/dashboard" element={<Overview />} />
                  <Route path="/pages" element={<PagesPanel />} />
                  <Route path="/actions" element={<ActionsPage />} />

                  {/* Data Studio (Tabbed Interface) */}
                  <Route path="/data-studio" element={<DataStudio />}>
                    <Route index element={<Navigate to="datasources" replace />} />
                    <Route path="datasources" element={<Datasources />} />
                    <Route path="sync-configs" element={<SyncConfigs />} />
                    <Route path="conflicts" element={<Conflicts />} />
                    <Route path="jobs" element={<Jobs />} />
                  </Route>

                  <Route path="/users" element={<UsersPanel />} />
                  <Route path="/storage" element={<StoragePanel />} />
                  <Route path="/settings" element={<SettingsPanel />} />
                </Route>

                {/* Standalone / Fullscreen Pages (Protected) */}
                <Route path="/builder/:pageId" element={<BuilderPage />} />
                <Route path="/variables" element={<VariablesPage />} />
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

