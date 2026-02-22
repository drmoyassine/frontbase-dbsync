/**
 * RedisSettingsForm
 * 
 * Edge Caching configuration.
 * 
 * Layout:
 * 1. Local Redis status (read-only, always connected via Docker)
 * 2. TTL configuration (always editable)
 * 3. Optional Upstash upgrade section
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Check, X, RefreshCw, Zap, Info, ExternalLink, CheckCircle2, Cloud } from 'lucide-react';
import { useRedisSettings } from '../hooks/useRedisSettings';

interface RedisSettingsFormProps {
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
        hasLocalRedis,
    } = useRedisSettings();

    const isUpstash = redisType === 'upstash';
    const isUpstashConnected = isUpstash && !!redisUrl && !!redisToken;

    const handleUpstashToggle = (enabled: boolean) => {
        if (enabled) {
            setRedisType('upstash');
            setRedisEnabled(true);
        } else {
            setRedisType('self-hosted');
            setRedisEnabled(true); // Keep caching on with local Redis
        }
        handleChange();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const formContent = (
        <div className="space-y-6">
            {/* Redis Status */}
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${isUpstashConnected || hasLocalRedis
                ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                : "bg-muted/30 border-muted-foreground/20"
                }`}>
                {isUpstashConnected || hasLocalRedis ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                    <Info className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1">
                    <p className="text-sm font-medium">
                        {isUpstashConnected ? 'Upstash Redis connected'
                            : hasLocalRedis ? 'Local Redis connected'
                                : 'No Edge Cache Configured'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {isUpstashConnected ? 'Using managed serverless Redis for edge caching'
                            : hasLocalRedis ? 'Bundled Redis instance from your Docker setup'
                                : 'Configure Upstash below to enable edge caching for your users'}
                    </p>
                </div>
                {hasLocalRedis && !isUpstash && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={testConnection}
                        disabled={isTesting}
                    >
                        {isTesting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                    </Button>
                )}
            </div>

            {/* Test Result */}
            {testResult && (
                <Alert variant={testResult.success ? 'default' : 'destructive'}>
                    {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    <AlertDescription>{testResult.message}</AlertDescription>
                </Alert>
            )}

            {/* TTL Configuration — always visible */}
            <div className="space-y-4">
                <Label className="text-base">Cache TTL</Label>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="ttl-data" className="text-sm font-normal">Data Cache (seconds)</Label>
                        <Input
                            id="ttl-data"
                            type="number"
                            value={cacheTtlData}
                            onChange={(e) => { setCacheTtlData(parseInt(e.target.value)); handleChange(); }}
                        />
                        <p className="text-xs text-muted-foreground">How long to cache record data</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ttl-count" className="text-sm font-normal">Count Cache (seconds)</Label>
                        <Input
                            id="ttl-count"
                            type="number"
                            value={cacheTtlCount}
                            onChange={(e) => { setCacheTtlCount(parseInt(e.target.value)); handleChange(); }}
                        />
                        <p className="text-xs text-muted-foreground">How long to cache record counts</p>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Upstash Upgrade Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <Label htmlFor="upstash-toggle" className="text-base">Connect Upstash</Label>
                            <p className="text-sm text-muted-foreground">
                                Serverless Redis for globally distributed edge caching
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="upstash-toggle"
                        checked={isUpstash}
                        onCheckedChange={handleUpstashToggle}
                    />
                </div>

                {isUpstash && (
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

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={testConnection}
                            disabled={isTesting || !redisUrl || !redisToken}
                        >
                            {isTesting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Testing...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Test Connection
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
                <Button
                    onClick={save}
                    disabled={!hasChanges || isSaving}
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : saveSuccess ? (
                        <>
                            <Check className="mr-2 h-4 w-4" />
                            Saved
                        </>
                    ) : (
                        'Save Changes'
                    )}
                </Button>

                {isUpstash && (
                    <Button variant="ghost" size="sm" asChild>
                        <a href="https://upstash.com" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Upstash Console
                        </a>
                    </Button>
                )}
            </div>
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Edge Caching
                    </CardTitle>
                    <CardDescription>
                        Redis-powered caching for fast data loading across your pages
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
}
