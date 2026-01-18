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

  // Advanced Variables (each has collect + expose toggles)
  // Basic variables (country, city, timezone, device) are always available - not configurable
  const defaultVar = { collect: true, expose: true };
  const [advancedVariables, setAdvancedVariables] = useState({
    ip: { collect: false, expose: false },
    browser: { ...defaultVar },
    os: { ...defaultVar },
    language: { ...defaultVar },
    viewport: { ...defaultVar },
    themePreference: { ...defaultVar },
    connectionType: { collect: true, expose: false },
    referrer: { ...defaultVar },
    isBot: { ...defaultVar },
  });

  // Cookie-based variables (require enableVisitorTracking)
  const [cookieVariables, setCookieVariables] = useState({
    isFirstVisit: { ...defaultVar },
    visitCount: { ...defaultVar },
    firstVisitAt: { ...defaultVar },
    landingPage: { ...defaultVar },
  });

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
      if (privacySettings.advancedVariables) {
        setAdvancedVariables((prev) => ({
          ip: privacySettings.advancedVariables.ip ?? prev.ip,
          browser: privacySettings.advancedVariables.browser ?? prev.browser,
          os: privacySettings.advancedVariables.os ?? prev.os,
          language: privacySettings.advancedVariables.language ?? prev.language,
          viewport: privacySettings.advancedVariables.viewport ?? prev.viewport,
          themePreference: privacySettings.advancedVariables.themePreference ?? prev.themePreference,
          connectionType: privacySettings.advancedVariables.connectionType ?? prev.connectionType,
          referrer: privacySettings.advancedVariables.referrer ?? prev.referrer,
          isBot: privacySettings.advancedVariables.isBot ?? prev.isBot,
        }));
      }
      if (privacySettings.cookieVariables) {
        setCookieVariables((prev) => ({
          isFirstVisit: privacySettings.cookieVariables.isFirstVisit ?? prev.isFirstVisit,
          visitCount: privacySettings.cookieVariables.visitCount ?? prev.visitCount,
          firstVisitAt: privacySettings.cookieVariables.firstVisitAt ?? prev.firstVisitAt,
          landingPage: privacySettings.cookieVariables.landingPage ?? prev.landingPage,
        }));
      }
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
            <CardContent className="space-y-6">
              {isPrivacyLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading settings...
                </div>
              ) : (
                <>
                  {/* Section 1: Basic Variables (Always Available) */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Basic Variables (Always Available)
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        These variables are always collected and available in templates. No configuration needed.
                      </p>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">Variable</th>
                            <th className="text-center px-4 py-2 font-medium w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.country</code>
                              <div className="text-xs text-muted-foreground mt-1">Country name (e.g., Kuwait, USA)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Always On</span>
                            </td>
                          </tr>
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.city</code>
                              <div className="text-xs text-muted-foreground mt-1">City name (e.g., Kuwait City, Dubai)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Always On</span>
                            </td>
                          </tr>
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.timezone</code>
                              <div className="text-xs text-muted-foreground mt-1">UTC offset (e.g., +03:00, -05:00)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Always On</span>
                            </td>
                          </tr>
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.device</code>
                              <div className="text-xs text-muted-foreground mt-1">Device type: mobile, tablet, or desktop</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Always On</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <Separator />

                  {/* Section 2: Advanced Variables (Configurable) */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-semibold">⚙️ Advanced Variables</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Configure collection and exposure of extended visitor data. When "Expose" is enabled, variables appear in the @ picker.
                      </p>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">Variable</th>
                            <th className="text-center px-4 py-2 font-medium w-24">Collect</th>
                            <th className="text-center px-4 py-2 font-medium w-24">Expose</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* IP Address */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.ip</code>
                              <div className="text-xs text-muted-foreground mt-1">Visitor IP (privacy sensitive)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.ip.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, ip: { ...prev.ip, collect: c, expose: c ? prev.ip.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.ip.expose} disabled={!advancedVariables.ip.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, ip: { ...prev.ip, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Browser */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.browser</code>
                              <div className="text-xs text-muted-foreground mt-1">Chrome, Safari, Firefox, Edge</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.browser.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, browser: { ...prev.browser, collect: c, expose: c ? prev.browser.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.browser.expose} disabled={!advancedVariables.browser.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, browser: { ...prev.browser, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* OS */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.os</code>
                              <div className="text-xs text-muted-foreground mt-1">Windows, macOS, iOS, Android</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.os.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, os: { ...prev.os, collect: c, expose: c ? prev.os.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.os.expose} disabled={!advancedVariables.os.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, os: { ...prev.os, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Language */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.language</code>
                              <div className="text-xs text-muted-foreground mt-1">Browser language (en, ar)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.language.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, language: { ...prev.language, collect: c, expose: c ? prev.language.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.language.expose} disabled={!advancedVariables.language.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, language: { ...prev.language, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Viewport */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.viewport</code>
                              <div className="text-xs text-muted-foreground mt-1">Browser window size (1440x900)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.viewport.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, viewport: { ...prev.viewport, collect: c, expose: c ? prev.viewport.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.viewport.expose} disabled={!advancedVariables.viewport.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, viewport: { ...prev.viewport, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Theme Preference */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.themePreference</code>
                              <div className="text-xs text-muted-foreground mt-1">Dark/light mode preference</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.themePreference.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, themePreference: { ...prev.themePreference, collect: c, expose: c ? prev.themePreference.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.themePreference.expose} disabled={!advancedVariables.themePreference.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, themePreference: { ...prev.themePreference, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Connection Type */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.connectionType</code>
                              <div className="text-xs text-muted-foreground mt-1">Network type (4g, wifi)</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.connectionType.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, connectionType: { ...prev.connectionType, collect: c, expose: c ? prev.connectionType.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.connectionType.expose} disabled={!advancedVariables.connectionType.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, connectionType: { ...prev.connectionType, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Referrer */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.referrer</code>
                              <div className="text-xs text-muted-foreground mt-1">Referring URL</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.referrer.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, referrer: { ...prev.referrer, collect: c, expose: c ? prev.referrer.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.referrer.expose} disabled={!advancedVariables.referrer.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, referrer: { ...prev.referrer, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                          {/* Is Bot */}
                          <tr className="border-t">
                            <td className="px-4 py-3">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.isBot</code>
                              <div className="text-xs text-muted-foreground mt-1">Identify crawlers and bots</div>
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.isBot.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, isBot: { ...prev.isBot, collect: c, expose: c ? prev.isBot.expose : false } })); handlePrivacyChange(); }} />
                            </td>
                            <td className="text-center px-4 py-3">
                              <Switch checked={advancedVariables.isBot.expose} disabled={!advancedVariables.isBot.collect} onCheckedChange={(c) => { setAdvancedVariables(prev => ({ ...prev, isBot: { ...prev.isBot, expose: c } })); handlePrivacyChange(); }} />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <Separator />

                  {/* Section 3: Cookie-Based Variables (Repeat Visits) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-semibold">🍪 Cookie-Based Variables</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Track repeat visits using cookies. Enables first visit detection and visit counting.
                        </p>
                      </div>
                      <Switch
                        checked={enableVisitorTracking}
                        onCheckedChange={(checked) => { setEnableVisitorTracking(checked); handlePrivacyChange(); }}
                      />
                    </div>

                    {enableVisitorTracking && (
                      <>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-4 py-2 font-medium">Variable</th>
                                <th className="text-center px-4 py-2 font-medium w-24">Collect</th>
                                <th className="text-center px-4 py-2 font-medium w-24">Expose</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t">
                                <td className="px-4 py-3">
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.isFirstVisit</code>
                                  <div className="text-xs text-muted-foreground mt-1">Is this the first visit?</div>
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.isFirstVisit.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, isFirstVisit: { ...prev.isFirstVisit, collect: c, expose: c ? prev.isFirstVisit.expose : false } })); handlePrivacyChange(); }} />
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.isFirstVisit.expose} disabled={!cookieVariables.isFirstVisit.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, isFirstVisit: { ...prev.isFirstVisit, expose: c } })); handlePrivacyChange(); }} />
                                </td>
                              </tr>
                              <tr className="border-t">
                                <td className="px-4 py-3">
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.visitCount</code>
                                  <div className="text-xs text-muted-foreground mt-1">Total visit count</div>
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.visitCount.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, visitCount: { ...prev.visitCount, collect: c, expose: c ? prev.visitCount.expose : false } })); handlePrivacyChange(); }} />
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.visitCount.expose} disabled={!cookieVariables.visitCount.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, visitCount: { ...prev.visitCount, expose: c } })); handlePrivacyChange(); }} />
                                </td>
                              </tr>
                              <tr className="border-t">
                                <td className="px-4 py-3">
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.firstVisitAt</code>
                                  <div className="text-xs text-muted-foreground mt-1">First visit timestamp</div>
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.firstVisitAt.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, firstVisitAt: { ...prev.firstVisitAt, collect: c, expose: c ? prev.firstVisitAt.expose : false } })); handlePrivacyChange(); }} />
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.firstVisitAt.expose} disabled={!cookieVariables.firstVisitAt.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, firstVisitAt: { ...prev.firstVisitAt, expose: c } })); handlePrivacyChange(); }} />
                                </td>
                              </tr>
                              <tr className="border-t">
                                <td className="px-4 py-3">
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">visitor.landingPage</code>
                                  <div className="text-xs text-muted-foreground mt-1">Original landing page URL</div>
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.landingPage.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, landingPage: { ...prev.landingPage, collect: c, expose: c ? prev.landingPage.expose : false } })); handlePrivacyChange(); }} />
                                </td>
                                <td className="text-center px-4 py-3">
                                  <Switch checked={cookieVariables.landingPage.expose} disabled={!cookieVariables.landingPage.collect} onCheckedChange={(c) => { setCookieVariables(prev => ({ ...prev, landingPage: { ...prev.landingPage, expose: c } })); handlePrivacyChange(); }} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
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
                              How long to remember visitors (1-730 days)
                            </p>
                          </div>

                          <div className="flex items-start justify-between">
                            <div className="space-y-0.5">
                              <Label>Require cookie consent</Label>
                              <p className="text-xs text-muted-foreground">
                                Show consent before setting cookies (GDPR)
                              </p>
                            </div>
                            <Switch
                              checked={requireCookieConsent}
                              onCheckedChange={(checked) => { setRequireCookieConsent(checked); handlePrivacyChange(); }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <Separator />

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => savePrivacyMutation.mutate({
                        enableVisitorTracking,
                        cookieExpiryDays,
                        requireCookieConsent,
                        cookieVariables,
                        advancedVariables,
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
