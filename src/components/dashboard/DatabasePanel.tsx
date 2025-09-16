import React, { useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, ExternalLink, AlertCircle, CheckCircle, Plus, Settings, Trash2 } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useAuthStore } from '@/stores/auth';
import { SupabaseConnectionModal } from './SupabaseConnectionModal';
import { SimpleDataTableView } from '@/components/admin/SimpleDataTableView';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const DatabasePanel: React.FC = () => {
  const { connections, setSupabaseModalOpen } = useDashboardStore();
  const { connected } = useDataBindingStore();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { toast } = useToast();

  // Get stable store functions - only fetch connections, not data binding initialization
  const fetchConnections = useDashboardStore(state => state.fetchConnections);

  // Initialize connections only (data binding is handled by App.tsx)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      fetchConnections();
    }
  }, [isAuthenticated, isLoading, fetchConnections]);

  const handleDisconnectSupabase = async () => {
    try {
      const response = await fetch('/api/database/disconnect-supabase', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast({
          title: "Disconnected",
          description: "Supabase connection has been removed",
        });
        await fetchConnections();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: "Error",
          description: errorData.error || "Failed to disconnect",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      toast({
        title: "Connection Error", 
        description: "Check if encryption key is set properly. See API.md for troubleshooting.",
        variant: "destructive"
      });
    }
  };

  const openSupabaseProject = () => {
    if (connections.supabase.url) {
      window.open(connections.supabase.url, '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-full overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Database Providers</h1>
        <p className="text-muted-foreground">
          Connect and manage your database providers
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Supabase Provider Card */}
        <Card className="relative">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Supabase</CardTitle>
                  <CardDescription className="text-sm">
                    PostgreSQL database with real-time features
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={connections.supabase.connected ? "default" : "secondary"}>
                {connections.supabase.connected ? (
                  <>
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not Connected
                  </>
                )}
              </Badge>
              {connections.supabase.connected && connections.supabase.url && (
                <Badge variant="outline">
                  {new URL(connections.supabase.url).hostname}
                </Badge>
              )}
            </div>

            {connections.supabase.connected ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Your Supabase database is connected and ready to use.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={openSupabaseProject}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Project
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSupabaseModalOpen(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Supabase?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove your Supabase connection. You can reconnect anytime.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnectSupabase} className="bg-destructive text-destructive-foreground">
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Connect your Supabase project to enable database features, authentication, and real-time functionality.
                </div>
                <Button onClick={() => setSupabaseModalOpen(true)} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Supabase
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Xano Provider Card - Coming Soon */}
        <Card className="relative opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Xano</CardTitle>
                  <CardDescription className="text-sm">
                    No-code backend with APIs
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary">Coming Soon</Badge>
            <div className="text-sm text-muted-foreground">
              Connect to Xano for powerful no-code backend functionality.
            </div>
            <Button disabled className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Connect Xano
            </Button>
          </CardContent>
        </Card>

        {/* Generic SQL Provider Card - Coming Soon */}
        <Card className="relative opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Custom SQL</CardTitle>
                  <CardDescription className="text-sm">
                    Connect to any SQL database
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary">Coming Soon</Badge>
            <div className="text-sm text-muted-foreground">
              Connect to MySQL, PostgreSQL, or other SQL databases.
            </div>
            <Button disabled className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Connect Database
            </Button>
          </CardContent>
        </Card>
      </div>


      <SupabaseConnectionModal />
    </div>
  );
};