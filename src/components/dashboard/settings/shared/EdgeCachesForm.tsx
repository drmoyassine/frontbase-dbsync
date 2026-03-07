/**
 * EdgeCachesForm
 * 
 * List + layout for named edge cache connections (Upstash, Redis, etc.).
 * Dialog and handlers extracted to EdgeCacheDialog + useEdgeCacheForm.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Trash2, Pencil, Loader2, Star, Shield, Zap, Cloud, Server,
} from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useEdgeCacheForm } from '@/hooks/useEdgeCacheForm';
import { EdgeCacheDialog } from './EdgeCacheDialog';

interface EdgeCachesFormProps {
    withCard?: boolean;
}

const PROVIDER_ICONS: Record<string, React.ElementType> = {
    upstash: Cloud,
    redis: Server,
    dragonfly: Server,
};

// Cache-specific icon
const CacheIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 2v4" /><path d="m16.24 7.76-2.12 2.12" /><path d="M20 12h-4" />
        <path d="m16.24 16.24-2.12-2.12" /><path d="M12 18v4" /><path d="m7.76 16.24 2.12-2.12" />
        <path d="M4 12h4" /><path d="m7.76 7.76 2.12 2.12" />
    </svg>
);

export const EdgeCachesForm: React.FC<EdgeCachesFormProps> = ({ withCard = false }) => {
    const hook = useEdgeCacheForm();
    const {
        caches, isLoading,
        openEdit, handleDelete, handleTest,
        testingId, deletingId,
    } = hook;

    const getProviderIcon = (provider: string) => {
        const Icon = PROVIDER_ICONS[provider] || CacheIcon;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Dialog receives all hook state/handlers as props
    const cacheDialog = <EdgeCacheDialog {...hook} />;

    // ─── Cache list ───
    const cacheList = (
        <div className="space-y-4">
            {caches.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <CacheIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Caches Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Add a cache to speed up edge responses.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {caches.map((cache) => (
                        <div key={cache.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                    {getProviderIcon(cache.provider)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-sm">{cache.name}</h4>
                                        <Badge variant="outline" className="text-xs">{cache.provider}</Badge>
                                        {cache.is_default && (
                                            <Badge variant="secondary" className="text-xs gap-1">
                                                <Star className="h-3 w-3" /> Default
                                            </Badge>
                                        )}
                                        {cache.is_system && (
                                            <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                                <Shield className="h-3 w-3" /> System
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">{cache.cache_url}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {cache.engine_count > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                        {cache.engine_count} engine{cache.engine_count > 1 ? 's' : ''}
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost" size="icon"
                                    onClick={() => handleTest(cache.id)}
                                    disabled={testingId === cache.id}
                                    title="Test connection"
                                >
                                    {testingId === cache.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!cache.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(cache)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    disabled={deletingId === cache.id}
                                                >
                                                    {deletingId === cache.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Trash2 className="h-4 w-4 text-destructive" />}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete "{cache.name}"?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This removes the cache connection from Frontbase. The actual cache is not affected.
                                                        {cache.engine_count > 0 && (
                                                            <span className="block mt-2 font-medium text-destructive">
                                                                ⚠ {cache.engine_count} edge engine{cache.engine_count > 1 ? 's' : ''} use this cache and will need to be reconfigured.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDelete(cache.id)}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CacheIcon className="h-5 w-5" />
                            Edge Caches
                        </CardTitle>
                        <CardDescription>
                            Manage edge cache connections for your deployment targets
                        </CardDescription>
                    </div>
                    {cacheDialog}
                </CardHeader>
                <CardContent>{cacheList}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <CacheIcon className="h-5 w-5" /> Edge Caches
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage edge cache connections for your deployment targets
                    </p>
                </div>
                {cacheDialog}
            </div>
            {cacheList}
        </div>
    );
};
