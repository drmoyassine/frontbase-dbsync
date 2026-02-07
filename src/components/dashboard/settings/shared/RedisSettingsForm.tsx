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
import { Loader2, Check, X, RefreshCw, Database, Info } from 'lucide-react';
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
                    {/* Enable Toggle (Top Level) */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-card text-card-foreground shadow-sm mb-6">
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

                    {/* Provider Selector */}
                    <div className={`space-y-3 transition-opacity ${!redisEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Label>Redis Provider</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => { setRedisType('self-hosted'); handleChange(); }}
                                className={`p-4 rounded-lg border-2 text-left transition-all ${redisType === 'self-hosted'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted hover:border-muted-foreground/30'
                                    }`}
                            >
                                <div className="font-medium">Local Host (Docker)</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Your bundled Redis instance
                                </p>
                            </button>
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
                                    Serverless cloud Redis
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
                            {redisUrl && redisToken && (
                                <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm">
                                    <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                                    <p className="text-muted-foreground text-xs">
                                        Pre-configured from your Docker setup. Test the connection to verify.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="redis-url">SRH Proxy URL</Label>
                                <Input
                                    id="redis-url"
                                    placeholder="http://redis-http:80"
                                    value={redisUrl}
                                    onChange={(e) => { setRedisUrl(e.target.value); handleChange(); }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="redis-token">SRH Token</Label>
                                <Input
                                    id="redis-token"
                                    type="password"
                                    placeholder="Your REDIS_TOKEN from .env"
                                    value={redisToken}
                                    onChange={(e) => { setRedisToken(e.target.value); handleChange(); }}
                                />
                                {redisType === 'self-hosted' && !redisToken && (
                                    <p className="text-xs text-amber-600">
                                        ⚠️ Configure REDIS_TOKEN in your .env file for auto-configuration
                                    </p>
                                )}
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



                    <div className={`grid grid-cols-2 gap-4 transition-opacity ${!redisEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
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
