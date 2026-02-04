import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, ExternalLink, Plus } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { FileBrowser } from './FileBrowser';
import { toast } from 'sonner';

export const StoragePanel: React.FC = () => {
  const { connections } = useDashboardStore();
  const supabaseConnected = connections.supabase.connected;
  const [isBrowsing, setIsBrowsing] = React.useState(false);

  const handleNewStorage = () => {
    toast.info('New storage providers coming soon!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage</h1>
          <p className="text-muted-foreground">
            Manage files and media with your storage providers
          </p>
        </div>
        <Button onClick={handleNewStorage}>
          <Plus className="mr-2 h-4 w-4" />
          New Storage
        </Button>
      </div>

      {!isBrowsing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Supabase Storage Card - Horizontal aspect ratio */}
          <Card className="flex flex-col shadow-sm border-muted-foreground/10 aspect-[4/3] max-w-xs">
            <CardHeader className="pb-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="p-2 bg-primary/5 rounded-lg">
                  <HardDrive className="h-5 w-5 text-primary" />
                </div>
                <Badge
                  variant={supabaseConnected ? "default" : "secondary"}
                  className="font-medium text-xs"
                >
                  {supabaseConnected ? "Enabled" : "Not Set"}
                </Badge>
              </div>
              <CardTitle className="text-base">Supabase</CardTitle>
              <CardDescription className="text-xs">Object Storage</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-end pt-0">
              {!supabaseConnected ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Connect Supabase in Database settings
                  </p>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Configure
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Dashboard
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* File Browser */}
      {supabaseConnected && <FileBrowser onNavigationChange={setIsBrowsing} />}
    </div>
  );
};