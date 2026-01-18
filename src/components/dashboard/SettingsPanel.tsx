import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Settings, Globe, Palette, Loader2, Check, X, RefreshCw, Database, Shield } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/modules/dbsync/api';

export const SettingsPanel: React.FC = () => {
  const { project } = useBuilderStore();
  const queryClient = useQueryClient();

  // Redis state
  const [redisUrl, setRedisUrl] = useState('');
  const [redisToken, setRedisToken] = useState('');
  const [redisType, setRedisType] = useState<'upstash' | 'self-hosted'>('upstash');
  const [redisEnabled, setRedisEnabled] = useState(false);
  const [cacheTtlData, setCacheTtlData] = useState(60);
  const [cacheTtlCount, setCacheTtlCount] = useState(300);
  const [hasRedisChanges, setHasRedisChanges] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Privacy state
  const [enableVisitorTracking, setEnableVisitorTracking] = useState(false);
  const [cookieExpiryDays, setCookieExpiryDays] = useState(365);
  const [requireCookieConsent, setRequireCookieConsent] = useState(true);
  const [hasPrivacyChanges, setHasPrivacyChanges] = useState(false);

  const { data: redisSettings, isLoading: isRedisLoading } = useQuery({
    queryKey: ['redisSettings'],
    queryFn: () => settingsApi.getRedis().then(r => r.data),
  });

  useEffect(() => {
    if (redisSettings) {
      setRedisUrl(redisSettings.redis_url || '');
      setRedisToken(redisSettings.redis_token || '');
      setRedisType(redisSettings.redis_type || 'upstash');
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

  // Privacy queries
  const { data: privacySettings, isLoading: isPrivacyLoading } = useQuery({
    queryKey: ['privacySettings'],
    queryFn: () => settingsApi.getPrivacy().then(r => r.data),
  });

  useEffect(() => {
    if (privacySettings) {
      setEnableVisitorTracking(privacySettings.enableVisitorTracking);
      setCookieExpiryDays(privacySettings.cookieExpiryDays);
      setRequireCookieConsent(privacySettings.requireCookieConsent);
    }
  }, [privacySettings]);

  const savePrivacyMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updatePrivacy(data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacySettings'] });
      setHasPrivacyChanges(false);
    },
  });

  const handlePrivacyChange = () => {
    setHasPrivacyChanges(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="cache">Cache & Performance</TabsTrigger>
          <TabsTrigger value="privacy">Privacy & Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Project Details
              </CardTitle>
              <CardDescription>
                Configure default SEO and meta information for your website
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
              <div className="pt-2">
                <Button>Save Changes</Button>
              </div>
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
        </TabsContent>

        <TabsContent value="cache" className="space-y-6 mt-6">
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
                  {/* Two-Path Selector */}
                  <div className="space-y-3">
                    <Label>Redis Provider</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setRedisType('upstash'); handleRedisChange(); }}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${redisType === 'upstash'
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/30'
                          }`}
                      >
                        <div className="font-medium">Upstash (Managed)</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Serverless Redis with built-in REST API. Zero config.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRedisType('self-hosted'); handleRedisChange(); }}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${redisType === 'self-hosted'
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/30'
                          }`}
                      >
                        <div className="font-medium">Self-Hosted (BYO)</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Your own Redis with our HTTP proxy.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Upstash Path */}
                  {redisType === 'upstash' && (
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                      <div className="space-y-2">
                        <Label htmlFor="redis-url">Upstash REST URL</Label>
                        <Input
                          id="redis-url"
                          placeholder="https://your-instance.upstash.io"
                          value={redisUrl}
                          onChange={(e) => { setRedisUrl(e.target.value); handleRedisChange(); }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="redis-token">Upstash REST Token</Label>
                        <Input
                          id="redis-token"
                          type="password"
                          placeholder="AX...your-upstash-token"
                          value={redisToken}
                          onChange={(e) => { setRedisToken(e.target.value); handleRedisChange(); }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Find these in your Upstash Console → Database → REST API
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Self-Hosted Path */}
                  {redisType === 'self-hosted' && (
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                      <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm">
                        <div className="font-medium text-blue-600 dark:text-blue-400 mb-1">
                          📦 Deploy serverless-redis-http (SRH)
                        </div>
                        <p className="text-muted-foreground text-xs mb-2">
                          SRH is a lightweight proxy that adds REST API to your Redis. Run it as a sidecar:
                        </p>
                        <pre className="text-xs bg-black/20 p-2 rounded overflow-x-auto">
                          {`docker run -d \\
  -e SRH_MODE=env \\
  -e SRH_TOKEN=your_secret_token \\
  -e SRH_CONNECTION_STRING=redis://your-redis:6379 \\
  -p 8079:80 \\
  hiett/serverless-redis-http:latest`}
                        </pre>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="redis-url">SRH Proxy URL</Label>
                        <Input
                          id="redis-url"
                          placeholder="http://localhost:8079"
                          value={redisUrl}
                          onChange={(e) => { setRedisUrl(e.target.value); handleRedisChange(); }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="redis-token">SRH Token</Label>
                        <Input
                          id="redis-token"
                          type="password"
                          placeholder="The SRH_TOKEN you set above"
                          value={redisToken}
                          onChange={(e) => { setRedisToken(e.target.value); handleRedisChange(); }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testRedisMutation.mutate({
                        redis_url: redisUrl,
                        redis_token: redisToken,
                        redis_type: redisType
                      })}
                      disabled={!redisUrl || !redisToken || testRedisMutation.isPending}
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
                        redis_token: redisToken || null,
                        redis_type: redisType,
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
        </TabsContent>

        <TabsContent value="privacy" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Tracking
              </CardTitle>
              <CardDescription>
                Configure visitor tracking to enable personalization features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPrivacyLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading settings...
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable visitor tracking cookies</Label>
                      <p className="text-xs text-muted-foreground">
                        Track first visit, visit count, and landing page for personalization
                      </p>
                    </div>
                    <Switch
                      checked={enableVisitorTracking}
                      onCheckedChange={(checked) => { setEnableVisitorTracking(checked); handlePrivacyChange(); }}
                    />
                  </div>

                  {enableVisitorTracking && (
                    <>
                      <Separator />

                      <div className="space-y-2">
                        <Label htmlFor="cookie-expiry">Cookie expiry (days)</Label>
                        <Input
                          id="cookie-expiry"
                          type="number"
                          value={cookieExpiryDays}
                          onChange={(e) => { setCookieExpiryDays(parseInt(e.target.value)); handlePrivacyChange(); }}
                          min={1}
                          max={730}
                          className="max-w-[200px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          How long to remember visitors (1-730 days). Default: 365 days.
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Require cookie consent banner</Label>
                          <p className="text-xs text-muted-foreground">
                            Show consent before setting tracking cookies (GDPR compliant)
                          </p>
                        </div>
                        <Switch
                          checked={requireCookieConsent}
                          onCheckedChange={(checked) => { setRequireCookieConsent(checked); handlePrivacyChange(); }}
                        />
                      </div>

                      <div className="p-4 rounded-lg bg-muted/50 border">
                        <div className="font-medium mb-2">Available Variables:</div>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          <li><code className="text-xs bg-muted px-1.5 py-0.5 rounded">visitor.isFirstVisit</code> - Boolean indicating first visit</li>
                          <li><code className="text-xs bg-muted px-1.5 py-0.5 rounded">visitor.visitCount</code> - Number of visits</li>
                          <li><code className="text-xs bg-muted px-1.5 py-0.5 rounded">visitor.firstVisitAt</code> - Timestamp of first visit</li>
                          <li><code className="text-xs bg-muted px-1.5 py-0.5 rounded">visitor.landingPage</code> - First page visited</li>
                        </ul>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => savePrivacyMutation.mutate({
                        enableVisitorTracking,
                        cookieExpiryDays,
                        requireCookieConsent,
                      })}
                      disabled={!hasPrivacyChanges || savePrivacyMutation.isPending}
                    >
                      {savePrivacyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Save Privacy Settings
                    </Button>
                    {savePrivacyMutation.isSuccess && !hasPrivacyChanges && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <Check className="h-4 w-4" /> Saved
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
