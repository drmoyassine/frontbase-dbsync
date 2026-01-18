/**
 * RedisSettingsForm
 * 
 * Reusable form component for Redis cache configuration.
 * Uses useRedisSettings hook for state management.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, X, RefreshCw, Database } from 'lucide-react';
import { useRedisSettings } from '../hooks/useRedisSettings';

interface RedisSettingsFormProps {
    /** Whether to wrap in a Card component */
    withCard?: boolean;
}

export function RedisSettingsForm({ withCard = false }: RedisSettingsFormProps) {
    const {
        redisUrl,
        redisToken,
        redisType,
        redisEnabled,
        cacheTtlData,
        cacheTtlCount,
        setRedisUrl,
        setRedisToken,
        setRedisType,
        setRedisEnabled,
        setCacheTtlData,
        setCacheTtlCount,
        isLoading,
        hasChanges,
        testResult,
        handleChange,
        save,
        testConnection,
        isSaving,
        isTesting,
        saveSuccess,
    } = useRedisSettings();

    const content = (
        <>
            {isLoading ? (
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
                                onClick={() => { setRedisType('upstash'); handleChange(); }}
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
                                onClick={() => { setRedisType('self-hosted'); handleChange(); }}
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
                                    onChange={(e) => { setRedisUrl(e.target.value); handleChange(); }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="redis-token">Upstash REST Token</Label>
                                <Input
                                    id="redis-token"
                                    type="password"
                                    placeholder="AX...your-upstash-token"
                                    value={redisToken}
                                    onChange={(e) => { setRedisToken(e.target.value); handleChange(); }}
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
                                    onChange={(e) => { setRedisUrl(e.target.value); handleChange(); }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="redis-token">SRH Token</Label>
                                <Input
                                    id="redis-token"
                                    type="password"
                                    placeholder="The SRH_TOKEN you set above"
                                    value={redisToken}
                                    onChange={(e) => { setRedisToken(e.target.value); handleChange(); }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={testConnection}
                            disabled={!redisUrl || !redisToken || isTesting}
                        >
                            {isTesting ? (
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
                            onCheckedChange={(checked) => { setRedisEnabled(checked); handleChange(); }}
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
                                onChange={(e) => { setCacheTtlData(parseInt(e.target.value)); handleChange(); }}
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
                                onChange={(e) => { setCacheTtlCount(parseInt(e.target.value)); handleChange(); }}
                                disabled={!redisEnabled}
                            />
                            <p className="text-xs text-muted-foreground">How long to cache record counts</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={save}
                            disabled={!hasChanges || isSaving}
                        >
                            {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Save Redis Settings
                        </Button>
                        {saveSuccess && (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                                <Check className="h-4 w-4" /> Saved
                            </span>
                        )}
                    </div>
                </>
            )}
        </>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Redis Cache Configuration
                    </CardTitle>
                    <CardDescription>
                        Configure Redis caching to improve data loading performance
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {content}
                </CardContent>
            </Card>
        );
    }

    return <div className="space-y-4">{content}</div>;
}
