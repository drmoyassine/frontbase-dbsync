import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useDashboardStore } from "@/stores/dashboard";
import { useBuilderStore } from "@/stores/builder";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
// Note: DatabasePanel is arguably replaced by Data Studio, or could be kept if needed.
// For now, adhering to the requested structure.

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
              {/* Unified App Shell */}
              <Route element={<UnifiedShell />}>
                <Route path="/" element={<Overview />} />
                <Route path="/pages" element={<PagesPanel />} />

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

              {/* Standalone / Fullscreen Pages */}
              <Route path="/builder/:pageId" element={<BuilderPage />} />
              <Route path="/variables" element={<VariablesPage />} />
              <Route path="/embed/auth/:formId" element={<EmbedAuthPage />} />

              {/* 404 */}
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

