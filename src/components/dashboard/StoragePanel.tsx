import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { FileBrowser } from './FileBrowser';

export const StoragePanel: React.FC = () => {
  const { connections } = useDashboardStore();
  const supabaseConnected = connections.supabase.connected;
  const [isBrowsing, setIsBrowsing] = React.useState(false);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Storage</h1>
        <p className="text-muted-foreground">
          Manage files and media with your storage providers
        </p>
      </div>

      {!isBrowsing && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="flex flex-col shadow-sm border-muted-foreground/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/5 rounded-lg">
                    <HardDrive className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Supabase</CardTitle>
                    <CardDescription className="text-xs">Object Storage</CardDescription>
                  </div>
                </div>
                <Badge variant={supabaseConnected ? "default" : "secondary"} className="font-medium">
                  {supabaseConnected ? "Enabled" : "Not Configured"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-grow flex flex-col justify-end">
              {!supabaseConnected ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Connect your Supabase project in Database settings to enable.
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    Configure Settings
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Dashboard
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Future provider placeholders can be added here */}
        </div>
      )}

      {/* File Browser */}
      {supabaseConnected && <FileBrowser onNavigationChange={setIsBrowsing} />}
    </div>
  );
};