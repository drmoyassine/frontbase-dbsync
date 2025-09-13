import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ExternalLink, AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';

export const UsersPanel: React.FC = () => {
  const { supabaseConnected } = useDashboardStore();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          Manage user authentication and access
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Supabase Authentication
            </CardTitle>
            <CardDescription>
              Configure Supabase Auth for user management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={supabaseConnected ? "default" : "secondary"}>
                {supabaseConnected ? (
                  <>
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Auth Enabled
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Auth Not Configured
                  </>
                )}
              </Badge>
            </div>

            {!supabaseConnected ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Connect your Supabase project in the Database section to enable user authentication.
                </div>
                <Button variant="outline">
                  Go to Database Settings
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Supabase Authentication is configured for your project.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in Supabase
                  </Button>
                  <Button variant="outline" size="sm">
                    Auth Settings
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {supabaseConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>
                View and manage your application users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Users className="mx-auto h-12 w-12 mb-4" />
                <p>No users found</p>
                <p className="text-sm">Users will appear here once they register</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};