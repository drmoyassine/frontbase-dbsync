import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, ExternalLink, AlertCircle, CheckCircle, FolderOpen } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';

export const StoragePanel: React.FC = () => {
  const { connections } = useDashboardStore();
  const supabaseConnected = connections.supabase.connected;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Storage</h1>
        <p className="text-muted-foreground">
          Manage files and media with Supabase Storage
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Supabase Storage
            </CardTitle>
            <CardDescription>
              Configure Supabase Storage for file management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={supabaseConnected ? "default" : "secondary"}>
                {supabaseConnected ? (
                  <>
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Storage Enabled
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Storage Not Configured
                  </>
                )}
              </Badge>
            </div>

            {!supabaseConnected ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Connect your Supabase project in the Database section to enable file storage.
                </div>
                <Button variant="outline">
                  Go to Database Settings
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Supabase Storage is configured for your project.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in Supabase
                  </Button>
                  <Button variant="outline" size="sm">
                    Create Bucket
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {supabaseConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Storage Buckets</CardTitle>
              <CardDescription>
                Organize your files in storage buckets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="mx-auto h-12 w-12 mb-4" />
                <p>No storage buckets found</p>
                <p className="text-sm">Create buckets to organize your files</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};