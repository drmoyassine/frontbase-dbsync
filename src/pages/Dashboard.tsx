import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { PagesPanel } from '@/components/dashboard/PagesPanel';
import { DatabasePanel } from '@/components/dashboard/DatabasePanel';
import { UsersPanel } from '@/components/dashboard/UsersPanel';
import { StoragePanel } from '@/components/dashboard/StoragePanel';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';

const Dashboard: React.FC = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full max-w-full overflow-hidden">
        <DashboardLayout>
          <div className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

            <Routes>
              <Route path="/" element={<Navigate to="/dashboard/pages" replace />} />
              <Route path="/pages" element={<PagesPanel />} />
              <Route path="/database" element={<DatabasePanel />} />
              <Route path="/users" element={<UsersPanel />} />
              <Route path="/storage" element={<StoragePanel />} />
              <Route path="/settings" element={<SettingsPanel />} />
            </Routes>
          </div>
        </DashboardLayout>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;