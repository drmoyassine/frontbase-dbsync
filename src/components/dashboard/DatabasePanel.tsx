import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';

export const DatabasePanel: React.FC = () => {
  const { supabaseConnected, supabaseUrl } = useDashboardStore();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Database</h1>
        <p className="text-muted-foreground">
          Connect and manage your Supabase database
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Supabase Connection
            </CardTitle>
            <CardDescription>
              Connect your Supabase project to enable database functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={supabaseConnected ? "default" : "secondary"}>
                {supabaseConnected ? (
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
              {supabaseConnected && supabaseUrl && (
                <Badge variant="outline">{new URL(supabaseUrl).hostname}</Badge>
              )}
            </div>

            {!supabaseConnected ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="supabase-url">Supabase URL</Label>
                  <Input
                    id="supabase-url"
                    placeholder="https://your-project.supabase.co"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supabase-key">Supabase Anon Key</Label>
                  <Input
                    id="supabase-key"
                    type="password"
                    placeholder="Your Supabase anonymous key"
                  />
                </div>
                <Button>Connect Database</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Your Supabase database is connected and ready to use.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in Supabase
                  </Button>
                  <Button variant="outline" size="sm">
                    View Tables
                  </Button>
                  <Button variant="destructive" size="sm">
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {supabaseConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Database Tables</CardTitle>
              <CardDescription>
                Overview of your Supabase database tables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Database className="mx-auto h-12 w-12 mb-4" />
                <p>Connect your database to view tables</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};