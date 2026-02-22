/**
 * RedisSettingsForm
 * 
 * Simplified Redis cache configuration.
 * 
 * Pattern: Local Redis works by default (from Docker or env var).
 * Users can optionally connect Upstash to override with a managed cloud instance.
 * Mirrors the Turso Settings pattern.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Check, X, RefreshCw, Database, Info, ExternalLink } from 'lucide-react';
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
    } = useRedisSettings();

    // Is this an Upstash override or using local Redis?
    const isUpstash = redisType === 'upstash';

    // Toggle between local Redis and Upstash
    const handleUpstashToggle = (enabled: boolean) => {
        if (enabled) {
            setRedisType('upstash');
            setRedisEnabled(true);
        } else {
            setRedisType('self-hosted');
            // Keep redis enabled — it'll use local Redis
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
            {/* Enable/Disable Caching */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label htmlFor="redis-enabled" className="text-base">Enable Caching</Label>
                    <p className="text-sm text-muted-foreground">
                        {redisEnabled
                            ? isUpstash
                                ? 'Using Upstash Redis (cloud)'
                                : 'Using local Redis (Docker)'
                            : 'When disabled, all data is fetched directly from the source'
                        }
                    </p>
                </div>
                <Switch
                    id="redis-enabled"
                    checked={redisEnabled}
                    onCheckedChange={(checked) => { setRedisEnabled(checked); handleChange(); }}
                />
            </div>

            {redisEnabled && (
                <>
                    {/* Upstash Override Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="upstash-toggle" className="text-base">Use Upstash</Label>
                            <p className="text-sm text-muted-foreground">
                                Override local Redis with a managed Upstash instance
                            </p>
                        </div>
                        <Switch
                            id="upstash-toggle"
                            checked={isUpstash}
                            onCheckedChange={handleUpstashToggle}
                        />
                    </div>

                    {/* Upstash Credentials (only shown when Upstash is enabled) */}
                    {isUpstash && (
                        <>
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
                        </>
                    )}

                    {/* Local Redis info */}
                    {!isUpstash && (
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                Using the bundled Redis from your Docker setup. No additional configuration needed.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Test Result */}
                    {testResult && (
                        <Alert variant={testResult.success ? 'default' : 'destructive'}>
                            {testResult.success ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                <X className="h-4 w-4" />
                            )}
                            <AlertDescription>{testResult.message}</AlertDescription>
                        </Alert>
                    )}

                    <Separator />

                    {/* TTL Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="ttl-data">Data Cache TTL (seconds)</Label>
                            <Input
                                id="ttl-data"
                                type="number"
                                value={cacheTtlData}
                                onChange={(e) => { setCacheTtlData(parseInt(e.target.value)); handleChange(); }}
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
                            />
                            <p className="text-xs text-muted-foreground">How long to cache record counts</p>
                        </div>
                    </div>
                </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
                {redisEnabled && (
                    <Button
                        variant="outline"
                        onClick={testConnection}
                        disabled={isTesting || (!isUpstash ? false : (!redisUrl || !redisToken))}
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
                )}

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
                        <Database className="h-5 w-5" />
                        Redis Cache Configuration
                    </CardTitle>
                    <CardDescription>
                        Configure Redis caching to improve data loading performance
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
}
