import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Settings, Database, Globe, Palette, Loader2, Check, X, RefreshCw } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/modules/dbsync/api';

export const SettingsPanel: React.FC = () => {
  const { project } = useBuilderStore();
  const queryClient = useQueryClient();

  // Redis state
  const [redisUrl, setRedisUrl] = useState('');
  const [redisEnabled, setRedisEnabled] = useState(false);
  const [cacheTtlData, setCacheTtlData] = useState(60);
  const [cacheTtlCount, setCacheTtlCount] = useState(300);
  const [hasRedisChanges, setHasRedisChanges] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: redisSettings, isLoading: isRedisLoading } = useQuery({
    queryKey: ['redisSettings'],
    queryFn: () => settingsApi.getRedis().then(r => r.data),
  });

  useEffect(() => {
    if (redisSettings) {
      setRedisUrl(redisSettings.redis_url || '');
      setRedisEnabled(redisSettings.redis_enabled);
      setCacheTtlData(redisSettings.cache_ttl_data);
      setCacheTtlCount(redisSettings.cache_ttl_count);
    }
  }, [redisSettings]);

  const saveRedisMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updateRedis(data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redisSettings'] });
      setHasRedisChanges(false);
    },
  });

  const testRedisMutation = useMutation({
    mutationFn: (data: any) => settingsApi.testRedis(data).then(r => r.data),
    onSuccess: (result) => setTestResult(result),
    onError: () => setTestResult({ success: false, message: 'Connection test failed' }),
  });

  const handleRedisChange = () => {
    setHasRedisChanges(true);
    setTestResult(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Project Details
            </CardTitle>
            <CardDescription>
              Basic information about your project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                defaultValue={project?.name || ''}
                placeholder="My Awesome Website"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                defaultValue={project?.description || ''}
                placeholder="Describe your project..."
                rows={3}
              />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Supabase Integration
            </CardTitle>
            <CardDescription>
              Connect your Supabase project for backend functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <Input
                id="supabase-url"
                placeholder="https://your-project.supabase.co"
                defaultValue={project?.supabaseUrl || ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabase-key">Supabase Anon Key</Label>
              <Input
                id="supabase-key"
                type="password"
                placeholder="Your Supabase anonymous key"
                defaultValue={project?.supabaseAnonKey || ''}
              />
            </div>
            <Button>Update Integration</Button>
          </CardContent>
        </Card>

        {/* Redis Cache Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Redis Cache Configuration
            </CardTitle>
            <CardDescription>
              Configure Redis caching to improve data loading performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRedisLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="redis-url">Redis URL</Label>
                  <Input
                    id="redis-url"
                    placeholder="redis://username:password@host:port/db"
                    value={redisUrl}
                    onChange={(e) => { setRedisUrl(e.target.value); handleRedisChange(); }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: redis://default:mypassword@redis.example.com:6379/0
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testRedisMutation.mutate({ redis_url: redisUrl })}
                    disabled={!redisUrl || testRedisMutation.isPending}
                  >
                    {testRedisMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                  {testResult && (
                    <div className={`flex items-center gap-1 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      {testResult.message}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Redis Caching</Label>
                    <p className="text-xs text-muted-foreground">
                      When disabled, all data is fetched directly from the source
                    </p>
                  </div>
                  <Switch
                    checked={redisEnabled}
                    onCheckedChange={(checked) => { setRedisEnabled(checked); handleRedisChange(); }}
                    disabled={!redisUrl}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ttl-data">Data Cache TTL (seconds)</Label>
                    <Input
                      id="ttl-data"
                      type="number"
                      value={cacheTtlData}
                      onChange={(e) => { setCacheTtlData(parseInt(e.target.value)); handleRedisChange(); }}
                      disabled={!redisEnabled}
                    />
                    <p className="text-xs text-muted-foreground">How long to cache record data</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ttl-count">Count Cache TTL (seconds)</Label>
                    <Input
                      id="ttl-count"
                      type="number"
                      value={cacheTtlCount}
                      onChange={(e) => { setCacheTtlCount(parseInt(e.target.value)); handleRedisChange(); }}
                      disabled={!redisEnabled}
                    />
                    <p className="text-xs text-muted-foreground">How long to cache record counts</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => saveRedisMutation.mutate({
                      redis_url: redisUrl || null,
                      redis_enabled: redisEnabled,
                      cache_ttl_data: cacheTtlData,
                      cache_ttl_count: cacheTtlCount,
                    })}
                    disabled={!hasRedisChanges || saveRedisMutation.isPending}
                  >
                    {saveRedisMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Save Redis Settings
                  </Button>
                  {saveRedisMutation.isSuccess && !hasRedisChanges && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <Check className="h-4 w-4" /> Saved
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              SEO & Meta
            </CardTitle>
            <CardDescription>
              Default SEO settings for your website
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default-title">Default Page Title</Label>
              <Input
                id="default-title"
                placeholder="My Website"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-description">Default Meta Description</Label>
              <Textarea
                id="default-description"
                placeholder="A description of your website..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-keywords">Default Keywords</Label>
              <Input
                id="default-keywords"
                placeholder="keyword1, keyword2, keyword3"
              />
            </div>
            <Button>Save SEO Settings</Button>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive">
              Delete Project
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
